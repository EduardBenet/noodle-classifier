let listLoaded = false;

document.querySelectorAll(".tab-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    const target = button.getAttribute("data-tab");
    document.getElementById(`tab-${target}`).classList.add("active");
    button.classList.add("active");

    if (target === "list" && !listLoaded) {
      list();
      listLoaded = true;
    }
  });
});

document.getElementById("home-link").addEventListener("click", (e) => {
  e.preventDefault();
  showOverlay();
});

document.getElementById("overlay-close").addEventListener("click", hideOverlay);
document.getElementById("overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("overlay")) hideOverlay();
});

function showOverlay() {
  document.getElementById("overlay").classList.add("visible");
}

function hideOverlay() {
  document.getElementById("overlay").classList.remove("visible");
}

async function loadNoodleOfTheDay() {
  const response = await fetch("/api/noodles");
  const items = await response.json();
  if (!items.length) return;
  const today = new Date();
  const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const noodle = items[daySeed % items.length];
  renderList([noodle], "noodle-of-the-day");
}

window.addEventListener("DOMContentLoaded", () => {
  list();
  listLoaded = true;
  loadNoodleOfTheDay();
  showOverlay();
});
