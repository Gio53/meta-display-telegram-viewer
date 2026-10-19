// Injects a Buffer global for teleproto, which uses Node's Buffer internally.
import { Buffer } from 'buffer';

globalThis.Buffer = Buffer;

// Node's Buffer has lowercase-"int" aliases (readBigUint64BE etc.) that the
// npm buffer polyfill lacks, but teleproto calls them.
if (typeof Buffer.prototype.readBigUint64BE !== 'function') {
  Buffer.prototype.readBigUint64BE = Buffer.prototype.readBigUInt64BE;
}
if (typeof Buffer.prototype.readBigUint64LE !== 'function') {
  Buffer.prototype.readBigUint64LE = Buffer.prototype.readBigUInt64LE;
}
