import type { Candidate, Module, PredictionSet } from './design';

export type ScientistRankRow = {
  candidateId: string;
  protein: string;
  rank: number | null;
  /** Raw ranking-model S_hat; not an ESM-2 score or a probability. */
  score: number | null;
  esm2Score: number | null;
  c295Hat?: number | null;
  c388Hat?: number | null;
  c871Hat?: number | null;
  referenceSha256?: string;
  sourceCheckpointSha256?: string;
  compatibilityVersion?: string;
  source?: string;
  modelVersion: string;
  scope: string;
  status: string;
};

export type ScientistSiteRow = {
  transcript: string;
  /** 1-based coordinate in the supplied reference record. */
  position: number;
  context: string | null;
  score: number | null;
  bindingStart?: number;
  mismatches?: number;
  status: string;
};

export type ScientistResultMetadata = {
  modelVersion?: string;
  referenceHash?: string;
  scope?: string;
  scoreType?: 'ranking_score' | 'raw_ranking_score';
};

export type ScientistPredictionSet = Omit<PredictionSet, 'scoreType'> & {
  scoreType: 'ranking_score' | 'raw_ranking_score';
};

export type ScientistCsvInput = {
  target: { id: string; sequence: string; position: number };
  selected: Candidate;
  plan: {
    sequence: string | null;
    scaffold?: { id: string } | null;
    rows: { repeat: number; base: string; selected: Module | null }[];
  };
  libraryVersion: string;
  reference: {
    name: string;
    species: string;
    kind: 'transcript' | 'genome' | 'unspecified';
    sha256?: string;
  };
  esmRanks?: ScientistRankRow[];
  activeProteinCandidateId?: string | null;
  predictions?: ScientistPredictionSet | null;
  predictionMetadata?: ScientistResultMetadata;
  externalSites?: ScientistSiteRow[];
  externalMetadata?: ScientistResultMetadata;
};

/**
 * Rectangular CSV schema v1. Coordinates are 1-based in the named sequence record;
 * genome records are not converted to transcript coordinates. Record types:
 * - target: the requested target and selected design (always present).
 * - binding_site: one row for each already computed C site in each binding hit.
 * - binding_hit_no_c: a binding hit without a C site; site fields stay empty.
 * - external_site: every site returned by the external service, kept separately.
 * - protein_candidate: every imported protein ranking row, in input order.
 *
 * ESM-2, raw S_hat and LAMAR scores retain separate columns and original precision.
 * No combined probability is computed. Missing/nonfinite numbers stay empty;
 * genuine zero and negative numeric scores are retained. TRM assignments describe
 * only the selected plan, never an unselected candidate's unprovided modules.
 * When externalSites is supplied, the target score comes only from its reported
 * transcript/position row. Matching contexts at other loci never fill that score.
 * Callers must pass current result snapshots, clearing them when inputs change.
 * Known reference-hash mismatches suppress LAMAR scores, while retaining provenance.
 * Output uses a UTF-8 BOM, RFC 4180 quoting and CRLF record separators. Dangerous
 * string cells receive a leading apostrophe for safe spreadsheet import; numeric
 * values are serialized separately so negative numbers retain their numeric value.
 */
export const SCIENTIST_CSV_COLUMNS = [
  'record_type', 'target_id', 'target_position_1based', 'target_sequence',
  'design_id', 'protein_candidate_id', 'protein_selected', 'protein_sequence',
  'scaffold_id', 'trm_assignments', 'library_version', 'recognition_rna',
  'transcript_id', 'binding_rna', 'binding_start_1based', 'binding_end_1based',
  'site_position_1based', 'site_offset_nt', 'binding_mismatches', 'context_101nt',
  'esm_rank', 's_hat_raw', 'esm2_score', 'c295_hat', 'c388_hat', 'c871_hat',
  'esm_model_version', 'esm_scope', 'esm_status', 'esm_reference_sha256', 'esm_source',
  'esm_checkpoint_sha256', 'esm_compatibility_version',
  'lamar_score', 'lamar_score_available', 'lamar_score_type', 'lamar_status',
  'lamar_model_version', 'lamar_reference_set', 'lamar_scope', 'lamar_reference_sha256',
  'reference_name', 'reference_species', 'reference_kind', 'reference_sha256',
  'coordinate_system',
] as const;

type Cell = string | number | boolean | null | undefined;
type CsvRow = Partial<Record<(typeof SCIENTIST_CSV_COLUMNS)[number], Cell>>;

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let result = String(value);
  // Whitespace/control prefixes can hide spreadsheet formula triggers.
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/u.test(result)) result = `'${result}`;
  return /[",\r\n]/.test(result) ? `"${result.replaceAll('"', '""')}"` : result;
}

function mismatchedReference(input: ScientistCsvInput, metadata?: ScientistResultMetadata): boolean {
  return !!(input.reference.sha256 && metadata?.referenceHash &&
    input.reference.sha256.toLowerCase() !== metadata.referenceHash.toLowerCase());
}

function rankColumns(rank?: ScientistRankRow): CsvRow {
  return {
    esm_rank: finite(rank?.rank), s_hat_raw: finite(rank?.score),
    esm2_score: finite(rank?.esm2Score), esm_model_version: rank?.modelVersion,
    esm_scope: rank?.scope, esm_status: rank?.status,
    c295_hat: finite(rank?.c295Hat), c388_hat: finite(rank?.c388Hat),
    c871_hat: finite(rank?.c871Hat), esm_reference_sha256: rank?.referenceSha256,
    esm_source: rank?.source,
    esm_checkpoint_sha256: rank?.sourceCheckpointSha256,
    esm_compatibility_version: rank?.compatibilityVersion,
  };
}

/** Export already-computed results. Does not run or validate biological models. */
export function buildScientistCsv(input: ScientistCsvInput): string {
  const { target, selected, plan, reference } = input;
  const ranks = input.esmRanks ?? [];
  const active = ranks.find(row => row.candidateId === input.activeProteinCandidateId &&
    !!plan.sequence && row.protein === plan.sequence);
  const trms = plan.rows.map(row => {
    const selectedModule = row.selected;
    const source = selectedModule?.sourceRepeat ?? selectedModule?.nativeRepeat;
    return `P${row.repeat}:${row.base}:${selectedModule?.trm ?? ''}:module=${selectedModule?.id ?? ''}${source === undefined ? '' : `:source=R${source}`}`;
  }).join('; ');
  const common: CsvRow = {
    target_id: target.id, target_position_1based: target.position,
    target_sequence: target.sequence, design_id: selected.id,
    library_version: input.libraryVersion, recognition_rna: selected.motif,
    reference_name: reference.name, reference_species: reference.species,
    reference_kind: reference.kind, reference_sha256: reference.sha256,
    coordinate_system: '1-based sequence-record coordinates',
  };
  const chosen: CsvRow = {
    ...common, protein_candidate_id: active?.candidateId,
    protein_selected: !!plan.sequence, protein_sequence: plan.sequence,
    scaffold_id: plan.scaffold?.id, trm_assignments: trms,
    ...rankColumns(active),
  };
  const scores = new Map(input.predictions?.predictions.map(row => [row.context, row.score]) ?? []);
  const predictionMismatch = mismatchedReference(input, input.predictionMetadata);
  const contextColumns = (context: string | null): CsvRow => {
    const raw = context === null ? null : finite(scores.get(context));
    const score = predictionMismatch ? null : raw;
    return {
      context_101nt: context, lamar_score: score, lamar_score_available: score !== null,
      lamar_score_type: input.predictions?.scoreType,
      lamar_status: predictionMismatch ? 'reference_mismatch' : score !== null ? 'available' :
        context === null ? 'context_unavailable' : 'score_unavailable',
      lamar_model_version: input.predictions?.modelVersion ?? input.predictionMetadata?.modelVersion,
      lamar_reference_set: input.predictions?.referenceSet,
      lamar_scope: input.predictionMetadata?.scope,
      lamar_reference_sha256: input.predictionMetadata?.referenceHash,
    };
  };
  const fullTargetContext = Number.isInteger(target.position) && target.position > 50 &&
    target.position + 50 <= target.sequence.length
    ? target.sequence.slice(target.position - 51, target.position + 50) : null;
  const externalMismatch = mismatchedReference(input, input.externalMetadata);
  const externalScoreColumns = (site?: ScientistSiteRow): CsvRow => {
    const score = externalMismatch ? null : finite(site?.score);
    return {
      context_101nt: site?.context, lamar_score: score, lamar_score_available: score !== null,
      lamar_score_type: input.externalMetadata?.scoreType,
      lamar_status: externalMismatch ? 'reference_mismatch' : site?.status ?? 'site_unreported',
      lamar_model_version: input.externalMetadata?.modelVersion,
      lamar_scope: input.externalMetadata?.scope,
      lamar_reference_sha256: input.externalMetadata?.referenceHash,
    };
  };
  const targetScores = input.externalSites === undefined ? contextColumns(fullTargetContext) :
    externalScoreColumns(input.externalSites.find(site => site.transcript === target.id && site.position === target.position));
  const rows: CsvRow[] = [{
    ...chosen, record_type: 'target', transcript_id: target.id,
    binding_rna: selected.motif,
    binding_start_1based: selected.start, binding_end_1based: selected.end,
    site_position_1based: target.position, site_offset_nt: selected.offset,
    ...targetScores,
  }];
  for (const hit of selected.hits) {
    const hitRow: CsvRow = {
      ...chosen, transcript_id: hit.transcript, binding_start_1based: hit.start,
      binding_rna: hit.sequence,
      binding_end_1based: hit.start + hit.sequence.length - 1, binding_mismatches: hit.mismatches,
    };
    if (!hit.editingSites.length) {
      rows.push({ ...hitRow, record_type: 'binding_hit_no_c', ...contextColumns(null), lamar_status: 'no_c_site' });
    } else {
      for (const site of hit.editingSites) rows.push({
        ...hitRow, record_type: 'binding_site', site_position_1based: site.position,
        site_offset_nt: site.offset, ...contextColumns(site.context),
      });
    }
  }
  for (const site of input.externalSites ?? []) {
    rows.push({
      ...chosen, record_type: 'external_site', transcript_id: site.transcript,
      binding_start_1based: site.bindingStart, binding_mismatches: site.mismatches,
      site_position_1based: site.position, ...externalScoreColumns(site),
    });
  }
  for (const rank of ranks) {
    const isSelected = rank === active;
    rows.push({
      ...common, record_type: 'protein_candidate', protein_candidate_id: rank.candidateId,
      protein_selected: isSelected, protein_sequence: rank.protein,
      scaffold_id: isSelected ? plan.scaffold?.id : null,
      trm_assignments: isSelected ? trms : null, ...rankColumns(rank),
    });
  }
  return '\uFEFF' + [SCIENTIST_CSV_COLUMNS.join(','),
    ...rows.map(row => SCIENTIST_CSV_COLUMNS.map(column => cell(row[column])).join(',')),
  ].join('\r\n') + '\r\n';
}
