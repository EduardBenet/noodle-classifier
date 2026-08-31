const SCORE_MAX = 5;

function formatScore(value) {
  return Number(value ?? 0).toFixed(1);
}

// Whether anyone has actually scored this noodle. There used to be no way to
// ask: the document carried the owner's own rating as a fallback, so every
// noodle looked rated and an unrated one claimed a 3.0 nobody had given it.
function isRated(noodle) {
  return (noodle?.ratingCount ?? 0) > 0;
}

// The community average. Zero for an unrated noodle, so arithmetic and sorting
// stay simple — but ask isRated() before showing it, because zero here means
// "nobody has said" and not "everybody said nothing".
function communityRating(noodle) {
  return noodle.avgRating ?? 0;
}

function communitySpicy(noodle) {
  return noodle.avgSpicy ?? 0;
}

// Shown wherever the meters would go for a noodle nobody has rated. Reads as an
// invitation rather than a fault, because that is what it is.
function unratedHTML() {
  return '<span class="unrated">Not yet rated</span>';
}

// Two identical glyph rows stacked; the coloured one is clipped to a percentage
// width so a 3.7 average fills 74% of the row rather than snapping to a whole
// glyph.
function meterHTML(value, glyph) {
  const pct = Math.min(Math.max(Number(value) || 0, 0), SCORE_MAX) / SCORE_MAX * 100;
  const row = glyph.repeat(SCORE_MAX);
  return `<span class="rating-meter"><span class="rating-meter-track">${row}</span><span class="rating-meter-fill" style="width:${pct}%">${row}</span></span>`;
}

function countLabel(ratingCount) {
  if (ratingCount == null) return '';
  return ratingCount === 1 ? '1 rating' : `${ratingCount} ratings`;
}

function scoreTitle(label, value, ratingCount) {
  const count = countLabel(ratingCount);
  return `${label}: ${formatScore(value)} out of ${SCORE_MAX}${count ? ` · ${count}` : ''}`;
}

function escapeAttr(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The exact score is a CSS tooltip rather than a native `title`, because
// `title` never fires on touch devices. Hover shows it on a mouse; a tap
// toggles it everywhere.
function applyScoreTip(el, text) {
  el.classList.add('has-tip');
  el.dataset.tip = text;
  el.setAttribute('aria-label', text);
  el.tabIndex = 0;
}

// Deliberately no `class` here — callers own the class attribute, and a second
// one on the same tag would be dropped by the parser.
function scoreTipAttrs(text) {
  return `data-tip="${escapeAttr(text)}" aria-label="${escapeAttr(text)}" tabindex="0"`;
}

function closeScoreTips() {
  document.querySelectorAll('.has-tip.tip-open').forEach(el => el.classList.remove('tip-open'));
}

// Cards are themselves clickable, so a tap on the meter must not also open the
// overlay.
function wireScoreTips(root) {
  root.querySelectorAll('.has-tip').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = el.classList.contains('tip-open');
      closeScoreTips();
      if (!wasOpen) el.classList.add('tip-open');
    });
  });
}

document.addEventListener('click', closeScoreTips);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeScoreTips(); });

function ratingSpiceHTML(rating, spicy, ratingCount) {
  if (!(ratingCount > 0)) return unratedHTML();
  return `
    <div class="stars has-tip" ${scoreTipAttrs(scoreTitle('Rating', rating, ratingCount))}>${meterHTML(rating, '★')}</div>
    <div class="spice has-tip" ${scoreTipAttrs(scoreTitle('Spice', spicy, ratingCount))}>${meterHTML(spicy, '🌶️')}</div>
  `;
}

function buildNoodleCard(noodle, { showDescription = false } = {}) {
  const rating = communityRating(noodle);
  const spicy = communitySpicy(noodle);

  const img = document.createElement('img');
  img.src = noodle.image;
  img.alt = noodle.name;
  img.loading = 'lazy';

  const strong = document.createElement('strong');
  strong.textContent = noodle.name;
  // Parentheses come from CSS so the mobile layout can drop them when the
  // brand moves onto its own line.
  const brandSpan = document.createElement('span');
  brandSpan.className = 'brand';
  brandSpan.textContent = noodle.brand;
  const cardTitle = document.createElement('div');
  cardTitle.className = 'card-title';
  cardTitle.append(strong, ' ', brandSpan);

  const rated = isRated(noodle);

  const stars = document.createElement('div');
  stars.className = 'stars';
  if (rated) {
    applyScoreTip(stars, scoreTitle('Rating', rating, noodle.ratingCount));
    stars.innerHTML = meterHTML(rating, '★');
    const count = document.createElement('small');
    count.className = 'rating-count';
    count.textContent = `(${noodle.ratingCount})`;
    stars.append(' ', count);
  } else {
    stars.className = 'unrated';
    stars.textContent = 'Not yet rated';
  }

  const price = document.createElement('div');
  price.className = 'price';
  // The only field here that can throw: every other one goes through
  // textContent, which tolerates undefined, but `.toFixed` on a null or
  // missing price is a TypeError that takes down the whole card — and with it
  // any page rendering it. An approved edit that cleared the price field
  // stores null (parseFloat('') is NaN, which serialises to null), so this is
  // reachable from ordinary use, not just bad seed data.
  // Type-check BEFORE coercing. `Number(null)` is 0, so a bare
  // Number.isFinite check passes a null price straight through and prints
  // "£0.00" — a wrong number, which is worse than an obvious dash. Same trap
  // as parseScore in the API.
  const rawPrice = noodle.price;
  const priceNumber = typeof rawPrice === 'number' || (typeof rawPrice === 'string' && rawPrice.trim() !== '')
    ? Number(rawPrice)
    : NaN;
  price.textContent = Number.isFinite(priceNumber) ? `£${priceNumber.toFixed(2)}` : '—';

  const statsRow = document.createElement('div');
  statsRow.className = 'card-stats';

  // No spice meter on an unrated noodle either: the heat shown on a card is the
  // community's reading of it, not a property of the packet.
  if (rated) {
    const spice = document.createElement('div');
    spice.className = 'spice';
    applyScoreTip(spice, scoreTitle('Spice', spicy, noodle.ratingCount));
    spice.innerHTML = meterHTML(spicy, '🌶️');
    statsRow.append(stars, price, spice);
  } else {
    statsRow.append(stars, price);
  }

  const content = document.createElement('div');
  content.className = 'card-content';

  if (showDescription) {
    const desc = document.createElement('small');
    desc.textContent = noodle.description;
    content.append(cardTitle, statsRow, desc);
  } else {
    content.append(cardTitle, statsRow);
  }

  const card = document.createElement('div');
  card.className = 'card';
  card.append(img, content);
  wireScoreTips(card);
  return card;
}
