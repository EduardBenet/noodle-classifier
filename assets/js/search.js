async function searchNoodles(searchTerm) {
  const gql = `
    query SearchNoodles($filter: NoodlesFilterInput) {
      noodles(filter: $filter) {
        items {
          id
          name
          brand
          description
          keywords
          spicy
          price
          rating
          image
        }
      }
    }
  `;

  const query = {
    query: gql,
    variables: {
      filter: {
        or: [
          { brand: { contains: searchTerm } },
          { keywords: { contains: searchTerm } }
        ]
      }
    }
  };

  const response = await fetch("/data-api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });

  const result = await response.json();
  renderList(result.data.noodles.items, 'search-results');
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