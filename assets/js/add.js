let isExistingNoodle = false;

function collectFormData() {
  return {
    id: document.getElementById('product-id').value,
    name: document.getElementById('name').value,
    brand: document.getElementById('brand').value,
    keywords: document.getElementById('keywords').value.split(',').map(k => k.trim()),
    description: document.getElementById('description').value,
    spicy: parseInt(document.querySelector('input[name="spice"]:checked')?.value || "0"),
    hasSoup: document.getElementById('hasSoup').checked,
    price: parseFloat(document.getElementById('price').value),
    rating: parseInt(document.querySelector('input[name="rating"]:checked')?.value || "0"),
    image: document.getElementById('image').value
  };
}

async function save(method) {
  await fetch("/api/noodles", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collectFormData())
  });
  list();
  document.getElementById('add-form').reset();
  isExistingNoodle = false;
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
          fillFormById(result.text);
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

document.getElementById('product-id').addEventListener('input', () => {
  isExistingNoodle = false;
});

document.getElementById('product-id').addEventListener('blur', () => {
  const id = document.getElementById('product-id').value.trim();
  if (id) fillFormById(id);
});

async function fillFormById(id) {
  const response = await fetch(`/api/noodles?id=${encodeURIComponent(id)}`);
  const items = await response.json();
  if (!items.length) return;

  isExistingNoodle = true;
  const n = items[0];
  document.getElementById('name').value = n.name ?? '';
  document.getElementById('brand').value = n.brand ?? '';
  document.getElementById('price').value = n.price ?? '';
  document.getElementById('description').value = n.description ?? '';
  document.getElementById('keywords').value = Array.isArray(n.keywords) ? n.keywords.join(', ') : (n.keywords ?? '');
  document.getElementById('image').value = n.image ?? '';
  document.getElementById('hasSoup').checked = !!n.hasSoup;

  const spiceInput = document.querySelector(`input[name="spice"][value="${n.spicy}"]`);
  if (spiceInput) spiceInput.checked = true;

  const ratingInput = document.querySelector(`input[name="rating"][value="${n.rating}"]`);
  if (ratingInput) ratingInput.checked = true;
}

document.getElementById('add-form').addEventListener('submit', function (e) {
  e.preventDefault();
  if (isExistingNoodle) {
    const name = document.getElementById('name').value;
    document.getElementById('confirm-message').textContent = `"${name}" already exists. Overwrite it?`;
    document.getElementById('confirm-dialog').classList.add('visible');
  } else {
    save('POST');
  }
});

document.getElementById('confirm-ok').addEventListener('click', () => {
  document.getElementById('confirm-dialog').classList.remove('visible');
  save('PUT');
});

document.getElementById('confirm-cancel').addEventListener('click', () => {
  document.getElementById('confirm-dialog').classList.remove('visible');
});