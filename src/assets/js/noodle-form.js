// Shared between add.html (owner) and submit.html (any signed-in user): the
// barcode scanner and the Open Food Facts lookup. Both pages must also load
// toast.js, which showToast lives in and this file calls.

/* ========== Barcode scanner ========== */

let codeReader;
let scannerRunning = false;
let onBarcodeCallback = () => { };

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
    showToast(`Camera error — ${err.message}`, 'error');
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
  } catch (_) { }
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
    } catch (_) { }
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
  onBarcodeCallback(value);
}

function stopScanner() {
  scannerRunning = false;

  if (codeReader) {
    try { codeReader.stopDecoding(); } catch (_) { }
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

// `onBarcode` runs after the scanned value has been written into #product-id.
function initScanner(onBarcode) {
  onBarcodeCallback = onBarcode ?? (() => { });
  document.getElementById('scanner-btn').addEventListener('click', startScanner);
}

/* ========== Open Food Facts autofill ========== */

function setOfffStatus(msg) {
  const el = document.getElementById('offf-status');
  el.textContent = msg;
  el.hidden = !msg;
}

async function fillFromOpenFoodFacts(id) {
  setOfffStatus('Searching Open Food Facts…');
  let data;
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(id)}.json`);
    data = await response.json();
  } catch (_) {
    setOfffStatus('Could not reach Open Food Facts.');
    return;
  }

  if (data.status !== 1) {
    setOfffStatus('Not found in Open Food Facts.');
    return;
  }

  setOfffStatus('');
  const p = data.product;
  if (p.product_name) document.getElementById('name').value = p.product_name;
  if (p.brands) document.getElementById('brand').value = p.brands.split(',')[0].trim();
  if (p.image_url) document.getElementById('image').value = p.image_url;

  const tags = (p.categories_tags ?? [])
    .map(t => t.replace(/^en:/, '').replace(/-/g, ' '))
    .filter(t => t.length < 30);
  if (tags.length) document.getElementById('keywords').value = tags.join(', ');
}
