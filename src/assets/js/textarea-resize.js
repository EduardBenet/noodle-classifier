// Replaces the browser's native resize grip on textareas with a full-width
// grab bar underneath.
//
// The native grip is a ~15px corner target that also demands horizontal
// precision, which makes it close to unusable with a thumb on Android — and on
// several mobile browsers it is not rendered at all. A bar spanning the field
// needs no horizontal aim, so the whole width of the form is the target.
//
// Pointer Events rather than touch/mouse pairs: one code path covers finger,
// stylus and mouse, and setPointerCapture keeps the drag alive when the finger
// slides outside the bar.

const TA_MIN_HEIGHT = 72;   // px — matches the 4.5rem min-height in the CSS
const TA_KEY_STEP = 16;

function enhanceTextarea(textarea) {
  if (textarea.dataset.resizable === 'on') return;
  textarea.dataset.resizable = 'on';

  const wrap = document.createElement('div');
  wrap.className = 'ta-wrap';
  textarea.parentNode.insertBefore(wrap, textarea);
  wrap.appendChild(textarea);

  // A real button so it is reachable by keyboard and announced; type="button"
  // because every one of these sits inside a form that must not submit.
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'ta-handle';
  handle.setAttribute('aria-label', 'Resize the text box — drag, or use the up and down arrow keys');
  wrap.appendChild(handle);

  const setHeight = (px) => {
    textarea.style.height = `${Math.max(TA_MIN_HEIGHT, px)}px`;
  };

  let startY = 0;
  let startHeight = 0;

  handle.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    startHeight = textarea.offsetHeight;
    handle.setPointerCapture(e.pointerId);
    // Without this the browser claims the gesture and scrolls the page
    // instead, which is the other half of why dragging felt broken on a phone.
    e.preventDefault();
  });

  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    setHeight(startHeight + (e.clientY - startY));
  });

  const endDrag = (e) => {
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? TA_KEY_STEP : -TA_KEY_STEP;
    setHeight(textarea.offsetHeight + step);
  });
}

// Exposed so pages that build textareas after load — the review queue renders
// its cards from a fetch — can enhance them too.
function enhanceTextareas(root = document) {
  root.querySelectorAll('textarea').forEach(enhanceTextarea);
}
window.enhanceTextareas = enhanceTextareas;

document.addEventListener('DOMContentLoaded', () => enhanceTextareas());
