// zlib shim for the browser: teleproto only needs unzipSync (gzip-compressed
// TL payloads), gzipSync, and crc32.
import { inflate, ungzip } from 'pako';
import { Buffer } from 'buffer';

function unzipSync(input) {
  const bytes = new Uint8Array(input);
  let out;
  try {
    out = ungzip(bytes);
  } catch (e) {
    out = inflate(bytes);
  }
  return Buffer.from(out);
}

function gzipSync(data) {
  // inflate-only keeps the bundle smaller; the client flow never compresses.
  throw new Error('gzipSync not supported in browser build');
}

// Standard CRC-32 (IEEE 802.3), matches Node zlib.crc32 semantics.
const table = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c;
}

function crc32(buf, previous = 0) {
  let c = ~previous >>> 0;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

module.exports = { unzipSync, gzipSync, crc32 };
