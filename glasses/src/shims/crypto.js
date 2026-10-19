// WebCrypto shim for the Node "crypto" APIs teleproto calls in the browser:
// randomBytes and randomFillSync (entropy for auth keys / padding).
import { Buffer } from 'buffer';

function randomBytes(count) {
  const out = new Uint8Array(count);
  globalThis.crypto.getRandomValues(out);
  return Buffer.from(out);
}

function randomFillSync(buf, offset = 0, length) {
  const view = new Uint8Array(
    buf.buffer,
    buf.byteOffset + offset,
    length ?? buf.byteLength - offset
  );
  // getRandomValues accepts at most 65536 bytes per call
  for (let i = 0; i < view.length; i += 65536) {
    globalThis.crypto.getRandomValues(view.subarray(i, Math.min(i + 65536, view.length)));
  }
  return buf;
}

module.exports = { randomBytes, randomFillSync };
