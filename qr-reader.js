import QrScanner from './qr-scanner.min.js';

const fileSelector = document.getElementById('file-selector');
const fileQrResult = document.getElementById('file-qr-result');

QrScanner.WORKER_PATH = './qr-scanner-worker.min.js';

fileSelector.addEventListener('change', () => {
  const file = fileSelector.files[0];
  if (!file) {
      return;
  }
  QrScanner.scanImage(file)
      .then(result => setResult(fileQrResult, result))
      .catch(e => setResult(fileQrResult, e || 'No QR code found.'));
});

function setResult(label, result) {
  label.textContent = result;
  label.style.color = 'teal';
  clearTimeout(label.highlightTimeout);
  label.highlightTimeout = setTimeout(() => label.style.color = 'inherit', 100);
}