let debounceTimeout;

document.getElementById("search").addEventListener("input", (e) => {
  const searchTerm = e.target.value.trim();
  clearTimeout(debounceTimeout);

  if (!searchTerm) {
    currentPage = 1;
    renderPagedList(sortNoodles(allNoodles));
    return;
  }

  debounceTimeout = setTimeout(async () => {
    const response = await fetch(`/api/noodles?search=${encodeURIComponent(searchTerm)}`);
    const items = await response.json();
    document.getElementById('pagination').hidden = true;
    renderList(items, 'noodle-list');
  }, 300);
});
