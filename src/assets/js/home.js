window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("/api/noodles");
    const noodles = await res.json();
    if (!noodles.length) return;

    const today = new Date();
    const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const noodle = noodles[daySeed % noodles.length];

    const card = buildNoodleCard(noodle, { showDescription: true });
    card.addEventListener('click', () => showNoodleOverlay(noodle));
    document.getElementById("noodle-of-the-day").replaceChildren(card);
  } catch (_) {
    // noodle of the day is optional — fail silently
  }
});
