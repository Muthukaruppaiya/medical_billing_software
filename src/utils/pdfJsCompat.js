/**
 * PDF.js 5.4+ uses APIs missing in Electron 33 / older Chromium:
 * - Uint8Array.prototype.toHex
 * - Map.prototype.getOrInsertComputed
 * Install before any pdfjs-dist import/usage.
 */

export function installPdfJsCompat(target = globalThis) {
  const uint8 = target.Uint8Array;
  if (uint8 && typeof uint8.prototype.toHex !== 'function') {
    Object.defineProperty(uint8.prototype, 'toHex', {
      value() {
        let hex = '';
        for (let i = 0; i < this.length; i += 1) {
          hex += this[i].toString(16).padStart(2, '0');
        }
        return hex;
      },
      writable: true,
      configurable: true,
    });
  }

  const mapProto = target.Map?.prototype;
  if (mapProto && typeof mapProto.getOrInsertComputed !== 'function') {
    Object.defineProperty(mapProto, 'getOrInsertComputed', {
      value(key, callbackFn) {
        if (this.has(key)) return this.get(key);
        const value = callbackFn(key);
        this.set(key, value);
        return value;
      },
      writable: true,
      configurable: true,
    });
  }
}

installPdfJsCompat();
