/* Builds the glasses web app into docs/ for GitHub Pages.
   - app.js / app.css / index.html: small shell, loaded immediately
   - vendor.js: teleproto (MTProto) bundle, lazy-loaded by the app
   - config.js: API credentials (this is standard for Telegram web clients) */

import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'glasses', 'src');
const out = join(root, 'docs');

mkdirSync(out, { recursive: true });

const empty = join(src, 'stubs', 'empty.js');

const common = {
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  alias: {
    buffer: 'buffer/',
    // Real shims for Node built-ins teleproto actually uses:
    crypto: join(src, 'shims', 'crypto.js'),
    'node:crypto': join(src, 'shims', 'crypto.js'),
    zlib: join(src, 'shims', 'zlib.js'),
    'node:zlib': join(src, 'shims', 'zlib.js'),
    events: join(src, 'shims', 'events.js'),
    'node:events': join(src, 'shims', 'events.js'),
    'node:timers/promises': join(src, 'shims', 'timers.js'),
    // Empty stubs for Node built-ins only used by code paths we never hit
    // (file uploads/downloads, StoreSession, proxies):
    net: empty,
    'node:net': empty,
    tls: empty,
    os: empty,
    fs: empty,
    path: empty,
    http: empty,
    'node:http': empty,
    https: empty,
    'node:https': empty,
    socks: empty,
    'node-localstorage': empty,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    global: 'globalThis',
  },
  inject: [join(src, 'buffer-inject.js')],
  logLevel: 'info',
};

// 1. teleproto engine bundle (lazy-loaded)
await esbuild.build({
  ...common,
  entryPoints: [join(src, 'vendor.js')],
  outfile: join(out, 'vendor.js'),
});

// 2. app shell
await esbuild.build({
  ...common,
  entryPoints: [join(src, 'app.js')],
  outfile: join(out, 'app.js'),
});

// 3. static assets
copyFileSync(join(root, 'glasses', 'index.html'), join(out, 'index.html'));
copyFileSync(join(root, 'glasses', 'app.css'), join(out, 'app.css'));
copyFileSync(join(root, 'glasses', 'favicon.svg'), join(out, 'favicon.svg'));

// 4. runtime config (API credentials — required for any MTProto client)
writeFileSync(
  join(out, 'config.js'),
  `window.CONFIG = { API_ID: ${process.env.TG_API_ID || 33302743}, API_HASH: "${
    process.env.TG_API_HASH || 'c13e1ca4e9e60304241452b8c157818d'
  }" };\n`
);

console.log('Glasses app built to docs/');
