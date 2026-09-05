import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const iconsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
await mkdir(iconsDir, { recursive: true });
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
function chunk(type, bytes) {
  const name = Buffer.from(type), content = Buffer.concat([name, bytes]);
  let crc = 0xffffffff;
  for (const b of content) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  const result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length, 0); content.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length + 8);
  return result;
}
function sample(x, y) {
  const dx = x - 256, dy = y - 256, r = Math.hypot(dx, dy);
  let white = Math.abs(r - 168) <= 12;
  const segments = [[256,88,256,160],[256,352,256,424],[88,256,160,256],[352,256,424,256]];
  for (const [x1,y1,x2,y2] of segments) {
    const t = Math.max(0, Math.min(1, ((x-x1)*(x2-x1)+(y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2)));
    if (Math.hypot(x-x1-t*(x2-x1), y-y1-t*(y2-y1)) <= 11) white = true;
  }
  if (r <= 82) return [52,211,153];
  return white ? [242,244,240] : [16,17,19];
}
async function icon(size, name) {
  const scan = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const color = [0,0,0];
    for (let sy=0;sy<4;sy++) for(let sx=0;sx<4;sx++) {
      const c = sample((x+(sx+0.5)/4)*512/size,(y+(sy+0.5)/4)*512/size);
      for(let k=0;k<3;k++) color[k]+=c[k];
    }
    const offset=y*(size*4+1)+1+x*4;
    for(let k=0;k<3;k++) scan[offset+k]=Math.round(color[k]/16);
    scan[offset+3]=255;
  }
  const header=Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8;header[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
  await writeFile(path.join(iconsDir,name),png);
}
await icon(192,'pulse-192.png');
await icon(512,'pulse-512.png');
await icon(512,'pulse-maskable-512.png');
await icon(180,'apple-touch-icon.png');
process.stdout.write('Generated four PNG icons from the existing Pulse logo geometry.\n');
