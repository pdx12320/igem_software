import library from '../data/puf-library.json';
import {
  RANK_MODEL_ID, RANK_REFERENCE_SHA256, RANK_SOURCE_CHECKPOINT_SHA256,
  RANK_COMPATIBILITY_VERSION, RANK_SCOPE, RANK_SCORE_DEFINITION,
  validateRankCandidates, validateRankResult, type RankCandidate, type RankResult,
} from './puf-ranking';

const ALPHABET = 'ACDEFGHIKLMNPQRSTVWY';
const ORIGINAL_REFERENCE_SHA256 = '62851bee43beb3484bec54ab7b5d0e78f2aea96cf6dd452d6f2ee65eec843142';
type Fit = {
  assay: 'C295' | 'C388' | 'C871'; name: string; oneHotCoefficients: number[];
  esmCoefficient: number; mean: number; std: number; weight: number; intercept: number;
  droppedTerminalCoefficients: number[];
};
export type LocalRankerModel = {
  schemaVersion: 1; modelId: string; modelVersion: string; sourceCheckpointSha256: string;
  compatibilityVersion: string; aaAlphabet: string; reference492: string; originalReference493: string;
  referenceSha256: string; originalReferenceSha256: string;
  scoreLogp: {dtype: 'float64'; shape: number[]; values: number[][]}; fits: Fit[];
};

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function numbers(value: unknown, count: number): value is number[] { return Array.isArray(value) && value.length === count && value.every(finite); }

/** Validate passive data only; no executable checkpoint is loaded in the browser. */
export function validateLocalRankerModel(value: unknown): LocalRankerModel {
  const model = value as LocalRankerModel;
  const reference = library.scaffolds.find(scaffold => scaffold.id === 'PUF12-9_WT')?.wildTypeSequence;
  if (!model || model.schemaVersion !== 1 || model.modelId !== RANK_MODEL_ID ||
    typeof model.modelVersion !== 'string' || !model.modelVersion.trim() ||
    model.sourceCheckpointSha256 !== RANK_SOURCE_CHECKPOINT_SHA256 || model.compatibilityVersion !== RANK_COMPATIBILITY_VERSION ||
    model.aaAlphabet !== ALPHABET || model.reference492 !== reference ||
    model.originalReference493 !== reference + 'G' || model.referenceSha256 !== RANK_REFERENCE_SHA256 ||
    model.originalReferenceSha256 !== ORIGINAL_REFERENCE_SHA256 ||
    model.scoreLogp?.dtype !== 'float64' || !Array.isArray(model.scoreLogp.shape) ||
    model.scoreLogp.shape.length !== 2 || model.scoreLogp.shape[0] !== 492 || model.scoreLogp.shape[1] !== 20 ||
    !Array.isArray(model.scoreLogp.values) || model.scoreLogp.values.length !== 492 ||
    !model.scoreLogp.values.every(row => numbers(row, 20)) || !Array.isArray(model.fits) || model.fits.length !== 3) {
    throw Error('Bundled ranker data does not match the audited 492-aa compatibility model.');
  }
  for (const [index, fit] of model.fits.entries()) {
    if (!fit || fit.assay !== ['C295', 'C388', 'C871'][index] || fit.name !== 'Hsu_ESM2_OneHot_Ridge' ||
      !numbers(fit.oneHotCoefficients, 492 * 20) || !numbers(fit.droppedTerminalCoefficients, 20) ||
      fit.droppedTerminalCoefficients.some(coefficient => coefficient !== 0) ||
      ![fit.esmCoefficient, fit.mean, fit.std, fit.weight, fit.intercept].every(finite) || fit.std <= 0 || fit.weight !== 1) {
      throw Error('Bundled Ridge coefficients or stored calibration are invalid.');
    }
  }
  return model;
}

/** Apply the archived numerical formula to its fixed-coordinate 492-aa representation. */
export function rankWithModel(candidates: RankCandidate[], input: unknown): RankResult {
  const snapshot = validateRankCandidates(candidates), model = validateLocalRankerModel(input);
  if (!snapshot.length || snapshot.some(candidate => candidate.protein.length !== 492)) {
    throw Error('Local ranking requires 492-aa substitution variants in the approved reference alignment.');
  }
  const rows = snapshot.map(candidate => {
    let score = 0;
    const changes: {position: number; original: number; replacement: number}[] = [];
    for (let position = 0; position < 492; position += 1) {
      if (candidate.protein[position] === model.reference492[position]) continue;
      const original = ALPHABET.indexOf(model.reference492[position]);
      const replacement = ALPHABET.indexOf(candidate.protein[position]);
      // The archived table is float64. Preserve its subtraction and ordered sum.
      score += model.scoreLogp.values[position][replacement] - model.scoreLogp.values[position][original];
      changes.push({position, original, replacement});
    }
    const predictions = model.fits.map(fit => {
      let value = 0;
      for (const {position, original, replacement} of changes) {
        const offset = position * 20;
        // scipy's CSR dot traverses sorted feature indices; keep the same order.
        if (original < replacement) {
          value += -fit.oneHotCoefficients[offset + original];
          value += fit.oneHotCoefficients[offset + replacement];
        } else {
          value += fit.oneHotCoefficients[offset + replacement];
          value += -fit.oneHotCoefficients[offset + original];
        }
      }
      const standardized = (score - fit.mean) / fit.std * fit.weight;
      value += fit.esmCoefficient * standardized;
      return value + fit.intercept;
    });
    const [C295_hat, C388_hat, C871_hat] = predictions;
    return {id: candidate.id, protein: candidate.protein, C295_hat, C388_hat, C871_hat,
      S_hat: C388_hat - (C295_hat + C871_hat) / 2, ESM2_score: score};
  });
  return validateRankResult({schemaVersion: 1, modelId: RANK_MODEL_ID, modelVersion: model.modelVersion,
    referenceSha256: RANK_REFERENCE_SHA256, sourceCheckpointSha256: RANK_SOURCE_CHECKPOINT_SHA256,
    compatibilityVersion: RANK_COMPATIBILITY_VERSION, scoreDefinition: RANK_SCORE_DEFINITION,
    scope: RANK_SCOPE, rows}, snapshot, 'bundled');
}

let modelPromise: Promise<LocalRankerModel> | undefined;
export async function rankLocalCandidates(candidates: RankCandidate[]): Promise<RankResult> {
  const snapshot = validateRankCandidates(candidates);
  modelPromise ??= import('../data/puf-ranker-492.json').then(module => validateLocalRankerModel(module.default));
  return rankWithModel(snapshot, await modelPromise);
}
