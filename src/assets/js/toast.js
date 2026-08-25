// Toast notifications. Split out of noodle-form.js so the pages that only need
// to tell the user something — the review queue, the suggest-edit form — do not
// also ship the barcode scanner and the Open Food Facts lookup, neither of
// which they have any markup for.

let toastTimer;
function showToast(message, type) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.className = `toast-${type}`;
  el.hidden = false;

  if (type === 'error') {
    el.innerHTML = `${message} <button onclick="this.parentElement.hidden=true" aria-label="Dismiss">&times;</button>`;
  } else {
    el.textContent = message;
    toastTimer = setTimeout(() => {
      el.classList.add('toast-fade');
      setTimeout(() => { el.hidden = true; el.classList.remove('toast-fade'); }, 400);
    }, 1000);
  }
}
