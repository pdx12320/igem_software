import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFTARGET_MODEL_ID, emptyOffTargetState, targetKey, validateJobReceipt,
  validateOffTargetResult, resultMatchesInputs, predictionsFromResult } from '../lib/offtarget-workflow.ts';

const context = 'A'.repeat(50) + 'C' + 'G'.repeat(50);
const otherContext = 'U'.repeat(50) + 'C' + 'A'.repeat(50);
function fixture() {
  const target = { id: 'target', sequence: context, position: 51, motif: 'AAAAAAAA', bindingStart: 42 };
  const reference = { name: 'reference.fasta', species: 'Fixture species', kind: 'transcript', sha256: 'a'.repeat(64), sizeBytes: 120 };
  const request = { schemaVersion: 1, requestId: 'request-1', modelId: OFFTARGET_MODEL_ID, target, reference, scoreType: 'raw_ranking_score' };
  const result = { schemaVersion: 1, jobId: 'job-1', requestId: request.requestId, modelId: OFFTARGET_MODEL_ID,
    modelVersion: 'lamar-v1', referenceSha256: reference.sha256, species: reference.species,
    referenceKind: 'transcript', scope: 'uploaded-transcript-fasta', scoreType: 'raw_ranking_score',
    target: { ...target }, sites: [
      { transcript: 'transcript-1', position: 51, context, score: 0, status: 'scored' },
      { transcript: 'transcript-2', position: 64, context: otherContext, score: null, status: 'unscored' },
      { transcript: 'short', position: 5, context: null, score: null, status: 'insufficient_context' },
    ] };
  const job = { id: result.jobId, requestId: request.requestId, referenceSha256: reference.sha256, status: 'succeeded' };
  const state = { ...emptyOffTargetState, file: new File(['>reference\n' + context], 'reference.fasta'), reference, species: reference.species, request, job, result };
  return { target, reference, request, result, job, state };
}

test('zero and missing site scores retain their meanings in validated copies and prediction export', () => {
  const { result, request } = fixture(), before = structuredClone(result);
  const validated = validateOffTargetResult(result, request, result.jobId);
  assert.deepEqual(validated.sites.map(site => site.score), [0, null, null]);
  assert.deepEqual(predictionsFromResult(validated), { modelVersion: 'lamar-v1', referenceSet: request.reference.sha256,
    scoreType: 'raw_ranking_score', predictions: [{ context, score: 0 }] });
  validated.sites[0].transcript = 'changed-copy';
  validated.target.id = 'changed-copy';
  assert.deepEqual(result, before);
});

test('site score, context and status must agree without treating missing values as zero', () => {
  const invalid = [
    { status: 'scored', context, score: null },
    { status: 'scored', context: null, score: 0 },
    { status: 'unscored', context, score: 0 },
    { status: 'insufficient_context', context, score: null },
    { status: 'scored', context, score: NaN },
    { status: 'scored', context, score: Infinity },
    { status: 'scored', context, score: '0' },
    { status: 'scored', context: 'A'.repeat(101), score: 0 },
    { status: 'scored', context: context.toLowerCase(), score: 0 },
    { status: 'scored', context: context.slice(1), score: 0 },
    { status: 'unknown', context, score: null },
  ];
  for (const patch of invalid) {
    const { result, request } = fixture();
    result.sites = [{ transcript: 'bad', position: 51, ...patch }];
    assert.throws(() => validateOffTargetResult(result, request), undefined, JSON.stringify(patch));
  }
  for (const field of ['context', 'score']) {
    const { result, request } = fixture();
    delete result.sites[0][field];
    assert.throws(() => validateOffTargetResult(result, request));
  }
});

test('finite raw scores outside zero to one retain their original values', () => {
  const { result, request } = fixture();
  result.sites = [
    { transcript: 'negative', position: 51, context, score: -1.25, status: 'scored' },
    { transcript: 'positive', position: 51, context: otherContext, score: 2.5, status: 'scored' },
  ];
  const validated = validateOffTargetResult(result, request);
  assert.deepEqual(validated.sites.map(site => site.score), [-1.25, 2.5]);
  assert.equal(validated.scoreType, 'raw_ranking_score');
  assert.deepEqual(predictionsFromResult(validated).predictions.map(row => row.score), [-1.25, 2.5]);
});

test('result provenance is bound to the exact RNA, reference, species, request and job', () => {
  const patches = [
    { referenceSha256: 'b'.repeat(64) }, { requestId: 'request-2' }, { species: 'Different species' },
    { jobId: 'different-job' }, { referenceKind: 'genome' }, { scope: 'whole-transcriptome' },
    { modelId: 'different-model' }, { scoreType: 'probability' }, { schemaVersion: 2 }, { modelVersion: '' },
  ];
  for (const patch of patches) {
    const { result, request } = fixture();
    assert.throws(() => validateOffTargetResult({ ...result, ...patch }, request, result.jobId), /match|contract/);
  }
  for (const patch of [{ id: 'different' }, { sequence: otherContext }, { position: 52 }, { motif: 'AAAAAAAG' }, { bindingStart: 43 }]) {
    const { result, request } = fixture();
    assert.throws(() => validateOffTargetResult({ ...result, target: { ...result.target, ...patch } }, request), /different RNA/);
  }
});

test('site coordinates, mismatch counts and duplicate mapping keys are checked', () => {
  for (const patch of [{ position: 0 }, { position: 1.5 }, { position: Number.MAX_SAFE_INTEGER + 1 },
    { bindingStart: 0 }, { bindingStart: 2.5 }, { mismatches: -1 }, { mismatches: 9 }, { transcript: '' }]) {
    const { result, request } = fixture();
    result.sites = [{ ...result.sites[0], ...patch }];
    assert.throws(() => validateOffTargetResult(result, request));
  }
  const { result, request } = fixture();
  result.sites.push({ ...result.sites[0] });
  assert.throws(() => validateOffTargetResult(result, request), /Duplicate site/);
  result.sites = [result.sites[0], { ...result.sites[0], bindingStart: 2 }];
  assert.equal(validateOffTargetResult(result, request).sites.length, 2);
});

test('identical contexts share scores but retain every locus; conflicting values are rejected', () => {
  const { result, request } = fixture();
  result.sites = [result.sites[0], { ...result.sites[0], transcript: 'other-locus' }];
  const valid = validateOffTargetResult(result, request);
  assert.equal(valid.sites.length, 2);
  assert.equal(predictionsFromResult(valid).predictions.length, 1);
  result.sites[1].score = 0.5;
  assert.throws(() => validateOffTargetResult(result, request), /conflicting scores/);
});

test('job receipts must match request, reference and expected opaque job id', () => {
  const { request, job } = fixture();
  assert.deepEqual(validateJobReceipt({ ...job, extra: 'discard' }, request, job.id), job);
  for (const patch of [{ id: '../other' }, { id: 'other' }, { requestId: 'other' },
    { referenceSha256: 'b'.repeat(64) }, { status: 'complete' }, { message: '' }]) {
    assert.throws(() => validateJobReceipt({ ...job, ...patch }, request, job.id));
  }
});

test('changed current inputs invalidate previously accepted results', () => {
  const { state, target } = fixture();
  assert.equal(resultMatchesInputs(state, target), true);
  assert.equal(resultMatchesInputs({ ...state, species: `  ${state.species} ` }, target), true);
  for (const field of ['file', 'request', 'reference', 'result']) {
    assert.equal(resultMatchesInputs({ ...state, [field]: null }, target), false, field);
  }
  for (const patch of [{ id: 'other' }, { sequence: otherContext }, { position: 52 },
    { motif: 'AAAAAAAG' }, { bindingStart: 43 }]) {
    assert.notEqual(targetKey({ ...target, ...patch }), targetKey(target));
    assert.equal(resultMatchesInputs(state, { ...target, ...patch }), false);
  }
  assert.equal(resultMatchesInputs({ ...state, species: 'Different species' }, target), false);
  assert.equal(resultMatchesInputs({ ...state, reference: { ...state.reference, sha256: 'b'.repeat(64) } }, target), false);
});

test('a replacement request cannot reactivate an older result for the same RNA and reference', () => {
  const { state, target } = fixture();
  const changed = { ...state, request: { ...state.request, requestId: 'new-request' } };
  assert.equal(resultMatchesInputs(changed, target), false);
});

test('reference metadata edits cannot reactivate results from another species', () => {
  const { state, target } = fixture();
  const species = 'Different species';
  const changed = { ...state, species, reference: { ...state.reference, species } };
  assert.equal(resultMatchesInputs(changed, target), false);
});

test('matching request inputs cannot hide a stale result target or job', () => {
  const { state, target } = fixture();
  assert.equal(resultMatchesInputs({ ...state, result: { ...state.result, target: { ...target, position: 52 } } }, target), false);
  assert.equal(resultMatchesInputs({ ...state, result: { ...state.result, jobId: 'old-job' } }, target), false);
});

test('restored site evidence stays inactive until its reference is reselected and verified', () => {
  const { state, target } = fixture();
  assert.equal(resultMatchesInputs({ ...state, file: null }, target), false);
  assert.equal(resultMatchesInputs(state, target), true);
});
