// The caller's own rated noodles. /api/ratings returns each noodle already
// joined with its aggregate plus myRating/mySpicy.

let myNoodles = [];

function myScoreHTML(noodle) {
  return `
    <span class="my-score-label">You</span>
    <span class="stars has-tip" ${scoreTipAttrs(`Your rating: ${formatScore(noodle.myRating)} out of 5`)}>${meterHTML(noodle.myRating, '★')}</span>
    <span class="spice has-tip" ${scoreTipAttrs(`Your spice: ${formatScore(noodle.mySpicy)} out of 5`)}>${meterHTML(noodle.mySpicy, '🌶️')}</span>
  `;
}

function sortMine(items) {
  const [field, dir] = (document.getElementById('sort-by')?.value ?? 'ratedAt-desc').split('-');
  const asc = dir === 'asc';
  return [...items].sort((a, b) => {
    if (field === 'ratedAt') {
      // Rows written before ratedAt existed sort last.
      return (b.ratedAt ?? '').localeCompare(a.ratedAt ?? '');
    }
    const av = a[field] ?? 0, bv = b[field] ?? 0;
    return asc ? av - bv : bv - av;
  });
}

function renderMine() {
  const container = document.getElementById('noodle-list');
  container.innerHTML = '';
  document.getElementById('mylist-empty').hidden = myNoodles.length > 0;

  sortMine(myNoodles).forEach(noodle => {
    const card = buildNoodleCard(noodle, { showDescription: true });

    const mine = document.createElement('div');
    mine.className = 'my-score-row';
    mine.innerHTML = myScoreHTML(noodle);
    wireScoreTips(mine);
    card.querySelector('.card-content').append(mine);

    card.addEventListener('click', () => showNoodleOverlay(noodle));
    container.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('sort-by').addEventListener('change', renderMine);

  try {
    const res = await fetch('/api/ratings');
    if (!res.ok) throw new Error(res.status);
    myNoodles = await res.json();
  } catch {
    myNoodles = [];
  }
  renderMine();

  // Re-rating from the overlay should update this page's own scores too.
  window.refreshNoodleCards = () => renderMine();
});
