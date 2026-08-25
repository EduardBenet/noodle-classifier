// Edit suggestions from signed-in non-owners. Prefills the live values for a
// noodle, and POSTs whatever the visitor changed to /api/submissions as an
// `edit` submission — the owner approves it from the same review queue that
// handles new-noodle suggestions.
//
// Rating and spice are absent on purpose: they are an opinion, not a fact about
// the product, and every signed-in user can already set their own from the
// rating widget in the overlay.

// Mirrors EDITABLE_FIELDS in api/src/lib/noodle.js. The API whitelists on its
// own account — this copy only decides what the form sends.
const EDIT_FIELDS = ['name', 'brand', 'price', 'description', 'keywords', 'hasSoup', 'image'];

let target = null;

function readField(field) {
  const el = document.getElementById(field);
  if (field === 'hasSoup') return el.checked;
  if (field === 'price') return parseFloat(el.value);
  if (field === 'keywords') return el.value.split(',').map(k => k.trim()).filter(Boolean);
  return el.value;
}

function currentValue(field) {
  const v = target?.[field];
  if (field === 'keywords') return Array.isArray(v) ? v : (v ? [v] : []);
  return v;
}

// Compared as JSON so keywords arrays and the hasSoup boolean behave. Sending
// only what changed keeps the queue card honest: every field the owner sees
// highlighted is one the submitter actually touched.
function changedFields() {
  const out = {};
  for (const field of EDIT_FIELDS) {
    const next = readField(field);
    if (JSON.stringify(next) !== JSON.stringify(currentValue(field))) out[field] = next;
  }
  return out;
}

function fillForm(n) {
  document.getElementById('name').value = n.name ?? '';
  document.getElementById('brand').value = n.brand ?? '';
  document.getElementById('price').value = n.price ?? '';
  document.getElementById('description').value = n.description ?? '';
  document.getElementById('keywords').value =
    Array.isArray(n.keywords) ? n.keywords.join(', ') : (n.keywords ?? '');
  document.getElementById('image').value = n.image ?? '';
  document.getElementById('hasSoup').checked = !!n.hasSoup;

  // textContent, not innerHTML — this is catalogue text and it costs nothing
  // to render it safely.
  const head = document.getElementById('edit-target');
  head.textContent = n.brand ? `${n.name} (${n.brand})` : (n.name ?? n.id);
}

function showMissing() {
  document.getElementById('edit-form').hidden = true;
  document.getElementById('edit-intro').hidden = true;
  document.getElementById('edit-missing').hidden = false;
}

async function sendEdit() {
  const btn = document.getElementById('edit-btn');
  const changes = changedFields();

  if (!Object.keys(changes).length) {
    showToast('Nothing changed yet — edit a field first.', 'error');
    return;
  }

  btn.disabled = true;
  let res;
  try {
    res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'edit', targetId: target.id, noodle: changes })
    });
  } catch {
    showToast('Network error — edit not sent.', 'error');
    btn.disabled = false;
    return;
  }
  btn.disabled = false;

  if (res.status === 401) {
    showToast('Please sign in to suggest an edit.', 'error');
    return;
  }
  if (res.status === 404) {
    showMissing();
    return;
  }
  if (!res.ok) {
    showToast(`Error ${res.status} — edit not sent.`, 'error');
    return;
  }

  showToast('Thanks! Your edit is waiting for review.', 'success');
  // The form now matches what was sent, so re-sending would report "nothing
  // changed" rather than queueing a second identical edit.
  target = { ...target, ...changes };
}

async function loadTarget(id) {
  let items;
  try {
    const res = await fetch(`/api/noodles?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(res.status);
    items = await res.json();
  } catch {
    showToast('Could not load that noodle.', 'error');
    showMissing();
    return;
  }

  if (!items.length) {
    showMissing();
    return;
  }

  target = items[0];
  fillForm(target);
  document.getElementById('edit-form').hidden = false;
}

document.addEventListener('DOMContentLoaded', () => {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    showMissing();
    return;
  }
  loadTarget(id);

  document.getElementById('edit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendEdit();
  });
});
