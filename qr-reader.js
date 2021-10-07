import QrScanner from './qr-scanner.min.js';
import { parseShc } from './parse-shc.bundle.js';

const fileSelector = document.getElementById('file-selector');
const fileQrResult = document.getElementById('file-qr-result');
const rawResult = document.getElementById('raw-result');

QrScanner.WORKER_PATH = './qr-scanner-worker.min.js';

fileSelector.addEventListener('change', async () => {
  const file = fileSelector.files[0];

  if (!file) return;

  try {
    const result = await QrScanner.scanImage(file);
    setResult(fileQrResult, result);
    handleResult(result);
  } catch (e) {
    setResult(fileQrResult, e || 'No QR code found.');
  }
});

function setResult(label, result) {
  label.textContent = result;
  label.style.color = 'teal';
  clearTimeout(label.highlightTimeout);
  label.highlightTimeout = setTimeout(() => label.style.color = 'inherit', 100);
}

function handleResult(result) {
  if (!result) return;

  const data = parseShc(result);
  rawResult.innerHTML = JSON.stringify(data, null, 2);
}