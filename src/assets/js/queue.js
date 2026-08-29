// Owner-only review queue. Each pending submission renders as an editable
// card: the owner corrects whatever the submitter got wrong, then approves
// (publishes to the catalogue and drops the queue entry) or rejects (drops it).
//
// Rating and spice are pre-filled with the submitter's own score and are the
// OWNER's rating — approval writes two rating rows, one each. Leave them alone
// and both scores match; change them and the submitter keeps what they sent,
// which the API reads from the stored submission rather than from this form.
//
// Every field is written with `.value`/`.textContent`, never innerHTML — this
// is the one page that renders text other people typed. The only innerHTML
// here builds the radio pickers, whose markup contains nothing but loop
// indices.

let queueCount = 0;
let pendingReject = null;

function queueField(labelText, field, value, opts = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'queue-field';

  const caption = document.createElement('span');
  caption.textContent = labelText;

  const input = document.createElement(opts.textarea ? 'textarea' : 'input');
  if (!opts.textarea) input.type = opts.type ?? 'text';
  if (opts.step) input.step = opts.step;
  if (opts.min != null) input.min = opts.min;
  if (opts.required) input.required = true;
  input.dataset.field = field;
  input.value = value ?? '';

  wrap.append(caption, input);

  // On an edit card, show the live value under any field the submitter
  // changed. Without it a proposed price is just a number with nothing to
  // judge it against. textContent — this is submitter-adjacent text.
  if (opts.was !== undefined) {
    const was = document.createElement('small');
    was.className = 'queue-was';
    was.textContent = `now: ${opts.was === '' ? '(empty)' : opts.was}`;
    wrap.append(was);
    wrap.classList.add('queue-field-changed');
  }

  return wrap;
}

// Mirrors normalise() in suggest-edit.js. Both sides must agree on what an
// absent field means, or a field the live document never had reads as
// `undefined` here and silently skips both the `now:` line and the highlight —
// exactly the case the diff exists for, a submitter filling in a description
// that was previously empty.
function normalise(field, value) {
  if (field === 'hasSoup') return !!value;
  if (field === 'keywords') return Array.isArray(value) ? value : (value ? [value] : []);
  if (field === 'price') return value === '' || value === null || value === undefined ? null : Number(value);
  return value ?? '';
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function changed(proposed, current, field) {
  return proposed[field] !== undefined
    && !sameValue(normalise(field, proposed[field]), normalise(field, current[field]));
}

function displayValue(field, value) {
  const v = normalise(field, value);
  if (field === 'hasSoup') return v ? 'yes' : 'no';
  if (field === 'keywords') return v.join(', ');
  return v === null ? '' : String(v);
}

// Mirrors the add form's markup so the pure-CSS `input:checked ~ label` fill
// works: 5→1 order, ids unique per card so `for=` targets the right group.
function ratingRow(idx, selected) {
  const row = document.createElement('div');
  row.className = 'rating-row';
  row.innerHTML = `<label>Rating:</label><div class="rating-stars">`
    + [5, 4, 3, 2, 1].map(i =>
      `<input type="radio" name="q-rating-${idx}" id="q-rating-${idx}-${i}" value="${i}">`
      + `<label for="q-rating-${idx}-${i}">★</label>`).join('')
    + `</div>`;
  const pre = row.querySelector(`input[value="${Number(selected)}"]`);
  if (pre) pre.checked = true;
  return row;
}

// "None" sits outside .spice-chilies — 0 is a real level, and keeping it out
// of the sibling chain means it highlights no chillies.
function spiceRow(idx, selected) {
  const row = document.createElement('div');
  row.className = 'spice-row';
  row.innerHTML = `<label>Spice:</label><div class="spice-picker">`
    + `<input type="radio" name="q-spice-${idx}" id="q-spice-${idx}-0" value="0" class="spice-none-input">`
    + `<label for="q-spice-${idx}-0" class="spice-none" title="Not spicy at all">None</label>`
    + `<div class="spice-chilies">`
    + [5, 4, 3, 2, 1].map(i =>
      `<input type="radio" name="q-spice-${idx}" id="q-spice-${idx}-${i}" value="${i}">`
      + `<label for="q-spice-${idx}-${i}">🌶️</label>`).join('')
    + `</div></div>`;
  const pre = row.querySelector(`input[value="${Number(selected)}"]`);
  if (pre) pre.checked = true;
  return row;
}

// Display handle when we captured one, opaque userId otherwise — entries
// queued before submittedByName existed still name someone, just less kindly.
function submittedLabel(sub) {
  const who = sub.submittedByName || sub.submittedBy || 'unknown';
  if (!sub.submittedAt) return `Suggested by ${who}`;
  const when = new Date(sub.submittedAt);
  const shown = isNaN(when) ? sub.submittedAt : when.toLocaleDateString();
  return `Suggested by ${who} · ${shown}`;
}

// Two shapes share this queue: a new-noodle suggestion, and an edit proposed
// against a noodle already in the index. They review differently enough to be
// built separately — an edit has no barcode and no rating, and every field it
// touches wants the live value beside it.
function buildQueueCard(sub, idx) {
  return sub.kind === 'edit' ? buildEditCard(sub, idx) : buildNewCard(sub, idx);
}

function cardHead(sub, n, badgeText) {
  const head = document.createElement('div');
  head.className = 'queue-card-head';

  const title = document.createElement('strong');
  title.textContent = n.name || '(unnamed)';

  const meta = document.createElement('small');
  meta.className = 'queue-meta';
  meta.textContent = submittedLabel(sub);

  head.append(title, meta);

  if (badgeText) {
    const badge = document.createElement('span');
    badge.className = 'queue-badge';
    badge.textContent = badgeText;
    head.prepend(badge);
  }

  // A thumbnail is most of the review: it is the fastest way to tell whether
  // the submitter attached the right product. A broken URL hides itself
  // rather than leaving the browser's broken-image glyph in the card.
  if (n.image) {
    const thumb = document.createElement('img');
    thumb.className = 'queue-thumb';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.addEventListener('error', () => { thumb.hidden = true; });
    thumb.src = n.image;
    head.prepend(thumb);
  }

  return head;
}

function cardActions(card) {
  const actions = document.createElement('div');
  actions.className = 'queue-actions';

  const approve = document.createElement('button');
  approve.type = 'submit';
  approve.className = 'queue-approve';
  approve.textContent = 'Approve';

  const reject = document.createElement('button');
  reject.type = 'button';
  reject.className = 'queue-reject';
  reject.textContent = 'Reject';
  reject.addEventListener('click', () => askReject(card));

  actions.append(approve, reject);
  return actions;
}

// An edit card renders the proposed value in every field and the live value
// underneath the ones that actually changed. Approving sends the whole set —
// the API merges it over the live document, so untouched fields round-trip
// unchanged and rating, spice and the aggregate are never involved.
function buildEditCard(sub, idx) {
  const proposed = sub.noodle ?? {};
  const current = sub.current ?? {};
  const merged = { ...current, ...proposed };

  const card = document.createElement('form');
  card.className = 'queue-card queue-card-edit';
  card.dataset.id = sub.id;
  card.dataset.kind = 'edit';
  card.dataset.targetId = sub.targetId ?? '';
  card.dataset.name = current.name || proposed.name || sub.targetId || 'this noodle';

  // The joined document is missing only if the noodle was deleted after the
  // edit was queued. Approving would 404, so say so and offer only Reject.
  if (!sub.current) {
    const gone = document.createElement('p');
    gone.className = 'queue-gone';
    gone.textContent = 'That noodle is no longer in the index — this edit can only be rejected.';
    // `merged` is only the proposed fields here, so it may carry no name at
    // all — fall back to the barcode rather than rendering "(unnamed)" on the
    // one card whose only action is destructive.
    card.append(cardHead(sub, { ...merged, name: card.dataset.name }, 'EDIT'), gone);
    const actions = cardActions(card);
    actions.querySelector('.queue-approve').remove();
    card.append(actions);
    return card;
  }

  const soup = document.createElement('div');
  soup.className = 'checkbox-row';
  const soupLabel = document.createElement('label');
  soupLabel.textContent = 'Comes with soup:';
  soupLabel.htmlFor = `q-soup-${idx}`;
  const soupInput = document.createElement('input');
  soupInput.type = 'checkbox';
  soupInput.id = `q-soup-${idx}`;
  soupInput.dataset.field = 'hasSoup';
  soupInput.checked = !!merged.hasSoup;
  soup.append(soupLabel, soupInput);
  if (changed(proposed, current, 'hasSoup')) {
    soup.classList.add('queue-field-changed');
    const was = document.createElement('small');
    was.className = 'queue-was';
    was.textContent = `now: ${displayValue('hasSoup', current.hasSoup)}`;
    soup.append(was);
  }

  // `was` is passed only where the submitter changed something, which is what
  // drives both the hint and the highlight.
  const hint = (field) =>
    changed(proposed, current, field) ? { was: displayValue(field, current[field]) } : {};

  card.append(
    cardHead(sub, merged, 'EDIT'),
    queueField('Name', 'name', merged.name, { required: true, ...hint('name') }),
    queueField('Brand', 'brand', merged.brand, { required: true, ...hint('brand') }),
    queueField('Price (£)', 'price', merged.price,
      { type: 'number', step: '0.01', min: 0, required: true, ...hint('price') }),
    queueField('Description', 'description', merged.description,
      { textarea: true, required: true, ...hint('description') }),
    soup,
    queueField('Keywords (comma-separated)', 'keywords',
      Array.isArray(merged.keywords) ? merged.keywords.join(', ') : merged.keywords,
      hint('keywords')),
    queueField('Image URL', 'image', merged.image, hint('image')),
    cardActions(card)
  );

  card.addEventListener('submit', (e) => {
    e.preventDefault();
    decide(card, 'approve');
  });

  return card;
}

function buildNewCard(sub, idx) {
  const n = sub.noodle ?? {};

  const card = document.createElement('form');
  card.className = 'queue-card';
  card.dataset.id = sub.id;
  card.dataset.kind = 'new';
  card.dataset.name = n.name || 'this suggestion';

  const soup = document.createElement('div');
  soup.className = 'checkbox-row';
  const soupLabel = document.createElement('label');
  soupLabel.textContent = 'Comes with soup:';
  soupLabel.htmlFor = `q-soup-${idx}`;
  const soupInput = document.createElement('input');
  soupInput.type = 'checkbox';
  soupInput.id = `q-soup-${idx}`;
  soupInput.dataset.field = 'hasSoup';
  soupInput.checked = !!n.hasSoup;
  soup.append(soupLabel, soupInput);

  card.append(
    cardHead(sub, n, 'NEW'),
    queueField('Product ID (barcode)', 'id', n.id, { required: true }),
    queueField('Name', 'name', n.name, { required: true }),
    queueField('Brand', 'brand', n.brand, { required: true }),
    queueField('Price (£)', 'price', n.price, { type: 'number', step: '0.01', min: 0, required: true }),
    queueField('Description', 'description', n.description, { textarea: true, required: true }),
    soup,
    ratingRow(idx, n.rating),
    spiceRow(idx, n.spicy),
    queueField('Keywords (comma-separated)', 'keywords',
      Array.isArray(n.keywords) ? n.keywords.join(', ') : n.keywords),
    queueField('Image URL', 'image', n.image),
    cardActions(card)
  );

  card.addEventListener('submit', (e) => {
    e.preventDefault();
    decide(card, 'approve');
  });

  return card;
}

// null rather than 0 when nothing is picked — 0 is a real spice level, so the
// API defaults an absent score while preserving a deliberate "not spicy".
function pickedScore(card, group) {
  const checked = card.querySelector(`input[name^="q-${group}-"]:checked`);
  return checked ? Number(checked.value) : null;
}

// An edit card has no barcode, no rating and no spice — approving it sends
// only the factual fields, which the API merges over the live document.
function collectEdit(card) {
  const val = (field) => card.querySelector(`[data-field="${field}"]`).value;
  return {
    name: val('name'),
    brand: val('brand'),
    keywords: val('keywords').split(',').map(k => k.trim()).filter(Boolean),
    description: val('description'),
    hasSoup: card.querySelector('[data-field="hasSoup"]').checked,
    price: parseFloat(val('price')),
    image: val('image')
  };
}

function collectNoodle(card) {
  const val = (field) => card.querySelector(`[data-field="${field}"]`).value;
  return {
    id: val('id').trim(),
    name: val('name'),
    brand: val('brand'),
    keywords: val('keywords').split(',').map(k => k.trim()).filter(Boolean),
    description: val('description'),
    hasSoup: card.querySelector('[data-field="hasSoup"]').checked,
    price: parseFloat(val('price')),
    rating: pickedScore(card, 'rating'),
    spicy: pickedScore(card, 'spice'),
    image: val('image')
  };
}

async function decide(card, action) {
  const buttons = card.querySelectorAll('button');
  buttons.forEach(b => { b.disabled = true; });

  const isEdit = card.dataset.kind === 'edit';
  const body = { id: card.dataset.id, action };
  if (action === 'approve') {
    // kind and targetId ride along so a double-clicked Approve still resolves
    // correctly after the first click deleted the queue entry.
    body.kind = isEdit ? 'edit' : 'new';
    body.noodle = isEdit ? collectEdit(card) : collectNoodle(card);
    if (isEdit) body.targetId = card.dataset.targetId;
  }

  let res;
  try {
    res = await fetch('/api/submissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    showToast('Network error — nothing changed.', 'error');
    buttons.forEach(b => { b.disabled = false; });
    return;
  }

  if (!res.ok) {
    const msg = res.status === 401 ? 'Your session expired — sign in again.'
      : res.status === 403 ? 'Owner access only.'
        : `Error ${res.status} — nothing changed.`;
    showToast(msg, 'error');
    buttons.forEach(b => { b.disabled = false; });
    return;
  }

  card.remove();
  queueCount--;
  updateEmptyState();
  const label = action === 'approve'
    ? (isEdit ? `Edit to "${body.noodle.name}" applied.` : `"${body.noodle.name}" is in the index.`)
    : (isEdit ? 'Edit rejected.' : 'Suggestion rejected.');
  showToast(label, 'success');
}

// Reject deletes the submission outright, and nothing else records it — worth
// a confirmation, unlike approve which publishes what is on screen.
function askReject(card) {
  pendingReject = card;
  document.getElementById('confirm-message').textContent = card.dataset.kind === 'edit'
    ? `Reject the edit to "${card.dataset.name}"? The noodle is left as it is and the edit is deleted.`
    : `Reject "${card.dataset.name}"? The suggestion is deleted.`;
  document.getElementById('confirm-dialog').classList.add('visible');
}

function closeConfirm() {
  document.getElementById('confirm-dialog').classList.remove('visible');
  pendingReject = null;
}

function updateEmptyState() {
  document.getElementById('queue-empty').hidden = queueCount > 0;
}

async function loadQueue() {
  const list = document.getElementById('queue-list');

  let submissions;
  try {
    const res = await fetch('/api/submissions');
    if (!res.ok) throw new Error(res.status);
    submissions = await res.json();
  } catch {
    showToast('Could not load the queue.', 'error');
    queueCount = 0;
    updateEmptyState();
    return;
  }

  // Oldest first: the queue is a backlog, so the longest wait is reviewed
  // first. Entries predating submittedAt sort to the top.
  submissions.sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));

  queueCount = submissions.length;
  list.replaceChildren(...submissions.map(buildQueueCard));
  updateEmptyState();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirm-ok').addEventListener('click', () => {
    const card = pendingReject;
    closeConfirm();
    if (card) decide(card, 'reject');
  });
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);

  loadQueue();
});
