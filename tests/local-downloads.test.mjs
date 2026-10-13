import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildSync } from 'esbuild';

// Bundle the JSON import with the existing toolchain, without writing generated
// files or loading any 320 MB package assets into this unit-test process.
const bundle = buildSync({
  entryPoints: [new URL('../lib/local-downloads.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { handleLocalDownload } = await import('data:text/javascript;base64,' +
  Buffer.from(bundle.outputFiles[0].contents).toString('base64'));

const ORIGIN = 'https://orca.example';
const BYTES = Buffer.from('ABCDEFGHIJKL');
const PIECES = [BYTES.subarray(0, 4), BYTES.subarray(4, 9), BYTES.subarray(9)];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const RELEASE = {
  version: 'fixture', fileName: 'orca-fixture.zip', bytes: BYTES.length,
  sha256: sha(BYTES), urls: { windows: '/downloads/fixture/windows.zip', macos: '/downloads/fixture/macos.zip' },
  parts: PIECES.map((bytes, index) => ({ path: `/download-assets/fixture/part-${index}.bin`, bytes: bytes.length, sha256: sha(bytes) })),
};
const ETAG = `"${RELEASE.sha256}"`;
const request = (init = {}, path = RELEASE.urls.windows) => new Request(ORIGIN + path, init);
const read = async response => Buffer.from(await response.arrayBuffer());
const turn = () => new Promise(resolve => setImmediate(resolve));

test('missing asset binding fails before advertising a successful ZIP response', async () => {
  for (const assets of [undefined, null, {}]) {
    const response = await handleLocalDownload(request(), assets, RELEASE);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-disposition'), null);
  }
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fakeAssets({ ignoreRange = false, chunkBytes = 2, truncateIndex = -1, failIndex = -1, badRange = false } = {}) {
  const calls = [], cancelled = [];
  let active = 0, maximumActive = 0;
  return {
    calls, cancelled,
    get maximumActive() { return maximumActive; },
    async fetch(incoming) {
      calls.push(incoming);
      const index = RELEASE.parts.findIndex(part => part.path === new URL(incoming.url).pathname);
      assert.notEqual(index, -1, 'only manifest-selected piece paths reach ASSETS');
      if (index === failIndex) return new Response('missing piece', { status: 404 });
      const match = /^bytes=(\d+)-(\d+)$/.exec(incoming.headers.get('range'));
      assert.ok(match, 'internal asset range is explicit and single');
      const start = Number(match[1]), end = Number(match[2]);
      const selected = ignoreRange ? PIECES[index] : PIECES[index].subarray(start, end + 1);
      const data = index === truncateIndex ? selected.subarray(0, selected.length - 1) : selected;
      let position = 0, ended = false;
      active++;
      maximumActive = Math.max(maximumActive, active);
      const finish = () => { if (!ended) { ended = true; active--; } };
      const body = new ReadableStream({
        pull(controller) {
          if (position === data.length) { finish(); controller.close(); return; }
          const next = Math.min(position + chunkBytes, data.length);
          controller.enqueue(new Uint8Array(data.subarray(position, next)));
          position = next;
        },
        cancel() { cancelled.push(index); finish(); },
      }, { highWaterMark: 0 });
      return new Response(body, {
        status: ignoreRange ? 200 : 206,
        headers: {
          'Content-Length': String(selected.length),
          ...(!ignoreRange ? { 'Content-Range': badRange ? `bytes 0-0/${PIECES[index].length}` : `bytes ${start}-${end}/${PIECES[index].length}` } : {}),
        },
      });
    },
  };
}

test('both aliases stream the identical complete immutable attachment sequentially', async () => {
  for (const path of Object.values(RELEASE.urls)) {
    const assets = fakeAssets();
    const response = await handleLocalDownload(request({}, path), assets, RELEASE);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-length'), String(BYTES.length));
    assert.equal(response.headers.get('content-type'), 'application/zip');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="orca-fixture.zip"');
    assert.equal(response.headers.get('etag'), ETAG);
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.match(response.headers.get('cache-control'), /immutable/);
    assert.deepEqual(await read(response), BYTES);
    assert.deepEqual(assets.calls.map(call => new URL(call.url).pathname), RELEASE.parts.map(part => part.path));
    assert.equal(assets.maximumActive, 1);
  }
});

test('asset subrequests forward no caller credentials, query, validators or arbitrary headers', async () => {
  const assets = fakeAssets();
  const response = await handleLocalDownload(request({ headers: {
    Authorization: 'Bearer private', Cookie: 'session=private', 'If-None-Match': '"different"',
    'If-Range': '"different"', 'X-Private': 'do not forward', 'Accept-Encoding': 'gzip',
  } }), assets, RELEASE);
  await read(response);
  for (const call of assets.calls) {
    assert.equal(call.method, 'GET');
    assert.equal(new URL(call.url).origin, ORIGIN);
    assert.equal(new URL(call.url).search, '');
    assert.equal(call.headers.get('accept-encoding'), 'identity');
    assert.deepEqual([...call.headers.keys()].sort(), ['accept-encoding', 'range']);
  }
});

test('ranges crossing piece boundaries preserve exact order and inclusive positions', async () => {
  const assets = fakeAssets();
  const response = await handleLocalDownload(request({ headers: { Range: 'bytes=2-6' } }), assets, RELEASE);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 2-6/12');
  assert.equal(response.headers.get('content-length'), '5');
  assert.deepEqual(await read(response), BYTES.subarray(2, 7));
  assert.deepEqual(assets.calls.map(call => call.headers.get('range')), ['bytes=2-3', 'bytes=0-2']);
});

test('suffix, open-ended, clipped, and one-byte ranges produce the advertised exact bytes', async () => {
  for (const [range, start, end] of [
    ['bytes=-4', 8, 11], ['bytes=8-', 8, 11], ['bytes=0-999', 0, 11],
    ['bytes=-99', 0, 11], ['bytes=0-0', 0, 0], ['bytes=11-11', 11, 11],
  ]) {
    const assets = fakeAssets();
    const response = await handleLocalDownload(request({ headers: { Range: range } }), assets, RELEASE);
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/12`, range);
    assert.equal(response.headers.get('content-length'), String(end - start + 1), range);
    assert.deepEqual(await read(response), BYTES.subarray(start, end + 1), range);
  }
});

test('ignored internal Range responses discard only a streaming prefix and cancel their suffix', async () => {
  const assets = fakeAssets({ ignoreRange: true, chunkBytes: 1 });
  const response = await handleLocalDownload(request({ headers: { Range: 'bytes=2-5' } }), assets, RELEASE);
  assert.deepEqual(await read(response), Buffer.from('CDEF'));
  assert.deepEqual(assets.calls.map(call => call.headers.get('range')), ['bytes=2-3', 'bytes=0-1']);
  assert.ok(assets.cancelled.includes(1), 'unneeded tail of the second complete asset is cancelled');
  assert.equal(assets.maximumActive, 1);
});

test('HEAD supplies full metadata and ignores Range without opening binary assets', async () => {
  for (const headers of [{}, { Range: 'bytes=2-6' }, { Range: 'invalid' }]) {
    const assets = fakeAssets();
    const response = await handleLocalDownload(request({ method: 'HEAD', headers }), assets, RELEASE);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-length'), String(BYTES.length));
    assert.equal(response.headers.get('content-range'), null);
    assert.equal(response.body, null);
    assert.equal(assets.calls.length, 0);
  }
});

test('If-None-Match accepts exact, weak, list and star validators without fetching assets', async () => {
  for (const method of ['GET', 'HEAD']) {
    for (const validator of [ETAG, `W/${ETAG}`, `"different", ${ETAG}`, '*']) {
      const assets = fakeAssets();
      const response = await handleLocalDownload(request({ method, headers: { 'If-None-Match': validator, Range: 'bytes=2-6' } }), assets, RELEASE);
      assert.equal(response.status, 304);
      assert.equal(response.headers.get('etag'), ETAG);
      assert.equal(response.body, null);
      assert.equal(assets.calls.length, 0);
    }
  }
});

test('If-Range permits matching strong ETag and returns the full package for other validators', async () => {
  for (const [validator, status] of [[ETAG, 206], [`W/${ETAG}`, 200], ['"other"', 200], ['Wed, 01 Jan 2020 00:00:00 GMT', 200]]) {
    const assets = fakeAssets();
    const response = await handleLocalDownload(request({ headers: { Range: 'bytes=2-6', 'If-Range': validator } }), assets, RELEASE);
    assert.equal(response.status, status);
    assert.deepEqual(await read(response), status === 206 ? BYTES.subarray(2, 7) : BYTES);
  }
});

test('malformed, unsafe, multi, empty and unsatisfiable ranges reject before asset fetching', async () => {
  for (const range of ['bytes=12-', 'bytes=4-3', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'items=0-1',
    'bytes=9007199254740992-', 'bytes=0-9007199254740992', 'bytes=-9007199254740992', 'bytes=NaN-4']) {
    const assets = fakeAssets();
    const response = await handleLocalDownload(request({ headers: { Range: range } }), assets, RELEASE);
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('content-range'), 'bytes */12', range);
    assert.equal(response.headers.get('content-length'), '0', range);
    assert.equal(response.body, null);
    assert.equal(assets.calls.length, 0);
  }
});

test('aliases are exact, parameters reject, and unsupported methods cannot fetch or upload', async () => {
  const assets = fakeAssets();
  for (const path of ['/api/upload', '/downloads/fixture/windows.zip/extra', '/downloads/fixture/linux.zip']) {
    assert.equal(await handleLocalDownload(request({}, path), assets, RELEASE), null);
  }
  assert.equal((await handleLocalDownload(request({}, RELEASE.urls.windows + '?source=private'), assets, RELEASE)).status, 400);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await handleLocalDownload(request({ method }), assets, RELEASE);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  }
  assert.equal(assets.calls.length, 0);
});

test('inconsistent release metadata fails before GET or HEAD can claim a complete package', async () => {
  const invalid = { ...RELEASE, bytes: RELEASE.bytes + 1 };
  for (const method of ['GET', 'HEAD']) {
    const assets = fakeAssets();
    const response = await handleLocalDownload(request({ method }), assets, invalid);
    assert.equal(response.status, 503);
    assert.equal(assets.calls.length, 0);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('missing or truncated assets never yield a successful complete byte stream; retry starts fresh', async () => {
  for (const options of [{ failIndex: 1 }, { truncateIndex: 1 }]) {
    const assets = fakeAssets(options);
    const response = await handleLocalDownload(request(), assets, RELEASE);
    await assert.rejects(read(response), /unavailable|truncated|Retry/i);
    assert.ok(assets.calls.length < RELEASE.parts.length, 'later assets are not requested after failure');
    const retry = await handleLocalDownload(request(), fakeAssets(), RELEASE);
    assert.deepEqual(await read(retry), BYTES);
  }
});

test('a mismatched internal 206 Content-Range errors rather than relabelling incorrect bytes', async () => {
  const response = await handleLocalDownload(request({ headers: { Range: 'bytes=2-6' } }), fakeAssets({ badRange: true }), RELEASE);
  await assert.rejects(read(response), /mismatched range/i);
});

test('a missing asset HTML fallback cannot produce a successful tiny ZIP byte range', async () => {
  for (const headers of [
    { 'Content-Type': 'text/html; charset=utf-8' },
    { 'Content-Length': '23' },
  ]) {
    let calls = 0, reads = 0, cancelled = 0;
    const assets = { async fetch() {
      calls++;
      return new Response(new ReadableStream({
        pull(controller) { reads++; controller.enqueue(new TextEncoder().encode('<!doctype html>missing')); },
        cancel() { cancelled++; },
      }, { highWaterMark: 0 }), { status: 200, headers });
    } };
    const response = await handleLocalDownload(request({ headers: { Range: 'bytes=0-0' } }), assets, RELEASE);
    await assert.rejects(read(response), /invalid download metadata/i);
    assert.equal(calls, 1);
    assert.equal(reads, 0, 'fallback contents are rejected before exposing their first byte');
    assert.equal(cancelled, 1);
  }
});

test('a 206 asset with wrong declared length is rejected even when its range header matches', async () => {
  let cancelled = 0;
  const assets = { async fetch() {
    return new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array([65])); },
      cancel() { cancelled++; },
    }, { highWaterMark: 0 }), { status: 206, headers: {
      'Content-Range': 'bytes 0-0/4', 'Content-Length': '4',
    } });
  } };
  const response = await handleLocalDownload(request({ headers: { Range: 'bytes=0-0' } }), assets, RELEASE);
  await assert.rejects(read(response), /invalid download metadata/i);
  assert.equal(cancelled, 1);
});

test('an encoded asset cannot be silently relabelled as raw ZIP bytes', async () => {
  const assets = { async fetch() {
    return new Response(new Uint8Array([65]), { status: 206, headers: {
      'Content-Range': 'bytes 0-0/4', 'Content-Length': '1', 'Content-Encoding': 'gzip',
    } });
  } };
  const response = await handleLocalDownload(request({ headers: { Range: 'bytes=0-0' } }), assets, RELEASE);
  await assert.rejects(read(response), /invalid download metadata/i);
});

test('consumer cancellation stops the active asset and prevents requesting later pieces', async () => {
  const assets = fakeAssets({ chunkBytes: 1 });
  const response = await handleLocalDownload(request(), assets, RELEASE);
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(Buffer.from(first.value).toString(), 'A');
  await reader.cancel('fixture user cancelled');
  await turn();
  assert.equal(assets.calls.length, 1);
  assert.ok(assets.cancelled.includes(0));
});

test('cancellation during a pending asset fetch cancels its late body without reading it', async () => {
  const entered = deferred(), result = deferred(), cancelled = deferred();
  let calls = 0, pulls = 0;
  const assets = { async fetch() { calls++; entered.resolve(); return result.promise; } };
  const response = await handleLocalDownload(request(), assets, RELEASE);
  await entered.promise;
  await response.body.cancel('fixture cancelled during fetch');
  result.resolve(new Response(new ReadableStream({
    pull() { pulls++; }, cancel() { cancelled.resolve(); },
  }, { highWaterMark: 0 }), { status: 200 }));
  await cancelled.promise;
  assert.equal(calls, 1);
  assert.equal(pulls, 0);
});

test('upstream stream errors propagate and do not fetch another package piece', async () => {
  const upstream = new Error('fixture asset disconnected');
  let calls = 0;
  const assets = { async fetch() {
    calls++;
    return new Response(new ReadableStream({ pull(controller) { controller.error(upstream); } }), {
      status: 200, headers: { 'Content-Length': '4' },
    });
  } };
  const response = await handleLocalDownload(request(), assets, RELEASE);
  await assert.rejects(read(response), /fixture asset disconnected/);
  assert.equal(calls, 1);
});
