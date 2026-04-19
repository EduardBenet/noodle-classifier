async function searchNoodles(searchTerm) {
  const response = await fetch(`/api/noodles?search=${encodeURIComponent(searchTerm)}`);
  const items = await response.json();
  renderList(items, 'search-results');
}

let debounceTimeout;

document.getElementById("search").addEventListener("input", async (e) => {
  const searchTerm = e.target.value.trim();

  // Clear the last timeout
  clearTimeout(debounceTimeout);

  // Set a new timeout
  debounceTimeout = setTimeout(() => {
    if (searchTerm) {
      searchNoodles(searchTerm);
    }
  }, 300); // wait 300ms after last keystroke
});