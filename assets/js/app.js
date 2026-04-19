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
  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById("tab-home").classList.add("active");
  showHome();
});

async function showHome() {
  const response = await fetch("/api/noodles");
  const items = await response.json();
  if (!items.length) return;
  const noodle = items[Math.floor(Math.random() * items.length)];
  renderList([noodle], "noodle-of-the-day");
}

window.addEventListener("DOMContentLoaded", () => {
  showHome();
});
