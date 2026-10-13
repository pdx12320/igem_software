import { spawn } from 'node:child_process';
import path from 'node:path';

const origin = new URL(process.argv[2]);
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
  throw Error('Provide the HTTPS Site origin, without credentials or a path.');
}
// A short-lived runtime key is supplied on hidden stdin, never in shell args,
// source, logs, an environment file, or the browser application.
process.stdout.write('Ready for release upload key JSON on hidden stdin.\n');
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = await new Promise((resolve, reject) => {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buffer += chunk;
    if (buffer.includes('\u0003')) reject(Error('Upload cancelled.'));
    else if (buffer.length > 4096) reject(Error('Input is too large.'));
    else if (buffer.includes('\n')) resolve(buffer.slice(0, buffer.indexOf('\n')));
  });
  process.stdin.on('end', () => reject(Error('Missing upload key.')));
  process.stdin.resume();
}).finally(() => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
});
const { token } = JSON.parse(input);
if (!/^[a-f0-9]{64}$/.test(token || '')) throw Error('Invalid release upload key.');
// Use the already available Python transport that passed the public Site probe.
// The key is relayed only through the child process's stdin.
const child = spawn('python3', [path.resolve(import.meta.dirname, 'upload-local-download-assets.py'), origin.href, process.argv[3] || '0'], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.end(JSON.stringify({ token }) + '\n');
child.once('error', () => { console.error('The owner upload tool requires the existing Python 3 runtime.'); process.exitCode = 1; });
child.once('close', code => { process.exitCode = code ?? 1; });
