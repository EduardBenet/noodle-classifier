window.addEventListener("DOMContentLoaded", async () => {
  let noodles;
  try {
    const res = await fetch("/api/noodles");
    noodles = await res.json();
  } catch {
    return;
  }

  if (!noodles.length) return;

  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const fmt = (n) => n.toFixed(1);

  // Summary stats
  document.getElementById("stat-total").textContent = noodles.length;
  document.getElementById("stat-avg-rating").textContent = `${fmt(avg(noodles.map(n => n.rating)))} ★`;
  document.getElementById("stat-avg-spice").textContent = `${fmt(avg(noodles.map(n => n.spicy)))} 🌶️`;
  document.getElementById("stat-avg-price").textContent = `£${fmt(avg(noodles.map(n => n.price)))}`;

  const prices = noodles.map(n => n.price);
  document.getElementById("stat-price-range").textContent =
    `£${Math.min(...prices).toFixed(2)} – £${Math.max(...prices).toFixed(2)}`;

  const soups = noodles.filter(n => n.hasSoup).length;
  document.getElementById("stat-soup").textContent = `${soups} / ${noodles.length - soups}`;

  // Rating distribution
  const dist = [1, 2, 3, 4, 5].map(r => ({ stars: r, count: noodles.filter(n => n.rating === r).length }));
  const maxCount = Math.max(...dist.map(d => d.count));
  const distEl = document.getElementById("rating-dist");
  dist.reverse().forEach(({ stars, count }) => {
    const row = document.createElement("div");
    row.className = "dist-row";

    const label = document.createElement("span");
    label.className = "dist-label";
    label.textContent = "★".repeat(stars);

    const barWrap = document.createElement("div");
    barWrap.className = "dist-bar-wrap";
    const bar = document.createElement("div");
    bar.className = "dist-bar";
    bar.style.width = maxCount ? `${(count / maxCount) * 100}%` : "0%";
    barWrap.appendChild(bar);

    const countEl = document.createElement("span");
    countEl.className = "dist-count";
    countEl.textContent = count;

    row.append(label, barWrap, countEl);
    distEl.appendChild(row);
  });

  // Top brands
  const brandCounts = {};
  noodles.forEach(n => { brandCounts[n.brand] = (brandCounts[n.brand] ?? 0) + 1; });
  const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const brandsEl = document.getElementById("top-brands");
  sortedBrands.forEach(([brand, count]) => {
    const row = document.createElement("div");
    row.className = "brand-row";
    const name = document.createElement("span");
    name.textContent = brand;
    const cnt = document.createElement("span");
    cnt.className = "brand-count";
    cnt.textContent = `${count} noodle${count !== 1 ? "s" : ""}`;
    row.append(name, cnt);
    brandsEl.appendChild(row);
  });

  // Highlights
  const highlights = [
    { label: "Highest rated", noodle: [...noodles].sort((a, b) => b.rating - a.rating || a.spicy - b.spicy)[0] },
    { label: "Spiciest", noodle: [...noodles].sort((a, b) => b.spicy - a.spicy || b.rating - a.rating)[0] },
    { label: "Best value", noodle: [...noodles].sort((a, b) => a.price - b.price || b.rating - a.rating)[0] },
  ];

  const hlEl = document.getElementById("highlights");
  highlights.forEach(({ label, noodle }) => {
    const section = document.createElement("div");
    section.className = "highlight-card";

    const heading = document.createElement("div");
    heading.className = "highlight-label";
    heading.textContent = label;

    const img = document.createElement("img");
    img.src = noodle.image;
    img.alt = noodle.name;
    img.loading = "lazy";

    const name = document.createElement("strong");
    name.textContent = noodle.name;

    const brand = document.createElement("span");
    brand.className = "brand";
    brand.textContent = `(${noodle.brand})`;

    const meta = document.createElement("div");
    meta.className = "rating-spice-row";
    meta.innerHTML = ratingSpiceHTML(noodle.rating, noodle.spicy);

    const price = document.createElement("div");
    price.className = "price";
    price.textContent = `£${noodle.price.toFixed(2)}`;

    section.append(heading, img, name, " ", brand, meta, price);
    hlEl.appendChild(section);
  });
});
