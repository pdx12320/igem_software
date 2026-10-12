import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReferenceSites } from '../lib/reference-sites.ts';

const context = 'A'.repeat(50) + 'C' + 'U'.repeat(50);
const target = { id: 'target', sequence: context, position: 51, motif: 'AAAAAAAA', bindingStart: 42 };
const scored = { transcript: 'target', position: 51, context, score: 0, status: 'scored' };
function fasta(sequence = context, id = 'target') { return new Blob([`>${id}\n${sequence}\n`]); }
function streamed(chunks, size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)) {
  return { size, stream: () => new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(chunk);
    controller.close();
  } }) };
}
const encode = text => new TextEncoder().encode(text);

test('multiline CRLF FASTA and DNA spelling verify against the full RNA without input mutation', async () => {
  const dna = context.replaceAll('U', 'T').toLowerCase();
  const input = new Blob([`>target description\r\n${dna.slice(0,30)}\r\n${dna.slice(30,70)}\r\n${dna.slice(70)}\r\n>other\r\nACGTRYSWKMBDHVN\r\n`]);
  const sites = [{ ...scored, bindingStart: 42, mismatches: 0 }], before = structuredClone(sites);
  await validateReferenceSites(input, sites, target);
  assert.deepEqual(sites, before);
  assert.equal(sites[0].score, 0);
});

test('streamed CRLF and multibyte header boundaries are handled with fatal UTF-8 decoding', async () => {
  const bytes = encode(`\uFEFF>target 描述\r\n${context}\r\n`);
  await validateReferenceSites(streamed([...bytes].map(byte => Uint8Array.of(byte))), [scored], target);
  for (const bytes of [Uint8Array.of(0xff), Uint8Array.of(0xe2, 0x82)]) {
    await assert.rejects(validateReferenceSites(streamed([encode('>target\n'), bytes]), [], target), /encoded|encoding|UTF|valid/i);
  }
});

test('long unwrapped sequence lines and one-base lines survive chunk boundaries', async () => {
  const sequence = 'A'.repeat(70_000) + 'C' + 'U'.repeat(50);
  const inputTarget = { ...target, sequence, position: 70_001 };
  const site = { ...scored, position: 70_001 };
  const text = `>target\r\n${sequence}`;
  await validateReferenceSites(streamed([encode(text.slice(0,25_000)), encode(text.slice(25_000,60_000)), encode(text.slice(60_000))]), [site], inputTarget);
  await validateReferenceSites(new Blob([`>target\n${[...sequence].join('\n')}`]), [site], inputTarget);
});

test('all returned transcript IDs must occur in the reference', async () => {
  await assert.rejects(validateReferenceSites(fasta(), [{ ...scored, transcript: 'missing' }], target), /absent from the reference/);
});

test('site coordinates must lie within the sequence and identify an actual C', async () => {
  for (const position of [0, -1, 102, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(validateReferenceSites(fasta(), [{ ...scored, position }], target), /outside reference/);
  }
  await assert.rejects(validateReferenceSites(fasta(), [{ ...scored, position: 50 }], target), /not C/);
});

test('supplied 101-nt contexts must match the exact reference interval and cannot invent flanks', async () => {
  await assert.rejects(validateReferenceSites(fasta(), [{ ...scored, context: 'G' + context.slice(1) }], target), /context does not match/);
  await assert.rejects(validateReferenceSites(fasta(), [{ ...scored, context: context.slice(1) }], target), /context does not match/);
  const short = { ...target, id: 'short', sequence: 'ACGU', position: 2 };
  await assert.rejects(validateReferenceSites(fasta(short.sequence, short.id), [{ ...scored, transcript: short.id, position: 2 }], short), /context does not match/);
  await validateReferenceSites(fasta(short.sequence, short.id), [{ ...scored, transcript: short.id, position: 2, context: null, score: null, status: 'insufficient_context' }], short);
});

test('duplicate first-token identifiers are rejected even when header descriptions differ', async () => {
  const file = new Blob(['>duplicate description one\nACGU\n>duplicate description two\nCGUA\n']);
  await assert.rejects(validateReferenceSites(file, [], target), /Duplicate FASTA transcript ID/);
});

test('reported mismatch counts verify the supplied interval and require its start', async () => {
  const reference = context.slice(0, 42) + 'G' + context.slice(43);
  const sites = [{ ...scored, transcript: 'other', context: reference, bindingStart: 42, mismatches: 1 }];
  await validateReferenceSites(fasta(reference, 'other'), sites, target);
  await assert.rejects(validateReferenceSites(fasta(reference, 'other'), [{ ...sites[0], mismatches: 0 }], target), /mismatch count does not match/);
  await assert.rejects(validateReferenceSites(fasta(), [{ ...scored, mismatches: 0 }], target), /requires a binding start/);
  for (const bindingStart of [0, 95, 1.5]) {
    await assert.rejects(validateReferenceSites(fasta(), [{ ...scored, bindingStart }], target), /Binding interval is outside/);
  }
});

test('ambiguity is accepted as reference data but never substituted into scored contexts or exact matching', async () => {
  const ambiguous = 'N' + context.slice(1);
  await validateReferenceSites(fasta(ambiguous, 'other'), [{ ...scored, transcript: 'other', context: null, score: null, status: 'unscored', bindingStart: 1, mismatches: 1 }], target);
  await assert.rejects(validateReferenceSites(fasta(ambiguous, 'other'), [{ ...scored, transcript: 'other' }], target), /context does not match/);
});

test('every FASTA record is checked with no returned rows, including empty records and invalid bases', async () => {
  for (const text of ['>empty\n', '>good\nACGU\n>empty\n', '>bad\nACGX\n', '>good\nACGU\n>bad\n123\n', 'ACGU\n', '>\nACGU\n', '   \n']) {
    await assert.rejects(validateReferenceSites(new Blob([text]), [], target));
  }
  await validateReferenceSites(new Blob(['>unrelated\nACGUN\n']), [], target);
});

test('a target ID in the reference must carry the identical full target RNA even with no returned rows', async () => {
  await assert.rejects(validateReferenceSites(fasta('G' + context.slice(1)), [], target), /differs from the full target RNA/);
  await validateReferenceSites(fasta(context.replaceAll('U', 'T')), [], target);
});

test('empty and oversized files are rejected before opening the stream', async () => {
  await assert.rejects(validateReferenceSites(new Blob([]), [], target), /1 byte to 100 MiB/);
  let opened = false;
  const oversized = { size: 100 * 1024 * 1024 + 1, stream() { opened = true; throw Error('must not open'); } };
  await assert.rejects(validateReferenceSites(oversized, [], target), /1 byte to 100 MiB/);
  assert.equal(opened, false);
});

test('abort before reading or during a pending read terminates validation and cancels the stream', async () => {
  const before = new AbortController();
  before.abort();
  await assert.rejects(validateReferenceSites(fasta(), [scored], target, before.signal), { name: 'AbortError' });
  const during = new AbortController();
  let cancelled = false;
  let streamOpened;
  const opened = new Promise(resolve => { streamOpened = resolve; });
  const pending = { size: 5, stream: () => new ReadableStream({ start() { streamOpened(); }, cancel() { cancelled = true; } }) };
  const validation = validateReferenceSites(pending, [], target, during.signal);
  await opened;
  during.abort();
  await assert.rejects(validation, { name: 'AbortError' });
  assert.equal(cancelled, true);
});
