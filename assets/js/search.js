let debounceTimeout;

document.getElementById("search").addEventListener("input", (e) => {
  const searchTerm = e.target.value.trim();
  clearTimeout(debounceTimeout);

  if (!searchTerm) {
    renderList(sortNoodles(allNoodles), 'noodle-list');
    return;
  }

  debounceTimeout = setTimeout(async () => {
    const response = await fetch(`/api/noodles?search=${encodeURIComponent(searchTerm)}`);
    const items = await response.json();
    renderList(items, 'noodle-list');
  }, 300);
});
