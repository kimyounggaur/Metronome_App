import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(project, process.argv[2] ?? 'dist');
async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const lists = await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return lists.flat();
}
const assets = (await filesIn(dist)).map(file => path.relative(dist, file).split(path.sep).join('/'))
  .filter(file => file !== 'sw.js' && file !== 'pwa-precache.json' && /\.(?:html|js|css|png|svg|webmanifest)$/i.test(file)).sort();
for (const required of ['index.html', 'manifest.webmanifest', 'icons/pulse-192.png', 'icons/pulse-512.png', 'icons/pulse-maskable-512.png', 'icons/apple-touch-icon.png']) {
  if (!assets.includes(required)) throw new Error(`Missing mandatory precache asset: ${required}`);
}
if (!assets.some(file => /schedulerWorker.*\.js$/.test(file))) throw new Error('Missing scheduler Worker build asset');
if (!assets.some(file => /\.css$/.test(file))) throw new Error('Missing stylesheet build asset');
const template = await readFile(path.join(project, 'public/sw.js'), 'utf8');
const mimeTypes = {
  '.html': ['text/html'],
  '.js': ['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript', 'application/x-javascript'],
  '.css': ['text/css'],
  '.png': ['image/png'],
  '.svg': ['image/svg+xml'],
  '.webmanifest': ['application/manifest+json', 'application/json'],
};
const indexFile = path.join(dist, 'index.html');
const originalHtml = (await readFile(indexFile, 'utf8')).replace(/<meta name="pulse-build" content="[a-f0-9]+">/g, '');
const hash = createHash('sha256').update(template).update(JSON.stringify(mimeTypes));
const files = new Map();
for (const file of assets) {
  const bytes = file === 'index.html' ? Buffer.from(originalHtml) : await readFile(path.join(dist, file));
  files.set(file, bytes);
  hash.update(file).update(bytes);
}
const version = hash.digest('hex').slice(0, 20);
const html = originalHtml.replace('</head>', `<meta name="pulse-build" content="${version}"></head>`);
if (html === originalHtml) throw new Error('Missing closing head in app shell');
await writeFile(indexFile, html);
files.set('index.html', Buffer.from(html));
const manifest = assets.map(file => ({
  path: file,
  mime: mimeTypes[path.extname(file)],
  digest: createHash('sha256').update(files.get(file)).digest('hex'),
}));
const worker = template.replace('__PULSE_BUILD_VERSION__', version).replace('const PRECACHE = []; // __PULSE_PRECACHE__', `const PRECACHE = ${JSON.stringify(manifest)};`);
await writeFile(path.join(dist, 'sw.js'), worker);
await writeFile(path.join(dist, 'pwa-precache.json'), JSON.stringify({ version, assets: manifest }, null, 2) + '\n');
process.stdout.write(`Pulse PWA ${version}: ${assets.length} integrity-checked assets, including scheduler Worker.\n`);
