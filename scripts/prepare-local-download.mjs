import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import release from '../data/local-download-release.json' with { type: 'json' };

const publicRoot = path.resolve(import.meta.dirname, '../work/local-download-assets');
const zipPath = process.argv[2] || process.env.ORCA_DOWNLOAD_ZIP;
const digest = async file => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file, { highWaterMark: 65536 })) hash.update(chunk);
  return hash.digest('hex');
};
const existing = async file => {
  try { return await stat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const targets = release.parts.map(part => {
  const target = path.resolve(publicRoot, '.' + part.path);
  if (!part.path.startsWith('/download-assets/') || !target.startsWith(publicRoot + path.sep)) {
    throw Error('Release asset path must remain inside the generated download-assets directory.');
  }
  return { ...part, target };
});
if (targets.reduce((size, part) => size + part.bytes, 0) !== release.bytes) {
  throw Error('Release asset sizes do not match the immutable ZIP size.');
}

if (zipPath) {
  const input = await stat(zipPath);
  if (!input.isFile() || input.size !== release.bytes || await digest(zipPath) !== release.sha256) {
    throw Error('Input ZIP does not match the committed release size and SHA256.');
  }
}
let offset = 0;
const combined = createHash('sha256');
for (const part of targets) {
  let info = await existing(part.target);
  if (!info) {
    if (!zipPath) throw Error('Missing release assets. Run node scripts/prepare-local-download.mjs PATH_TO_RELEASE_ZIP before building.');
    await mkdir(path.dirname(part.target), { recursive: true });
    await pipeline(
      createReadStream(zipPath, { start: offset, end: offset + part.bytes - 1, highWaterMark: 65536 }),
      createWriteStream(part.target, { flags: 'wx' }),
    );
    info = await stat(part.target);
  }
  if (!info.isFile() || info.size !== part.bytes) throw Error(`Invalid asset size: ${part.path}. Existing files are retained.`);
  const pieceHash = createHash('sha256');
  for await (const chunk of createReadStream(part.target, { highWaterMark: 65536 })) {
    pieceHash.update(chunk);
    combined.update(chunk);
  }
  if (pieceHash.digest('hex') !== part.sha256) throw Error(`Invalid asset SHA256: ${part.path}. Existing files are retained.`);
  offset += part.bytes;
}
if (combined.digest('hex') !== release.sha256) throw Error('Combined release assets differ from the original ZIP.');
console.log(`Verified ${targets.length} release assets: ${release.bytes} bytes, SHA256 ${release.sha256}`);
