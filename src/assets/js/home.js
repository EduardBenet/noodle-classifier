// Noodle of the day: one noodle from the catalogue, chosen by the date so it is
// stable for everyone for 24 hours and changes at midnight.

function todaySeed(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function showNoodleOfDayError(message) {
  const host = document.getElementById('noodle-of-the-day');
  if (!host) return;
  const p = document.createElement('p');
  p.className = 'notd-error';
  p.textContent = message;
  host.replaceChildren(p);
}

window.addEventListener('DOMContentLoaded', async () => {
  const host = document.getElementById('noodle-of-the-day');
  if (!host) return;

  let noodles;
  try {
    const res = await fetch('/api/noodles');
    // Without this an error payload sails through as `noodles`, and the
    // `.length` check below quietly treats it as "nothing to show".
    if (!res.ok) throw new Error(`/api/noodles responded ${res.status}`);
    noodles = await res.json();
  } catch (err) {
    console.error('[noodle-of-the-day] could not load the catalogue:', err);
    showNoodleOfDayError('Could not load today’s noodle.');
    return;
  }

  if (!Array.isArray(noodles)) {
    console.error('[noodle-of-the-day] expected an array, got:', noodles);
    showNoodleOfDayError('Could not load today’s noodle.');
    return;
  }
  if (!noodles.length) return;

  const noodle = noodles[todaySeed() % noodles.length];

  // This used to be one try/catch around the fetch AND the render, swallowing
  // everything — so a single malformed record (a null price throwing in
  // buildNoodleCard) blanked the section with no console output and no clue.
  // The render gets its own handler, and it names the noodle it choked on.
  try {
    const card = buildNoodleCard(noodle, { showDescription: true });
    card.addEventListener('click', () => showNoodleOverlay(noodle));
    host.replaceChildren(card);
  } catch (err) {
    console.error('[noodle-of-the-day] could not render noodle', noodle?.id, noodle, err);
    showNoodleOfDayError('Today’s noodle could not be displayed.');
  }
});
