const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { parsePrincipal } = require('../lib/auth');
const { splitScores, pickEditable } = require('../lib/noodle');
const {
  submissions: submissionsContainer,
  packages: packagesContainer
} = require('../lib/cosmos');
const { applyRating, keepScores, parseScore, RATING_MIN, SPICY_MIN } = require('../lib/rating');

// A point read that distinguishes "not there" from "could not tell". Swallowing
// every error made a throttled read indistinguishable from a deleted document,
// which downstream turned into destroyed data: an edit whose target looked
// deleted could only be rejected, and an approval whose submission looked
// missing dropped the submitter's rating and deleted the queue entry anyway.
async function readOrNull(container, id, partitionKey = id) {
  try {
    const { resource } = await container.item(id, partitionKey).read();
    return resource ?? null;
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
}

app.http('submissions', {
  methods: ['GET', 'POST', 'PUT'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const user = parsePrincipal(request);
    if (!user) return { status: 401, jsonBody: { error: 'Unauthorised' } };

    const isOwner = user.userRoles?.includes('owner');

    if (request.method === 'POST') {
      const data = await request.json();

      // An edit suggestion is a different animal from a new-noodle suggestion:
      // it targets a noodle that already exists, carries only factual fields,
      // and asks for no rating — the submitter already has the rating widget
      // for that. Approving one must not disturb the ratings or the aggregate.
      if (data.kind === 'edit') {
        const targetId = String(data.targetId ?? '').trim();
        if (!targetId) return { status: 400, jsonBody: { error: 'targetId is required for an edit' } };

        const target = await readOrNull(packagesContainer, targetId);
        if (!target) return { status: 404, jsonBody: { error: 'That noodle is not in the catalogue' } };

        const proposed = pickEditable(data.noodle ?? data);
        if (!Object.keys(proposed).length) {
          return { status: 400, jsonBody: { error: 'No editable fields supplied' } };
        }

        const editSubmission = {
          // Deterministic, not a UUID: one pending edit per user per noodle.
          // With items.upsert below, re-sending replaces the pending row rather
          // than queueing a duplicate — the form's local "nothing changed"
          // check resets on reload, so without this a reload-and-resend spams
          // the queue and costs a point read per stale row on every load.
          // Different users still get different rows.
          id: `${user.userId}_${targetId}`,
          kind: 'edit',
          targetId,
          submittedBy: user.userId,
          submittedByName: user.userDetails ?? null,
          submittedAt: new Date().toISOString(),
          noodle: proposed
        };
        await submissionsContainer.items.upsert(editSubmission);
        return { status: 201, jsonBody: { id: editSubmission.id } };
      }

      if (data.id) {
        const existing = await readOrNull(packagesContainer, data.id);
        if (existing) return { status: 409, jsonBody: { error: 'This noodle is already in the catalogue' } };
      }

      // The submitter's own score is the point of asking, so it is required and
      // bounded here rather than defaulted — a suggestion with no real opinion
      // behind it would seed a rating row the submitter never gave.
      const rating = parseScore(data.rating, RATING_MIN);
      const spicy = parseScore(data.spicy, SPICY_MIN);
      if (rating === null || spicy === null) {
        return { status: 400, jsonBody: { error: 'rating (1-5) and spicy (0-5) are required' } };
      }

      const submission = {
        id: randomUUID(),
        kind: 'new',
        // Two identity fields, deliberately. `submittedBy` is the opaque SWA
        // userId — the ratings partition key, so it is what approval writes the
        // submitter's rating against and must never change. `submittedByName`
        // is the provider's display handle, stored for the review queue only:
        // it can change (a renamed GitHub account, a new email) and is not safe
        // to key anything on.
        submittedBy: user.userId,
        submittedByName: user.userDetails ?? null,
        submittedAt: new Date().toISOString(),
        noodle: { ...data, rating, spicy }
      };
      await submissionsContainer.items.create(submission);
      return { status: 201, jsonBody: { id: submission.id } };
    }

    if (!isOwner) return { status: 403, jsonBody: { error: 'Forbidden' } };

    if (request.method === 'GET') {
      const { resources } = await submissionsContainer.items.query('SELECT * FROM c').fetchAll();

      // Join the live document onto every edit row. Without it the queue shows
      // a proposed price with nothing to compare it against, and the owner has
      // no way to tell a correction from a change that was already made. Point
      // reads, one per edit — the queue is a backlog, not a catalogue.
      await Promise.all(resources
        .filter(sub => sub.kind === 'edit' && sub.targetId)
        .map(async (sub) => {
          sub.current = await readOrNull(packagesContainer, sub.targetId);
        }));

      return { jsonBody: resources };
    }

    if (request.method === 'PUT') {
      const { id, action, noodle, kind: bodyKind, targetId: bodyTargetId } = await request.json();
      if (!id || !action) return { status: 400, jsonBody: { error: 'id and action are required' } };

      if (action === 'approve') {
        if (!noodle) return { status: 400, jsonBody: { error: 'noodle data required for approve' } };

        // Read the queued entry before it is deleted: the submitter's id, the
        // score THEY gave, and what the suggestion actually is all live here,
        // and none of it can be trusted from the request body — that is the
        // owner's edited copy of the form.
        const submission = await readOrNull(submissionsContainer, id);

        // The body is the fallback only for a double-clicked Approve, where the
        // first click already deleted the queue entry. This endpoint is
        // owner-only, so trusting the body there is a question of correctness,
        // not of privilege.
        const kind = submission?.kind ?? bodyKind ?? 'new';

        // An approved edit merges over the live document: rating, spicy and
        // every field outside the editable whitelist survive untouched, and no
        // rating is written, so the aggregate and ratingCount do not move.
        if (kind === 'edit') {
          const targetId = submission?.targetId ?? bodyTargetId;
          if (!targetId) return { status: 400, jsonBody: { error: 'targetId missing for an edit' } };

          const current = await readOrNull(packagesContainer, targetId);
          if (!current) return { status: 404, jsonBody: { error: 'That noodle is no longer in the catalogue' } };

          // IfMatch on the document just read. Without it, two approvals in
          // quick succession — or an owner edit through add.html while this
          // card sat open — silently lose the earlier write. `replace` rather
          // than `upsert` so the precondition is actually enforced.
          try {
            await packagesContainer.item(targetId, targetId).replace(
              { ...current, ...pickEditable(noodle) },
              { accessCondition: { type: 'IfMatch', condition: current._etag } }
            );
          } catch (err) {
            if (err.code === 412) {
              return {
                status: 409,
                jsonBody: { error: 'That noodle changed while you were reviewing — reload the queue and try again' }
              };
            }
            throw err;
          }

          await submissionsContainer.item(id, id).delete().catch(err => {
            if (err.code !== 404) throw err;
          });
          return { jsonBody: { ok: true } };
        }

        // The scores the owner sees in the queue are the submitter's opinion,
        // pre-filled and editable. They become ratings below; the document
        // stores only the product's facts.
        const { facts, rating: ownerRating, spicy: ownerSpicy } = splitScores(noodle);
        const approved = facts;
        // Without an id Cosmos assigns a GUID, producing a catalogue entry no
        // barcode lookup can ever reach — and its ratings would be keyed to
        // that invisible id too. Refuse rather than publish it.
        if (!approved.id) return { status: 400, jsonBody: { error: 'noodle.id is required to approve' } };

        // Sequential, not Promise.all: publishing must succeed before the
        // submission is dropped, or a failure loses the queue entry too.
        //
        // The same barcode can be queued twice, so this noodle may already
        // exist and carry community ratings. The queue form knows nothing about
        // those fields, so they are carried across rather than overwritten with
        // nothing — the scores are on this document now, not in a container of
        // their own that used to survive by accident.
        const existingNoodle = await readOrNull(packagesContainer, approved.id);
        await packagesContainer.items.upsert(keepScores(existingNoodle, approved));

        // Approval is "the owner adds the noodle, then the submitter rates it".
        // Two rating rows, written in that order. They carry the same score
        // unless the owner overrode the pre-filled queue fields, in which case
        // the submitter keeps what they actually submitted.
        //
        // applyRating rather than a blind aggregate upsert — if this noodle
        // already exists and carries community ratings (the same barcode can
        // be queued twice), overwriting would reset ratingCount to 1 and
        // discard every real rating.
        const ownerScore = parseScore(ownerRating, RATING_MIN);
        const ownerHeat = parseScore(ownerSpicy, SPICY_MIN);
        if (ownerScore !== null && ownerHeat !== null) {
          await applyRating({
            userId: user.userId,
            noodleId: approved.id,
            rating: ownerScore,
            spicy: ownerHeat
          });
        }

        const submitterId = submission?.submittedBy;
        const submittedRating = parseScore(submission?.noodle?.rating, RATING_MIN);
        const submittedSpicy = parseScore(submission?.noodle?.spicy, SPICY_MIN);

        // Skipped when the owner submitted it themselves (one person, one
        // rating), and when the queue entry predates the submit form asking
        // for a score — defaulting there would invent an opinion and inflate
        // ratingCount with it.
        if (submitterId && submitterId !== user.userId
            && submittedRating !== null && submittedSpicy !== null) {
          await applyRating({
            userId: submitterId,
            noodleId: approved.id,
            rating: submittedRating,
            spicy: submittedSpicy
          });
        }

        // A double-clicked Approve would otherwise 404 here and report a 500
        // for work that actually succeeded.
        await submissionsContainer.item(id, id).delete().catch(err => {
          if (err.code !== 404) throw err;
        });
        return { jsonBody: { ok: true } };
      }

      if (action === 'reject') {
        await submissionsContainer.item(id, id).delete();
        return { jsonBody: { ok: true } };
      }

      return { status: 400, jsonBody: { error: 'action must be approve or reject' } };
    }
  }
});
