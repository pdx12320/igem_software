import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScientistCsv, SCIENTIST_CSV_COLUMNS } from '../lib/scientist-csv.ts';

const context = 'A'.repeat(50) + 'C' + 'G'.repeat(50);
function fixture() {
  return {
    target: { id: 'target', sequence: context, position: 51 },
    selected: { id: 'R8-D2', n: 8, offset: 2, start: 42, end: 49, motif: 'AAAAAAAA', hits: [], exact: 0, closest: 3, pareto: true },
    plan: { sequence: 'ACDE', scaffold: { id: 'scaffold-v1' }, rows: [
      { repeat: 1, base: 'A', selected: { id: 'module-1', repeat: 1, base: 'A', trm: 'XXX', sequence: 'ACDE', evidence: 'fixture', sourceRepeat: 8 } },
      { repeat: 2, base: 'G', selected: null },
    ] },
    libraryVersion: 'library-v1',
    reference: { name: 'fixture-reference', species: 'fixture-species', kind: 'transcript', sha256: 'a'.repeat(64) },
  };
}

// Independent RFC 4180 reader so tests verify cell boundaries and embedded lines.
function parse(csv) {
  assert.equal(csv[0], '\uFEFF');
  const source = csv.slice(1), rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if (char === '\r' && source[i + 1] === '\n' && !quoted) {
      row.push(value); rows.push(row); row = []; value = ''; i++;
    } else value += char;
  }
  assert.equal(quoted, false);
  assert.equal(value, '');
  assert.equal(row.length, 0);
  const [header, ...data] = rows;
  assert.deepEqual(header, [...SCIENTIST_CSV_COLUMNS]);
  for (const cells of data) assert.equal(cells.length, header.length);
  return data.map(cells => Object.fromEntries(header.map((key, index) => [key, cells[index]])));
}

test('empty hits still export the requested target, complete provenance and selected plan', () => {
  const input = fixture(), before = structuredClone(input);
  const csv = buildScientistCsv(input), rows = parse(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].record_type, 'target');
  assert.equal(rows[0].target_position_1based, '51');
  assert.equal(rows[0].site_position_1based, '51');
  assert.equal(rows[0].binding_start_1based, '42');
  assert.equal(rows[0].binding_end_1based, '49');
  assert.equal(rows[0].protein_sequence, 'ACDE');
  assert.equal(rows[0].scaffold_id, 'scaffold-v1');
  assert.equal(rows[0].trm_assignments, 'P1:A:XXX:module=module-1:source=R8; P2:G::module=');
  assert.equal(rows[0].reference_sha256, input.reference.sha256);
  assert.equal(rows[0].reference_species, 'fixture-species');
  assert.equal(rows[0].library_version, 'library-v1');
  assert.equal(rows[0].coordinate_system, '1-based sequence-record coordinates');
  assert.equal(rows[0].lamar_score, '');
  assert.equal(rows[0].lamar_score_available, 'false');
  assert.deepEqual(input, before);
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(!csv.replaceAll('\r\n', '').includes('\n'));
});

test('zero LAMAR scores survive while absent scores and missing contexts stay blank', () => {
  const input = fixture();
  input.predictions = { modelVersion: 'LAMAR-v1', referenceSet: 'fixed-population', scoreType: 'ranking_score', predictions: [{ context, score: 0 }] };
  input.predictionMetadata = { referenceHash: input.reference.sha256, scope: 'reference subset' };
  input.selected.hits = [{ transcript: 'multi-C', start: 8, sequence: 'AAAAAAAA', mismatches: 0, editingSites: [
    { position: 17, offset: 2, context },
    { position: 18, offset: 3, context: 'G'.repeat(50) + 'C' + 'A'.repeat(50) },
    { position: 19, offset: 4, context: null },
  ] }];
  const rows = parse(buildScientistCsv(input));
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.slice(1).map(row => row.site_position_1based), ['17', '18', '19']);
  assert.deepEqual(rows.slice(1).map(row => row.binding_end_1based), ['15', '15', '15']);
  assert.deepEqual(rows.map(row => row.lamar_score), ['0', '0', '', '']);
  assert.deepEqual(rows.map(row => row.lamar_score_available), ['true', 'true', 'false', 'false']);
  assert.equal(rows[2].lamar_status, 'score_unavailable');
  assert.equal(rows[3].lamar_status, 'context_unavailable');
  assert.equal(rows[0].lamar_model_version, 'LAMAR-v1');
  assert.equal(rows[0].lamar_reference_set, 'fixed-population');
  assert.equal(rows[0].lamar_scope, 'reference subset');
});

test('hits with no C sites retain their binding interval and have no invented site', () => {
  const input = fixture();
  input.selected.hits = [{ transcript: 'no-C', start: 2, sequence: 'AAAAAAAG', mismatches: 1, editingSites: [] }];
  const row = parse(buildScientistCsv(input))[1];
  assert.equal(row.record_type, 'binding_hit_no_c');
  assert.equal(row.transcript_id, 'no-C');
  assert.equal(row.binding_start_1based, '2');
  assert.equal(row.binding_end_1based, '9');
  assert.equal(row.binding_mismatches, '1');
  assert.equal(row.binding_rna, 'AAAAAAAG');
  assert.equal(row.recognition_rna, 'AAAAAAAA');
  assert.equal(row.site_position_1based, '');
  assert.equal(row.site_offset_nt, '');
  assert.equal(row.lamar_status, 'no_c_site');
});

test('S_hat, ESM-2 and LAMAR are distinct; protein candidates preserve selection and scope', () => {
  const input = fixture();
  input.esmRanks = [
    { candidateId: 'chosen', protein: 'ACDE', rank: 1, score: -0.25, esm2Score: -1.75, modelVersion: 'rank-v2', scope: 'provided candidates', status: 'scored' },
    { candidateId: 'other', protein: 'FGHI', rank: 2, score: 0, esm2Score: null, modelVersion: 'rank-v2', scope: 'provided candidates', status: 'partial' },
  ];
  input.activeProteinCandidateId = 'chosen';
  input.predictions = { modelVersion: 'LAMAR-v1', referenceSet: 'fixed-population', scoreType: 'ranking_score', predictions: [{ context, score: 0.6 }] };
  const [target, selected, other] = parse(buildScientistCsv(input));
  assert.equal(target.s_hat_raw, '-0.25');
  assert.equal(target.esm2_score, '-1.75');
  assert.equal(target.lamar_score, '0.6');
  assert.equal(selected.record_type, 'protein_candidate');
  assert.equal(selected.protein_selected, 'true');
  assert.equal(selected.esm_rank, '1');
  assert.equal(selected.esm_model_version, 'rank-v2');
  assert.equal(selected.esm_scope, 'provided candidates');
  assert.equal(selected.trm_assignments, target.trm_assignments);
  assert.equal(selected.lamar_score, '');
  assert.equal(other.protein_selected, 'false');
  assert.equal(other.protein_sequence, 'FGHI');
  assert.equal(other.s_hat_raw, '0');
  assert.equal(other.esm2_score, '');
  assert.equal(other.trm_assignments, '');
  assert.equal(other.scaffold_id, '');
});

test('stale protein matches do not label a different protein selected or attach its score', () => {
  const input = fixture();
  input.activeProteinCandidateId = 'old';
  input.esmRanks = [{ candidateId: 'old', protein: 'FGHI', rank: 1, score: 0.8, esm2Score: -1, modelVersion: 'rank-v1', scope: 'old', status: 'scored' }];
  const [target, candidate] = parse(buildScientistCsv(input));
  assert.equal(target.protein_candidate_id, '');
  assert.equal(target.s_hat_raw, '');
  assert.equal(candidate.protein_selected, 'false');
  assert.equal(candidate.trm_assignments, '');
});

test('all assay outputs and ranking provenance retain independent unrounded values', () => {
  const input = fixture();
  input.activeProteinCandidateId = 'chosen';
  input.esmRanks = [
    { candidateId: 'chosen', protein: 'ACDE', rank: 1, score: -0.01234567890123456, esm2Score: -2.987654321098765,
      c295Hat: 0, c388Hat: -0.1234567890123456, c871Hat: 1.234567890123456,
      referenceSha256: 'd'.repeat(64), source: 'imported', sourceCheckpointSha256: 'e'.repeat(64),
      compatibilityVersion: 'compatibility-v1', modelVersion: 'rank-v2', scope: 'fixed assays', status: 'scored' },
    { candidateId: 'other', protein: 'FGHI', rank: null, score: null, esm2Score: null,
      modelVersion: '', scope: 'fixed assays', status: 'not_scored' },
  ];
  const [target, selected, other] = parse(buildScientistCsv(input));
  for (const row of [target, selected]) {
    assert.equal(row.c295_hat, '0');
    assert.equal(row.c388_hat, '-0.1234567890123456');
    assert.equal(row.c871_hat, '1.234567890123456');
    assert.equal(row.s_hat_raw, '-0.01234567890123456');
    assert.equal(row.esm2_score, '-2.987654321098765');
    assert.equal(row.esm_reference_sha256, 'd'.repeat(64));
    assert.equal(row.esm_source, 'imported');
    assert.equal(row.esm_checkpoint_sha256, 'e'.repeat(64));
    assert.equal(row.esm_compatibility_version, 'compatibility-v1');
    assert.equal(row.reference_sha256, 'a'.repeat(64));
  }
  for (const column of ['c295_hat', 'c388_hat', 'c871_hat', 'esm_reference_sha256', 'esm_source', 'esm_checkpoint_sha256', 'esm_compatibility_version']) {
    assert.equal(other[column], '');
  }
});

test('all external sites retain independent metadata and true zero, without guessing binding end', () => {
  const input = fixture();
  input.externalSites = [
    { transcript: 'external', position: 81, context: null, score: 0, bindingStart: 70, mismatches: 0, status: 'scored' },
    { transcript: 'external', position: 82, context, score: null, status: 'unavailable' },
  ];
  input.externalMetadata = { modelVersion: 'external-v1', referenceHash: input.reference.sha256, scope: 'uploaded reference' };
  const rows = parse(buildScientistCsv(input)).slice(1);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.record_type), ['external_site', 'external_site']);
  assert.deepEqual(rows.map(row => row.lamar_score), ['0', '']);
  assert.deepEqual(rows.map(row => row.lamar_score_available), ['true', 'false']);
  assert.equal(rows[0].binding_start_1based, '70');
  assert.equal(rows[0].binding_end_1based, '');
  assert.equal(rows[0].lamar_model_version, 'external-v1');
  assert.equal(rows[0].lamar_scope, 'uploaded reference');
  assert.equal(rows[0].lamar_reference_sha256, input.reference.sha256);
});

test('known reference mismatch suppresses stale LAMAR scores while retaining provenance', () => {
  const input = fixture();
  input.predictions = { modelVersion: 'LAMAR-v1', referenceSet: 'old', scoreType: 'ranking_score', predictions: [{ context, score: 0.7 }] };
  input.predictionMetadata = { referenceHash: 'b'.repeat(64) };
  input.externalSites = [{ transcript: 'external', position: 9, context, score: 0.2, status: 'scored' }];
  input.externalMetadata = { referenceHash: 'c'.repeat(64), modelVersion: 'old-model' };
  const rows = parse(buildScientistCsv(input));
  for (const row of rows) {
    assert.equal(row.lamar_score, '');
    assert.equal(row.lamar_score_available, 'false');
    assert.equal(row.lamar_status, 'reference_mismatch');
  }
  assert.equal(rows[0].lamar_reference_sha256, 'c'.repeat(64));
  assert.equal(rows[1].lamar_model_version, 'old-model');
  delete input.externalSites;
  const legacy = parse(buildScientistCsv(input))[0];
  assert.equal(legacy.lamar_reference_sha256, 'b'.repeat(64));
  assert.equal(legacy.lamar_score, '');
  assert.equal(legacy.lamar_status, 'reference_mismatch');
});

test('raw LAMAR scores remain negative or greater than one without normalized labels', () => {
  const input = fixture();
  input.predictions = { modelVersion: 'raw-lamar-v1', referenceSet: 'raw-population', scoreType: 'raw_ranking_score', predictions: [{ context, score: -1.234567890123456 }] };
  input.externalSites = [{ transcript: input.target.id, position: input.target.position, context, score: -1.234567890123456, status: 'scored' },
    { transcript: 'external', position: 81, context, score: 2.345678901234567, status: 'scored' }];
  input.externalMetadata = { modelVersion: 'raw-lamar-v1', referenceHash: input.reference.sha256, scope: 'uploaded reference', scoreType: 'raw_ranking_score' };
  const [target, , external] = parse(buildScientistCsv(input));
  assert.equal(target.lamar_score, '-1.234567890123456');
  assert.equal(external.lamar_score, '2.345678901234567');
  assert.equal(target.lamar_score_type, 'raw_ranking_score');
  assert.equal(external.lamar_score_type, 'raw_ranking_score');
  assert.equal(target.lamar_score_available, 'true');
  assert.equal(external.lamar_score_available, 'true');
});

test('external result target scores require the exact reported locus, even when contexts match', () => {
  const input = fixture();
  input.predictions = { modelVersion: 'raw-lamar-v1', referenceSet: 'raw-population', scoreType: 'raw_ranking_score', predictions: [{ context, score: 0.75 }] };
  input.externalMetadata = { modelVersion: 'raw-lamar-v1', referenceHash: input.reference.sha256, scope: 'uploaded reference', scoreType: 'raw_ranking_score' };
  input.externalSites = [{ transcript: 'other-transcript', position: input.target.position, context, score: 0.75, status: 'scored' }];
  let target = parse(buildScientistCsv(input))[0];
  assert.equal(target.lamar_score, '');
  assert.equal(target.lamar_score_available, 'false');
  assert.equal(target.lamar_status, 'site_unreported');
  input.externalSites.push({ transcript: input.target.id, position: input.target.position, context, score: null, status: 'unscored' });
  target = parse(buildScientistCsv(input))[0];
  assert.equal(target.lamar_score, '');
  assert.equal(target.lamar_score_available, 'false');
  assert.equal(target.lamar_status, 'unscored');
  input.externalSites[1].score = 0;
  input.externalSites[1].status = 'scored';
  target = parse(buildScientistCsv(input))[0];
  assert.equal(target.lamar_score, '0');
  assert.equal(target.lamar_score_available, 'true');
  assert.equal(target.lamar_status, 'scored');
});

test('empty external results leave the target missing while absent external results retain legacy context lookup', () => {
  const input = fixture();
  input.predictions = { modelVersion: 'legacy-lamar', referenceSet: 'legacy', scoreType: 'ranking_score', predictions: [{ context, score: 0.5 }] };
  assert.equal(parse(buildScientistCsv(input))[0].lamar_score, '0.5');
  input.externalSites = [];
  const target = parse(buildScientistCsv(input))[0];
  assert.equal(target.lamar_score, '');
  assert.equal(target.lamar_status, 'site_unreported');
  assert.equal(target.lamar_score_available, 'false');
});

test('RFC 4180 escaping preserves quotes, commas, Chinese text and embedded CRLF', () => {
  const input = fixture();
  input.target.id = '样本,"quoted"\r\nnext line';
  input.reference.name = 'RNA,reference';
  const rows = parse(buildScientistCsv(input));
  assert.equal(rows[0].target_id, input.target.id);
  assert.equal(rows[0].transcript_id, input.target.id);
  assert.equal(rows[0].reference_name, input.reference.name);
});

test('spreadsheet formula injection in string fields is neutralized, including hidden prefixes', () => {
  for (const payload of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1+1', '\t@SUM(A1)', '\r\n=1+1', '\u0000=1+1']) {
    const input = fixture();
    input.target.id = payload;
    input.reference.name = payload;
    input.libraryVersion = payload;
    const row = parse(buildScientistCsv(input))[0];
    assert.equal(row.target_id, `'${payload}`);
    assert.equal(row.reference_name, `'${payload}`);
    assert.equal(row.library_version, `'${payload}`);
  }
});

test('nonfinite model outputs remain missing and the exporter does not infer target validity', () => {
  const input = fixture();
  input.target = { id: 'short-input', sequence: 'ACGU', position: 2 };
  input.plan.sequence = null;
  input.plan.scaffold = null;
  input.externalSites = [{ transcript: 'external', position: 1, context: null, score: NaN, status: 'invalid-output' }];
  const rows = parse(buildScientistCsv(input));
  assert.equal(rows[0].site_position_1based, '2');
  assert.equal(rows[0].context_101nt, '');
  assert.equal(rows[0].protein_sequence, '');
  assert.equal(rows[0].protein_selected, 'false');
  assert.equal(rows[1].lamar_score, '');
  assert.equal(rows[1].lamar_score_available, 'false');
});
