import type { OffTargetSite, WorkflowTarget } from './offtarget-workflow';

const MAX_REFERENCE_BYTES = 100 * 1024 * 1024;

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Reference validation aborted.', 'AbortError');
}

/**
 * Check returned evidence against its uploaded FASTA, without finding new sites or
 * changing model scores. Read every record, retaining one transcript at a time.
 * Coordinates are 1-based; only the reference's case and T/U spelling normalize.
 * Call validateOffTargetResult first to validate the service response contract.
 */
export async function validateReferenceSites(
  file: Blob,
  sites: OffTargetSite[],
  target: WorkflowTarget,
  signal?: AbortSignal,
): Promise<void> {
  checkAbort(signal);
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_REFERENCE_BYTES) {
    throw Error('Reference FASTA must contain 1 byte to 100 MiB.');
  }
  const relevant = new Map<string, OffTargetSite[]>();
  for (const site of sites) {
    if (site.mismatches !== undefined && site.bindingStart === undefined) {
      throw Error('A reported mismatch count requires a binding start.');
    }
    const sameTranscript = relevant.get(site.transcript);
    if (sameTranscript) sameTranscript.push(site);
    else relevant.set(site.transcript, [site]);
  }
  const seen = new Set<string>();
  let transcript: string | null = null;
  let sequenceParts: string[] = [];
  let sequenceChunk = '';
  const finishRecord = () => {
    if (transcript === null) return;
    const sequence = sequenceParts.join('') + sequenceChunk;
    if (!sequence.length) throw Error(`Reference transcript ${transcript} has an empty sequence.`);
    if (transcript === target.id && sequence !== target.sequence) {
      throw Error('The reference record with the target ID differs from the full target RNA.');
    }
    for (const site of relevant.get(transcript) ?? []) {
      checkAbort(signal);
      if (!Number.isSafeInteger(site.position) || site.position < 1 || site.position > sequence.length) {
        throw Error(`Site coordinate is outside reference transcript ${transcript}.`);
      }
      if (sequence[site.position - 1] !== 'C') {
        throw Error(`Site coordinate is not C in reference transcript ${transcript}.`);
      }
      if (site.context !== null) {
        if (site.position <= 50 || site.position + 50 > sequence.length ||
          site.context.length !== 101 ||
          sequence.slice(site.position - 51, site.position + 50) !== site.context) {
          throw Error(`Reported context does not match the reference coordinates in ${transcript}.`);
        }
      }
      if (site.bindingStart !== undefined) {
        if (!Number.isSafeInteger(site.bindingStart) || site.bindingStart < 1 ||
          !target.motif.length || site.bindingStart + target.motif.length - 1 > sequence.length) {
          throw Error(`Binding interval is outside reference transcript ${transcript}.`);
        }
        if (site.mismatches !== undefined) {
          const bindingSequence = sequence.slice(site.bindingStart - 1, site.bindingStart - 1 + target.motif.length);
          let observedMismatches = 0;
          for (let index = 0; index < target.motif.length; index++) {
            if (bindingSequence[index] !== target.motif[index]) observedMismatches++;
          }
          if (!Number.isSafeInteger(site.mismatches) || site.mismatches !== observedMismatches) {
            throw Error(`Reported mismatch count does not match the reference interval in ${transcript}.`);
          }
        }
      }
    }
    relevant.delete(transcript);
    sequenceParts = [];
    sequenceChunk = '';
  };
  const processLine = (raw: string) => {
    checkAbort(signal);
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('>')) {
      finishRecord();
      const id = line.slice(1).trim().split(/\s+/)[0];
      if (!id || id.includes('>')) throw Error('Every FASTA header needs a transcript identifier.');
      if (seen.has(id)) throw Error(`Duplicate FASTA transcript ID: ${id}.`);
      seen.add(id);
      transcript = id;
      return;
    }
    if (transcript === null) throw Error('Reference FASTA must start with a >transcript header.');
    const bases = line.replace(/\s+/g, '').toUpperCase();
    if (!/^[ACGTURYSWKMBDHVN]+$/.test(bases)) {
      throw Error(`Invalid nucleotide characters in reference transcript ${transcript}.`);
    }
    sequenceChunk += bases.replaceAll('T', 'U');
    // Bound the number of fragments even for a FASTA with one base per line.
    if (sequenceChunk.length >= 65_536) { sequenceParts.push(sequenceChunk); sequenceChunk = ''; }
  };
  const reader = file.stream().getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  let pending = '';
  let scanOffset = 0;
  let bytes = 0;
  let complete = false;
  const consume = (final: boolean) => {
    let start = 0;
    let index = scanOffset;
    for (; index < pending.length; index++) {
      const character = pending[index];
      if (character !== '\r' && character !== '\n') continue;
      if (character === '\r' && index === pending.length - 1 && !final) break;
      processLine(pending.slice(start, index));
      if (character === '\r' && pending[index + 1] === '\n') index++;
      start = index + 1;
    }
    pending = pending.slice(start);
    // Resume after already inspected characters if a long line spans chunks.
    scanOffset = index - start;
    if (final && pending) { processLine(pending); pending = ''; scanOffset = 0; }
  };
  try {
    while (true) {
      checkAbort(signal);
      const { value, done } = await reader.read();
      checkAbort(signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REFERENCE_BYTES) throw Error('Reference FASTA exceeds 100 MiB.');
      pending += decoder.decode(value, { stream: true });
      consume(false);
    }
    pending += decoder.decode();
    consume(true);
    finishRecord();
    checkAbort(signal);
    if (!seen.size) throw Error('Reference FASTA contains no transcript records.');
    if (relevant.size) throw Error(`Result transcript is absent from the reference: ${relevant.keys().next().value}.`);
    complete = true;
  } finally {
    signal?.removeEventListener('abort', abort);
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
