import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildSync} from 'esbuild';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'puf-ranker-local-tests-'));
const output = path.join(directory, 'ranker.mjs');
buildSync({entryPoints: [new URL('../lib/puf-ranker-local.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: output});
const {rankWithModel, rankLocalCandidates, validateLocalRankerModel} = await import(pathToFileURL(output));
fs.rmSync(directory, {recursive: true});
const model = JSON.parse(fs.readFileSync(new URL('../data/puf-ranker-492.json', import.meta.url), 'utf8'));
const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/puf-ranker-golden.json', import.meta.url), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const candidate = (id, protein) => ({id, label: id, protein});
const tolerance = golden.tolerance;
function close(actual, expected, field) { assert.ok(Math.abs(actual - expected) <= tolerance, `${field}: ${actual} differs from ${expected}`); }

test('all three archived example CSV predictions survive passive 492-aa export', async () => {
  const candidates = golden.rows.map(row => candidate(row.id, row.protein));
  const result = await rankLocalCandidates(candidates);
  assert.equal(result.source, 'bundled');
  assert.equal(result.sourceCheckpointSha256, golden.sourceCheckpointSha256);
  assert.equal(sha(model.reference492), model.referenceSha256);
  assert.equal(sha(model.originalReference493), model.originalReferenceSha256);
  for (const expected of golden.rows) {
    assert.equal(expected.originalProtein493, expected.protein + 'G');
    const actual = result.rows.find(row => row.id === expected.id);
    for (const field of ['C295_hat', 'C388_hat', 'C871_hat', 'S_hat', 'ESM2_score']) close(actual[field], expected.expected[field], expected.id + ':' + field);
    assert.equal(actual.rank, expected.expected.rank);
  }
});

// Independent full-coordinate calculation: construct the original 9,861-feature
// vector and retain the dropped terminal block as recorded in the conversion.
function original493Formula(protein492) {
  const protein493 = protein492 + 'G', ref = model.originalReference493;
  const vector = new Array(493 * 20).fill(0);
  let score = 0;
  for (let position = 0; position < ref.length; position++) {
    if (ref[position] === protein493[position]) continue;
    const x = model.aaAlphabet.indexOf(ref[position]), y = model.aaAlphabet.indexOf(protein493[position]);
    vector[position * 20 + x] = -1;
    vector[position * 20 + y] = 1;
    score += model.scoreLogp.values[position][y] - model.scoreLogp.values[position][x];
  }
  const values = model.fits.map(fit => {
    const coefficients = [...fit.oneHotCoefficients, ...fit.droppedTerminalCoefficients];
    const dot = vector.reduce((sum, feature, index) => sum + feature * coefficients[index], 0);
    return dot + fit.esmCoefficient * ((score - fit.mean) / fit.std * fit.weight) + fit.intercept;
  });
  return [...values, values[1] - (values[0] + values[2]) / 2, score];
}

test('fixed-coordinate restriction preserves WT, sparse, boundary and multi-position numerical cases', () => {
  const positions = [[], [0], [491], [1, 245, 490], [0, 19, 120, 333, 491]];
  const cases = positions.map((changes, index) => {
    const sequence = [...model.reference492];
    for (const position of changes) sequence[position] = model.aaAlphabet[(model.aaAlphabet.indexOf(sequence[position]) + 7) % 20];
    return candidate('arithmetic-case-' + index, sequence.join(''));
  });
  const results = rankWithModel(cases, model);
  for (const item of cases) {
    const expected = original493Formula(item.protein), actual = results.rows.find(row => row.id === item.id);
    ['C295_hat', 'C388_hat', 'C871_hat', 'S_hat', 'ESM2_score'].forEach((field, index) => close(actual[field], expected[index], item.id + ':' + field));
  }
  assert.equal(results.rows.find(row => row.id === cases[0].id).ESM2_score, 0);
});

test('local scoring takes an immutable snapshot before the model module resolves', async () => {
  const candidates = [candidate('snapshot', golden.rows[0].protein)];
  const pending = rankLocalCandidates(candidates);
  candidates[0].protein = model.reference492;
  const result = await pending;
  assert.equal(result.rows[0].protein, golden.rows[0].protein);
  close(result.rows[0].S_hat, golden.rows[0].expected.S_hat, 'snapshot score');
});

test('model validation rejects altered provenance, dtype, dimensions, dropped coefficients and calibration', () => {
  for (const edit of [
    value => { value.sourceCheckpointSha256 = 'other'; },
    value => { value.compatibilityVersion = 'other'; },
    value => { value.reference492 = 'A'.repeat(492); },
    value => { value.scoreLogp.dtype = 'float32'; },
    value => { value.scoreLogp.values[0].pop(); },
    value => { value.fits[0].oneHotCoefficients.pop(); },
    value => { value.fits[0].droppedTerminalCoefficients[0] = 1; },
    value => { value.fits[0].std = 0; },
    value => { value.fits[0].mean = NaN; },
  ]) { const altered = structuredClone(model); edit(altered); assert.throws(() => validateLocalRankerModel(altered)); }
  for (const length of [349, 491, 493, 494]) assert.throws(() => rankWithModel([candidate('wrong-length', 'A'.repeat(length))], model), /492-aa/);
  assert.throws(() => rankWithModel([], model), /492-aa/);
});
