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
  readerContainer.classList.add('scanning');
  scannerRunning = true;

  try {
    if ('BarcodeDetector' in window) {
      await startNativeScanner(videoElement);
    } else {
      await startZXingScanner(videoElement);
    }
  } catch (err) {
    alert("Camera start failed: " + err.message);
    stopScanner();
  }
}

async function tapToFocus(videoElement, e) {
  const track = videoElement.srcObject?.getVideoTracks()[0];
  if (!track) return;
  const capabilities = track.getCapabilities?.() ?? {};

  try {
    if (capabilities.focusMode?.includes('manual') && 'pointOfInterest' in capabilities) {
      const rect = videoElement.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      await track.applyConstraints({ advanced: [{ focusMode: 'manual', pointOfInterest: { x, y } }] });
    } else if (capabilities.focusMode?.includes('continuous')) {
      // Nudge autofocus by toggling to manual briefly then back
      await track.applyConstraints({ advanced: [{ focusMode: 'manual' }] });
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    }
  } catch (_) {}
}

async function startNativeScanner(videoElement) {
  const detector = new BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
  });
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
  });
  videoElement.srcObject = stream;
  await videoElement.play();
  videoElement.addEventListener('click', (e) => tapToFocus(videoElement, e));

  const scan = async () => {
    if (!scannerRunning) return;
    try {
      const barcodes = await detector.detect(videoElement);
      if (barcodes.length > 0) {
        onBarcodeFound(barcodes[0].rawValue);
        return;
      }
    } catch (_) {}
    requestAnimationFrame(scan);
  };
  requestAnimationFrame(scan);
}

async function startZXingScanner(videoElement) {
  codeReader = new ZXingBrowser.BrowserMultiFormatReader();
  await codeReader.decodeFromConstraints(
    { video: { facingMode: 'environment' } },
    videoElement,
    (result, err) => {
      if (result) onBarcodeFound(result.text);
      if (err && !(err instanceof ZXingBrowser.NotFoundException)) {
        console.warn('Scan error:', err);
      }
    }
  );
  videoElement.addEventListener('click', (e) => tapToFocus(videoElement, e));
}

function onBarcodeFound(value) {
  document.getElementById('product-id').value = value;
  stopScanner();
  fillFormById(value);
}

function stopScanner() {
  scannerRunning = false;

  if (codeReader) {
    try { codeReader.stopDecoding(); } catch (_) {}
    codeReader = null;
  }

  const videoElement = document.getElementById('video-preview');
  const stream = videoElement.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
  }

  const readerContainer = document.getElementById('reader-container');
  readerContainer.style.display = 'none';
  readerContainer.classList.remove('scanning');
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

  if (items.length) {
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
  } else {
    await fillFromOpenFoodFacts(id);
  }
}

async function fillFromOpenFoodFacts(id) {
  let data;
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(id)}.json`);
    data = await response.json();
  } catch (_) { return; }

  if (data.status !== 1) return;

  const p = data.product;
  if (p.product_name) document.getElementById('name').value = p.product_name;
  if (p.brands)       document.getElementById('brand').value = p.brands.split(',')[0].trim();
  if (p.image_url)    document.getElementById('image').value = p.image_url;

  const tags = (p.categories_tags ?? [])
    .map(t => t.replace(/^en:/, '').replace(/-/g, ' '))
    .filter(t => t.length < 30);
  if (tags.length) document.getElementById('keywords').value = tags.join(', ');
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