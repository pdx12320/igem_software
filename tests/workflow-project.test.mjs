import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSync} from 'esbuild';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-project-tests-'));
const output = path.join(directory, 'workflow-project.mjs');
buildSync({entryPoints: [new URL('../lib/workflow-project.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: output});
const {serializeWorkflow, restoreWorkflow} = await import(pathToFileURL(output));
fs.rmSync(directory, {recursive: true});

const target = {id: 'target', sequence: 'A'.repeat(50) + 'C' + 'G'.repeat(50), position: 51, motif: 'A'.repeat(8), bindingStart: 42};
const reference = {name: 'species.fa', species: 'Example organism', kind: 'transcript', sha256: 'a'.repeat(64), sizeBytes: 120};
const request = {schemaVersion: 1, requestId: 'request-1', modelId: 'module4-lamar-101', target, reference, scoreType: 'raw_ranking_score'};
const job = {id: 'job-1', requestId: request.requestId, referenceSha256: reference.sha256, status: 'succeeded'};
function snapshot() {
  return {candidates: [{id: 'saved-1', label: 'Saved protein', protein: 'A'.repeat(492)}], ranking: null,
    offtarget: {file: new File(['>target\nACGU\n'], 'species.fa'), reference, species: reference.species, request, job,
      result: {schemaVersion: 1, jobId: job.id, requestId: request.requestId, modelId: request.modelId, modelVersion: 'test-v1',
        referenceSha256: reference.sha256, species: reference.species, referenceKind: 'transcript',
        scope: 'uploaded-transcript-fasta', scoreType: 'raw_ranking_score', target,
        sites: [{transcript: 'target', position: 51, context: target.sequence, score: -1.7, status: 'scored'}]}}};
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('project round-trip keeps exact evidence and raw scores but never a live File', () => {
  const original = snapshot(), saved = serializeWorkflow(original, target);
  assert.equal('file' in saved.offtarget, false);
  assert.equal(original.offtarget.file.name, 'species.fa');
  const restored = restoreWorkflow(plain(saved), target);
  assert.equal(restored.offtarget.file, null);
  assert.deepEqual(restored.candidates, original.candidates);
  assert.deepEqual(restored.offtarget.result, original.offtarget.result);
  assert.equal(restored.offtarget.result.sites[0].score, -1.7);
  restored.candidates[0].label = 'Changed';
  assert.equal(original.candidates[0].label, 'Saved protein');
});

test('legacy projects reset workflow; unsupported or incomplete schemas fail', () => {
  assert.deepEqual(restoreWorkflow(undefined, target), {candidates: [], ranking: null,
    offtarget: {file: null, reference: null, species: '', request: null, job: null, result: null}});
  for (const value of [null, {}, {schemaVersion: 2}, {schemaVersion: 1}]) assert.throws(() => restoreWorkflow(value));
});

test('save clears previous-target jobs while retaining reference metadata for reselection', () => {
  const other = {...target, id: 'new-target'};
  const saved = serializeWorkflow(snapshot(), other);
  assert.equal(saved.offtarget.request, null);
  assert.equal(saved.offtarget.job, null);
  assert.equal(saved.offtarget.result, null);
  assert.deepEqual(saved.offtarget.reference, reference);
  assert.throws(() => restoreWorkflow(serializeWorkflow(snapshot()), other), /project target/);
});

test('restore rejects reference, target, receipt, species, result and candidate tampering', () => {
  const pristine = serializeWorkflow(snapshot());
  for (const edit of [
    value => { value.offtarget.reference.sha256 = 'bad'; },
    value => { value.offtarget.reference.sizeBytes = 0; },
    value => { value.offtarget.reference.sizeBytes = 101 * 1024 * 1024; },
    value => { value.offtarget.reference.kind = 'genome'; },
    value => { value.offtarget.species = 'Other organism'; },
    value => { value.offtarget.request.target.position = 50; },
    value => { value.offtarget.request.target.motif = 'G'.repeat(8); },
    value => { value.offtarget.request.target.bindingStart = 0; },
    value => { value.offtarget.request.target.sequence += 'N'; },
    value => { value.offtarget.request.reference.sha256 = 'b'.repeat(64); },
    value => { value.offtarget.request.scoreType = 'ranking_score'; },
    value => { value.offtarget.job.requestId = 'other'; },
    value => { value.offtarget.job.status = 'running'; },
    value => { value.offtarget.result.target.id = 'other'; },
    value => { value.offtarget.result.jobId = 'other'; },
    value => { value.offtarget.result.sites[0].score = null; },
    value => { value.offtarget.request = null; },
    value => { value.offtarget.job = null; },
    value => { value.candidates.push({...value.candidates[0]}); },
  ]) { const changed = plain(pristine); edit(changed); assert.throws(() => restoreWorkflow(changed, target)); }
});

test('selected references without a submitted job and pending request receipts can be saved', () => {
  const value = snapshot();
  value.offtarget.result = null; value.offtarget.job = null;
  assert.equal(restoreWorkflow(serializeWorkflow(value)).offtarget.request.requestId, request.requestId);
  value.offtarget.request = null;
  assert.deepEqual(restoreWorkflow(serializeWorkflow(value)).offtarget.reference, reference);
  value.offtarget.species = ''; value.offtarget.reference = {...reference, species: ''};
  assert.equal(restoreWorkflow(serializeWorkflow(value)).offtarget.species, '');
});

test('bundled ranking and authorized normalization provenance survive project restoration', () => {
  const model = JSON.parse(fs.readFileSync(new URL('../data/puf-ranker-492.json', import.meta.url), 'utf8'));
  const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/puf-ranker-golden.json', import.meta.url), 'utf8')).rows[0];
  const value = snapshot();
  value.candidates = [{id: golden.id, label: 'Archived example', protein: golden.protein,
    originalProtein: golden.originalProtein493, normalization: model.compatibilityVersion}];
  value.ranking = {schemaVersion: 1, modelId: model.modelId, modelVersion: model.modelVersion,
    referenceSha256: model.referenceSha256, sourceCheckpointSha256: model.sourceCheckpointSha256,
    compatibilityVersion: model.compatibilityVersion, scoreDefinition: 'C388_hat - (C295_hat + C871_hat)/2',
    scope: 'fixed-assay-C295-C388-C871', source: 'bundled',
    rows: [{id: golden.id, protein: golden.protein, ...golden.expected, rank: 1}]};
  const restored = restoreWorkflow(plain(serializeWorkflow(value)), target);
  assert.deepEqual(restored.candidates, value.candidates);
  assert.deepEqual(restored.ranking, value.ranking);
  const changed = plain(serializeWorkflow(value));
  changed.candidates[0].protein = 'A'.repeat(492);
  assert.throws(() => restoreWorkflow(changed));
});
