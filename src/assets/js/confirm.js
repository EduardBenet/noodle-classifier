// The one confirmation dialog, driven by a promise.
//
// It used to be included per page, with each page adding its own permanent
// click handler to the OK button. That stopped working the moment a third
// caller arrived: the overlay is in base.html, so its Delete would have shared
// the dialog with the add form, and one OK click would have fired every
// listener attached to it — including add.js's, which saves unconditionally.
//
// Listeners are attached per call and removed on close, so exactly one caller
// ever owns the dialog, and the answer comes back where it was asked for.
function confirmAction({ message, label = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirm-dialog');
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');

    document.getElementById('confirm-message').textContent = message;
    ok.textContent = label;
    ok.classList.toggle('confirm-danger', danger);
    dialog.classList.add('visible');
    // The safe choice takes focus: this dialog is reached by a delete button,
    // and Enter should not confirm one.
    cancel.focus();

    const close = (answer) => {
      dialog.classList.remove('visible');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      dialog.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };

    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (e) => { if (e.target === dialog) close(false); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    dialog.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

// Anything with its own Escape handling — the overlay — has to stand down
// while this is open, or one keypress closes both.
function confirmIsOpen() {
  return document.getElementById('confirm-dialog')?.classList.contains('visible') ?? false;
}
