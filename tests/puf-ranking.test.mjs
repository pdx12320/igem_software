import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRankCandidates, normalizeRankCandidates, parseCandidateFasta, validateRankCandidates, validateRankResult,
  RANK_MODEL_ID, RANK_REFERENCE_SHA256, RANK_SCORE_DEFINITION, RANK_SCOPE,
  RANK_SOURCE_CHECKPOINT_SHA256, RANK_COMPATIBILITY_VERSION,
} from '../lib/puf-ranking.ts';

// Artificial sequences exercise transport validation only; no model is run.
const queue = [
  {id: 'a', label: 'First snapshot', protein: 'A'.repeat(492)},
  {id: 'b', label: 'Second snapshot', protein: 'C'.repeat(492)},
];
function payload() {
  return {schemaVersion: 1, modelId: RANK_MODEL_ID, modelVersion: 'archived-test-contract',
    referenceSha256: RANK_REFERENCE_SHA256, scoreDefinition: RANK_SCORE_DEFINITION, scope: RANK_SCOPE,
    sourceCheckpointSha256: RANK_SOURCE_CHECKPOINT_SHA256, compatibilityVersion: RANK_COMPATIBILITY_VERSION,
    rows: queue.map(candidate => ({id: candidate.id, protein: candidate.protein,
      C295_hat: 0.2, C388_hat: 0.6, C871_hat: 0.4, S_hat: 0.3, ESM2_score: -2}))};
}

test('FASTA creates copied snapshots, validates identifiers and standard amino acids', () => {
  assert.deepEqual(parseCandidateFasta('>sample-1 My sample\r\nacdw\r\n'), [{id: 'sample-1', label: 'sample-1 My sample', protein: 'ACDW'}]);
  for (const text of ['', 'ACD', '>a\nACX', '>a\nACD\n>a\nDEF', '>a\nACD\n>b\nACD', '>a\n', '>\nACD', '>a\nAC D']) assert.throws(() => parseCandidateFasta(text));
  assert.throws(() => parseCandidateFasta('>a\n' + 'A'.repeat(2001)));
  assert.throws(() => parseCandidateFasta(Array.from({length: 51}, (_, index) => '>id-' + index + '\nA').join('\n')));
  const copied = validateRankCandidates(queue);
  copied[0].label = 'Changed copy';
  assert.equal(queue[0].label, 'First snapshot');
});

test('merging skips identical proteins, rejects reused IDs for changed sequences and preserves input', () => {
  const merged = mergeRankCandidates(queue, [{id: 'alias', label: 'Alias', protein: queue[0].protein}]);
  assert.deepEqual(merged, queue);
  assert.throws(() => mergeRankCandidates(queue, [{id: 'a', label: 'Changed', protein: 'D'.repeat(493)}]), /different protein/);
  assert.equal(queue.length, 2);
});

test('results require exact full candidate coverage, sequences, model scope and provenance', () => {
  for (const edit of [
    value => { value.rows.pop(); },
    value => { value.rows[1] = {...value.rows[0]}; },
    value => { value.rows[0].id = 'unknown'; },
    value => { value.rows[0].protein = 'D'.repeat(492); },
    value => { value.modelId = 'other'; },
    value => { value.modelVersion = ' '; },
    value => { value.referenceSha256 = 'other'; },
    value => { value.sourceCheckpointSha256 = 'other'; },
    value => { value.compatibilityVersion = 'other'; },
    value => { value.scoreDefinition = 'ESM2_score'; },
    value => { value.scope = 'arbitrary-target'; },
    value => { value.schemaVersion = 2; },
  ]) { const value = payload(); edit(value); assert.throws(() => validateRankResult(value, queue)); }
  assert.throws(() => validateRankResult(payload(), []));
  assert.throws(() => validateRankResult(payload(), queue.map(candidate => ({...candidate, protein: candidate.protein.slice(1)}))), /492-aa/);
});

test('finite numerical scores and consistent S are mandatory; missing values are never zero', () => {
  for (const field of ['C295_hat', 'C388_hat', 'C871_hat', 'S_hat', 'ESM2_score']) {
    for (const bad of [null, undefined, NaN, Infinity, -Infinity, '0.3']) {
      const value = payload(); value.rows[0][field] = bad;
      assert.throws(() => validateRankResult(value, queue), /finite numbers/);
    }
  }
  const inconsistent = payload(); inconsistent.rows[0].S_hat = 0.9;
  assert.throws(() => validateRankResult(inconsistent, queue), /does not match/);
});

test('received scores remain unchanged and unclipped; ties use archived candidate ID order', () => {
  const value = payload(); value.rows.reverse();
  const tied = validateRankResult(value, [...queue].reverse());
  assert.deepEqual(tied.rows.map(row => [row.id, row.rank]), [['a', 1], ['b', 2]]);
  assert.equal(tied.rows[0].S_hat, 0.3);
  value.rows[0] = {...value.rows[0], C295_hat: -2, C388_hat: 3, C871_hat: 0, S_hat: 4, ESM2_score: -100};
  const scored = validateRankResult(value, queue, 'service');
  assert.equal(scored.rows[0].id, 'b');
  assert.equal(scored.rows[0].S_hat, 4);
  assert.equal(scored.rows[0].C295_hat, -2);
  assert.equal(scored.source, 'service');
  assert.equal(value.rows[0].rank, undefined);
  const rounded = payload(); rounded.rows[0].S_hat += 1e-10;
  assert.equal(validateRankResult(rounded, queue).rows.find(row => row.id === 'a').S_hat, rounded.rows[0].S_hat);
});

test('only authorized 493-aa terminal G normalization changes input coordinates and records the original', () => {
  const original = 'A'.repeat(492) + 'G';
  const records = parseCandidateFasta('>archived\n' + original);
  assert.equal(records[0].protein, original.slice(0, 492));
  assert.equal(records[0].originalProtein, original);
  assert.equal(records[0].normalization, RANK_COMPATIBILITY_VERSION);
  for (const protein of ['A'.repeat(493), 'A'.repeat(348) + 'G', 'A'.repeat(491) + 'G', 'A'.repeat(493) + 'G']) {
    const candidate = {id: 'unchanged', label: 'Unchanged', protein};
    assert.deepEqual(normalizeRankCandidates([candidate]), [candidate]);
  }
  assert.throws(() => validateRankCandidates([{...records[0], originalProtein: 'C'.repeat(493)}]), /original 493-aa/);
  assert.equal(normalizeRankCandidates(records)[0].originalProtein, original);
});
