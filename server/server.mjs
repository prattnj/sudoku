// Minimal zero-dependency static server for the built PWA (dist/).
// - Serves hashed assets with long-lived caching and the service worker / HTML with no-cache.
// - Gzips text responses (precomputed in memory at startup).
// - Falls back to index.html for unknown paths.
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.STATIC_DIR ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist'));
const PORT = Number(process.env.PORT ?? 3000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt']);

/** @type {Map<string, { body: Buffer, gzip: Buffer | null, type: string, cache: string }>} */
const files = new Map();

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    const ext = extname(name).toLowerCase();
    const body = readFileSync(full);
    const urlPath = '/' + full.slice(ROOT.length + 1).split(sep).join('/');
    const immutable = urlPath.startsWith('/assets/');
    files.set(urlPath, {
      body,
      gzip: COMPRESSIBLE.has(ext) && body.length > 1024 ? gzipSync(body, { level: 9 }) : null,
      type: TYPES[ext] ?? 'application/octet-stream',
      cache: immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
  }
}
walk(ROOT);

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  if (path.endsWith('/')) path += 'index.html';

  let file = files.get(path);
  if (!file) {
    // Missing hashed assets should 404 rather than return HTML.
    if (path.startsWith('/assets/') || extname(path)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    file = files.get('/index.html');
  }

  const useGzip = file.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  const body = useGzip ? file.gzip : file.body;
  res.writeHead(200, {
    'Content-Type': file.type,
    'Content-Length': body.length,
    'Cache-Control': file.cache,
    'X-Content-Type-Options': 'nosniff',
    ...(file.gzip ? { Vary: 'Accept-Encoding' } : {}),
    ...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(PORT, () => console.log(`Sudoku serving ${ROOT} (${files.size} files) on port ${PORT}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
