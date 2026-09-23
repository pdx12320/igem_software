import {spawn} from 'node:child_process';

function milliseconds(value) {
  const match = /^(\d+(?:\.\d+)?)([smh]?)$/.exec(value);
  if (!match || Number(match[1]) <= 0) throw new Error(`Invalid positive timeout: ${value}`);
  return Number(match[1]) * ({s: 1000, m: 60000, h: 3600000}[match[2] || 's']);
}

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('A command is required.');
const deadline = milliseconds(process.env.SITES_BUILD_TIMEOUT || '3m');
const grace = milliseconds(process.env.SITES_BUILD_KILL_AFTER || '10s');
const grouped = process.platform !== 'win32';
const child = spawn(command, args, {stdio: 'inherit', detached: grouped});
let timedOut = false;
let forceTimer;
const stop = signal => {
  if (!child.pid) return;
  try { if (grouped) process.kill(-child.pid, signal); else child.kill(signal); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
};
const onTerm = () => stop('SIGTERM');
const onInt = () => stop('SIGINT');
process.on('SIGTERM', onTerm);
process.on('SIGINT', onInt);
const timer = setTimeout(() => {
  timedOut = true;
  console.error('Build time limit reached; stopping the build.');
  stop('SIGTERM');
  forceTimer = setTimeout(() => stop('SIGKILL'), grace);
}, deadline);
child.on('error', error => console.error(`Cannot start build: ${error.message}`));
child.on('close', (code, signal) => {
  clearTimeout(timer);
  clearTimeout(forceTimer);
  process.removeListener('SIGTERM', onTerm);
  process.removeListener('SIGINT', onInt);
  process.exitCode = timedOut ? 124 : signal === 'SIGINT' ? 130 : signal ? 143 : code ?? 1;
});
