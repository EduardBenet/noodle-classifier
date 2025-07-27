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
        hasSoup
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

let codeReader;
let scannerRunning = false;

async function startScanner() {
  if (scannerRunning) {
    stopScanner();
    return;
  }

  const readerContainer = document.getElementById('reader-container');
  const videoElement = document.getElementById('video-preview');
  readerContainer.style.display = 'block';

  codeReader = new ZXingBrowser.BrowserMultiFormatReader();

  try {
    const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
    const backCam = devices.find(device =>
      device.label.toLowerCase().includes('back')
    );
    const selectedDeviceId = backCam ? backCam.deviceId : devices[0]?.deviceId;

    await codeReader.decodeFromVideoDevice(
      selectedDeviceId,
      videoElement,
      (result, err) => {
        if (result) {
          document.getElementById('product-id').value = result.text;
          stopScanner();
        }

        if (err) {
          console.log('Scan error:', err); // non-fatal scanning failures
        }
      }
    );

    scannerRunning = true;

  } catch (err) {
    alert("Camera start failed: " + err.message);
  }
}

async function stopScanner() {
  if (!codeReader) return;

  try {
    await codeReader.stopDecoding();
  } catch (e) {
    console.warn("Failed to stop decoding:", e);
  }

  // Stop all video tracks (fully disables camera)
  const videoElement = document.getElementById('video-preview');
  const stream = videoElement.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
  }

  document.getElementById('reader-container').style.display = 'none';
  scannerRunning = false;
}

document.getElementById('add-form').addEventListener('submit', function (e) {
  e.preventDefault();
  create();
});