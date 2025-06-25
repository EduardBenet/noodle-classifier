async function create() {

  const data = {
    id: document.getElementById('product-id').value,
    name: document.getElementById('name').value,
    brand: document.getElementById('brand').value,
    keywords: document.getElementById('keywords').value.split(',').map(k => k.trim()),
    description: document.getElementById('description').value,
    spicy: parseInt(document.getElementById('spicy').value),
    price: parseFloat(document.getElementById('price').value),
    rating: parseInt(document.querySelector('input[name="rating"]:checked')?.value || "0"),
    image: document.getElementById('image').value
  };

  const gql = `
    mutation create($item: CreateNoodlesInput!) {
      createNoodles(item: $item) {
        id
        name
        brand
        keywords
        description
        spicy
        price
        rating
        image
      }
    }`;

  const query = {
    query: gql,
    variables: {
      item: data
    }
  };

  const endpoint = "/data-api/graphql";
  const result = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query)
  });

  const response = await result.json();
  list();
  // Reset form on success
  document.getElementById('add-form').reset();
}

let scanner;
let scannerRunning = false;

function startScanner() {
  const reader = document.getElementById('reader');

  if (scannerRunning) {
    stopScanner();
    return;
  }

  reader.style.display = 'block';

  scanner = new Html5Qrcode("reader");

  const config = { fps: 10, qrbox: 250 };

  scanner.start(
    { facingMode: "environment" }, // Use rear camera
    config,
    (decodedText, decodedResult) => {
      document.getElementById("product-id").value = decodedText;
      stopScanner();
    },
    errorMessage => {
      console.log(errorMessage);
    }
  ).then(() => {
    scannerRunning = true;
  }).catch(err => {
    alert("Camera start failed: " + err);
  });
}

function stopScanner() {
  if (!scanner) return;

  scanner.stop().then(() => {
    document.getElementById("reader").style.display = 'none';
    scanner.clear();
    scannerRunning = false;
  }).catch(err => {
    alert("Camera stop failed: " + err);
  });
}

document.getElementById('add-form').addEventListener('submit', function (e) {
  e.preventDefault();
  create();
});