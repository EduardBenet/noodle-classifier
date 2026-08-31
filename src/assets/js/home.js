// Noodle of the day: one noodle from the catalogue, chosen by the date so it is
// stable for everyone for 24 hours and changes at midnight.
//
// The choosing happens in the API now. This page used to download the whole
// catalogue — every description, image URL and Cosmos system field — to keep a
// single row and discard the rest.

// The caller's own calendar day, not the server's: the changeover should be
// local midnight, and a UTC day would move it to 01:00 for half the year here.
function todayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function showNoodleOfDayError(message) {
  const host = document.getElementById('noodle-of-the-day');
  if (!host) return;
  const p = document.createElement('p');
  p.className = 'notd-error';
  p.textContent = message;
  host.replaceChildren(p);
}

// Today's pick is chosen from the catalogue by a date seed, so deleting it
// does not just remove a card — it changes which noodle today's is. Reloading
// is the whole of the fix.
window.noodleRemoved = () => location.reload();

window.addEventListener('DOMContentLoaded', async () => {
  const host = document.getElementById('noodle-of-the-day');
  if (!host) return;

  let noodle;
  try {
    const res = await fetch(`/api/noodles?ofTheDay=${todayKey()}`);
    // An empty catalogue answers 404, which is not an error worth a console
    // trace — there is simply nothing to show yet.
    if (res.status === 404) return;
    if (!res.ok) throw new Error(`/api/noodles?ofTheDay= responded ${res.status}`);
    noodle = await res.json();
  } catch (err) {
    console.error('[noodle-of-the-day] could not load today’s noodle:', err);
    showNoodleOfDayError('Could not load today’s noodle.');
    return;
  }

  // The render gets its own handler, and it names the noodle it choked on: a
  // single malformed record — a null price throwing in buildNoodleCard — used
  // to blank this section with no console output and no clue.
  try {
    const card = buildNoodleCard(noodle, { showDescription: true });
    card.addEventListener('click', () => showNoodleOverlay(noodle));
    host.replaceChildren(card);
  } catch (err) {
    console.error('[noodle-of-the-day] could not render noodle', noodle?.id, noodle, err);
    showNoodleOfDayError('Today’s noodle could not be displayed.');
  }
});
