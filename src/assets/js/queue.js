// Owner-only review queue. Each pending submission renders as an editable
// card: the owner corrects whatever the submitter got wrong and assigns the
// rating and spice the submit form never asks for, then approves (publishes to
// the catalogue and drops the queue entry) or rejects (drops it).
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
  return wrap;
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

function submittedLabel(sub) {
  const who = sub.submittedBy || 'unknown';
  if (!sub.submittedAt) return `Suggested by ${who}`;
  const when = new Date(sub.submittedAt);
  const shown = isNaN(when) ? sub.submittedAt : when.toLocaleDateString();
  return `Suggested by ${who} · ${shown}`;
}

function buildQueueCard(sub, idx) {
  const n = sub.noodle ?? {};

  const card = document.createElement('form');
  card.className = 'queue-card';
  card.dataset.id = sub.id;
  card.dataset.name = n.name || 'this suggestion';

  const head = document.createElement('div');
  head.className = 'queue-card-head';

  const title = document.createElement('strong');
  title.textContent = n.name || '(unnamed)';

  const meta = document.createElement('small');
  meta.className = 'queue-meta';
  meta.textContent = submittedLabel(sub);

  head.append(title, meta);

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

  card.append(
    head,
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
    actions
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

  const body = { id: card.dataset.id, action };
  if (action === 'approve') body.noodle = collectNoodle(card);

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
  showToast(action === 'approve'
    ? `"${body.noodle.name}" is in the index.`
    : 'Suggestion rejected.', 'success');
}

// Reject deletes the submission outright, and nothing else records it — worth
// a confirmation, unlike approve which publishes what is on screen.
function askReject(card) {
  pendingReject = card;
  document.getElementById('confirm-message').textContent =
    `Reject "${card.dataset.name}"? The suggestion is deleted.`;
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
