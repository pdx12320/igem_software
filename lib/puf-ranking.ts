export const RANK_MODEL_ID = 'module2-fixed492' as const;
export const RANK_REFERENCE_SHA256 = '2b981a33277b03de9a6542f27baf6c56626ec3f21c774f017cb5880ac05b32f9';
export const RANK_SOURCE_CHECKPOINT_SHA256 = 'c0fb39463be5468a2a20739a1838f4ed1a4405003b8914e71eec82984739c34e';
export const RANK_COMPATIBILITY_VERSION = 'drop-fixed-terminal-g-v1' as const;
export const RANK_SCORE_DEFINITION = 'C388_hat - (C295_hat + C871_hat)/2' as const;
export const RANK_SCOPE = 'fixed-assay-C295-C388-C871' as const;
export const MAX_RANK_CANDIDATES = 50;

export type RankCandidate = {id: string; label: string; protein: string;
  normalization?: typeof RANK_COMPATIBILITY_VERSION; originalProtein?: string};
export type RankedRow = {
  id: string; protein: string; rank: number;
  C295_hat: number; C388_hat: number; C871_hat: number;
  S_hat: number; ESM2_score: number;
};
export type RankResult = {
  schemaVersion: 1; modelId: typeof RANK_MODEL_ID; modelVersion: string;
  referenceSha256: string; scoreDefinition: typeof RANK_SCORE_DEFINITION;
  sourceCheckpointSha256: string; compatibilityVersion: typeof RANK_COMPATIBILITY_VERSION;
  scope: typeof RANK_SCOPE; rows: RankedRow[]; source: 'bundled' | 'service' | 'imported';
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate and copy snapshots; callers cannot mutate the input through the result. */
export function validateRankCandidates(value: unknown): RankCandidate[] {
  if (!Array.isArray(value) || value.length > MAX_RANK_CANDIDATES) {
    throw Error('Keep at most 50 candidate proteins in the queue.');
  }
  const ids = new Set<string>(), proteins = new Set<string>();
  return value.map(item => {
    if (!record(item) || typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(item.id)) {
      throw Error('Candidate IDs must be 1–120 letters, digits, dots, colons, underscores or hyphens, starting with a letter or digit.');
    }
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 200 || /[\x00-\x1f\x7f]/.test(item.label)) {
      throw Error('Each candidate needs a name of 1–200 characters.');
    }
    if (typeof item.protein !== 'string' || !/^[ACDEFGHIKLMNPQRSTVWY]{1,2000}$/.test(item.protein)) {
      throw Error('Each protein must contain 1–2,000 uppercase standard amino acids.');
    }
    if ((item.normalization !== undefined || item.originalProtein !== undefined) &&
      (item.normalization !== RANK_COMPATIBILITY_VERSION || item.protein.length !== 492 ||
       item.originalProtein !== item.protein + 'G')) {
      throw Error('Normalized candidates must preserve their original 493-aa sequence with only terminal G removed.');
    }
    if (ids.has(item.id)) throw Error('Duplicate candidate ID: ' + item.id + '.');
    if (proteins.has(item.protein)) throw Error('Duplicate protein sequence: ' + item.id + '.');
    ids.add(item.id); proteins.add(item.protein);
    return {id: item.id, label: item.label.trim(), protein: item.protein,
      ...(item.normalization === RANK_COMPATIBILITY_VERSION ? {normalization: RANK_COMPATIBILITY_VERSION, originalProtein: item.originalProtein as string} : {})};
  });
}

/** User-authorized coordinate normalization; other lengths and terminal variants stay unchanged. */
export function normalizeRankCandidates(value: RankCandidate[]): RankCandidate[] {
  const normalized = validateRankCandidates(value).map(candidate => candidate.protein.length === 493 && candidate.protein.endsWith('G')
    ? {...candidate, protein: candidate.protein.slice(0, 492), originalProtein: candidate.protein, normalization: RANK_COMPATIBILITY_VERSION}
    : candidate);
  return validateRankCandidates(normalized);
}

export function parseCandidateFasta(text: string): RankCandidate[] {
  if (text.length > 200_000) throw Error('Protein FASTA limit: 200 KB.');
  const candidates: RankCandidate[] = [];
  let current: RankCandidate | null = null;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('>')) {
      if (current) candidates.push(current);
      const header = line.slice(1).trim(), id = header.split(/\s+/)[0];
      current = {id, label: header, protein: ''};
      if (candidates.length >= MAX_RANK_CANDIDATES) throw Error('Protein FASTA limit: 50 records.');
    } else {
      if (!current) throw Error('Protein FASTA must start with a >identifier header.');
      current.protein += line.toUpperCase();
      if (current.protein.length > 2000) throw Error('Protein FASTA limit: 2,000 amino acids per record.');
    }
  }
  if (current) candidates.push(current);
  if (!candidates.length) throw Error('Protein FASTA contains no records.');
  return normalizeRankCandidates(candidates);
}

/** Preserve existing IDs; skip an already queued sequence without changing it. */
export function mergeRankCandidates(existing: RankCandidate[], added: RankCandidate[]): RankCandidate[] {
  const merged = validateRankCandidates(existing);
  for (const item of validateRankCandidates(added)) {
    const sameId = merged.find(candidate => candidate.id === item.id);
    if (sameId && sameId.protein !== item.protein) throw Error('Candidate ID already belongs to a different protein: ' + item.id + '.');
    if (!merged.some(candidate => candidate.protein === item.protein)) merged.push({...item});
  }
  return validateRankCandidates(merged);
}

/** Validate received measurements without producing predictions or changing scores. */
export function validateRankResult(value: unknown, candidates: RankCandidate[], source: RankResult['source'] = 'imported'): RankResult {
  const expected = validateRankCandidates(candidates);
  if (!expected.length || expected.some(candidate => candidate.protein.length !== 492)) {
    throw Error('This result requires a nonempty queue of 492-aa proteins in the fixed reference alignment.');
  }
  if (!record(value) || value.schemaVersion !== 1 || value.modelId !== RANK_MODEL_ID ||
    typeof value.modelVersion !== 'string' || !value.modelVersion.trim() || value.modelVersion.length > 200 ||
    value.referenceSha256 !== RANK_REFERENCE_SHA256 || value.sourceCheckpointSha256 !== RANK_SOURCE_CHECKPOINT_SHA256 ||
    value.compatibilityVersion !== RANK_COMPATIBILITY_VERSION ||
    value.scoreDefinition !== RANK_SCORE_DEFINITION || value.scope !== RANK_SCOPE || !['bundled', 'service', 'imported'].includes(source)) {
    throw Error('Result provenance must identify schema 1, module2-fixed492, model version, source checkpoint, terminal-G compatibility version, reference SHA256 and fixed three-assay score definition.');
  }
  if (!Array.isArray(value.rows) || value.rows.length !== expected.length) {
    throw Error('Results must contain exactly one row for every queued candidate.');
  }
  const expectedById = new Map(expected.map(candidate => [candidate.id, candidate]));
  const seen = new Set<string>();
  const fields = ['C295_hat', 'C388_hat', 'C871_hat', 'S_hat', 'ESM2_score'] as const;
  const rows = value.rows.map(item => {
    if (!record(item) || typeof item.id !== 'string' || seen.has(item.id)) throw Error('Result candidate IDs must be unique.');
    const candidate = expectedById.get(item.id);
    if (!candidate || item.protein !== candidate.protein) throw Error('Result candidate ID and complete protein must exactly match the queue.');
    if (fields.some(field => typeof item[field] !== 'number' || !Number.isFinite(item[field]))) {
      throw Error('All received model scores must be finite numbers; missing values cannot be treated as zero.');
    }
    const numbers = Object.fromEntries(fields.map(field => [field, item[field]])) as Pick<RankedRow, typeof fields[number]>;
    const formula = numbers.C388_hat - numbers.C295_hat / 2 - numbers.C871_hat / 2;
    const tolerance = 1e-9 * Math.max(1, Math.abs(formula), Math.abs(numbers.S_hat));
    if (!Number.isFinite(formula) || Math.abs(numbers.S_hat - formula) > tolerance) {
      throw Error('Received S_hat does not match C388_hat - (C295_hat + C871_hat)/2.');
    }
    seen.add(item.id);
    return {id: item.id, protein: candidate.protein, ...numbers, rank: 0};
  });
  // Match archived predict.py: descending S_hat, then ascending candidate ID.
  rows.sort((a, b) => b.S_hat - a.S_hat || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  rows.forEach((row, index) => { row.rank = index + 1; });
  return {
    schemaVersion: 1, modelId: RANK_MODEL_ID, modelVersion: value.modelVersion,
    referenceSha256: RANK_REFERENCE_SHA256, scoreDefinition: RANK_SCORE_DEFINITION,
    sourceCheckpointSha256: RANK_SOURCE_CHECKPOINT_SHA256, compatibilityVersion: RANK_COMPATIBILITY_VERSION,
    scope: RANK_SCOPE, rows, source,
  };
}
