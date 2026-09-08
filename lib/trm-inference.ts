/** Passive JSON inference port of PUF_alphafold dynamic_classification.
 * No model claims about structural stability or continuous editing efficiency.
 */
export type Site = 'C388' | 'C871' | 'C295';
export type Matrix = number[][];
type Tree = { left: number[]; right: number[]; feature: number[]; threshold: number[]; highScore: number[] };
export type PortableModel = { site: Site; modelName: string; featureKind: string; kind: 'logistic' | 'forest'; labelThresholdPercent: number; scoreThreshold: number; wtPR: Matrix; wtFeatureValues?: number[]; mean?: number[]; scale?: number[]; coefficients?: number[]; intercept?: number; regions?: number[][]; trees?: Tree[]; nFeatures?: number; validation: Record<string, unknown>[] };
export type PortableModels = { version: number; commit: string; scope: { wtProtein: string; prefix: string; suffix: string; uploadedProteinLength: number; trimFirstProteinTokens: number; rnaBySite: Record<Site, string> }; models: Record<Site, PortableModel> };
const sum = (a: number[]) => a.reduce((n, x) => n + x, 0);
const mean = (a: number[]) => sum(a) / a.length;
// NumPy rounds ties to even. Source CP values are rounded to two decimals.
function round4(x: number) { const y = Math.abs(x) * 10000; const lo = Math.floor(y), frac = y - lo; const rounded = Math.abs(frac - .5) < 1e-10 ? lo + (lo % 2) : Math.round(y); return Math.sign(x) * rounded / 10000; }
export function validatePR(pr: unknown): asserts pr is Matrix {
  if (!Array.isArray(pr) || pr.length !== 512 || pr.some(row => !Array.isArray(row) || row.length !== 15 || row.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1))) throw new Error('Expected a finite 512 × 15 protein–RNA contact-probability matrix with values in [0, 1].');
}
/** Protein is the exact sequence used in the uploaded AF3 prediction. */
export function checkModelScope(bundle: PortableModels, protein: string, rna: string): { site: Site; changedPositions: number[]; wt: boolean; mutatedRepeatPositions: number[]; observedPositionGroup: boolean; scopeStatus: string } {
  const { wtProtein, prefix, suffix, rnaBySite } = bundle.scope;
  if (protein.length !== 519 || !protein.startsWith(prefix) || !protein.endsWith(suffix)) throw new Error('TRM models require the model-compatible 519-aa construct, including its original flanking sequences. Fold this exact sequence; a 492-aa structure cannot be padded.');
  const site = (Object.keys(rnaBySite) as Site[]).find(s => rnaBySite[s] === rna);
  if (!site) throw new Error('The saved TRM models require exactly the original 15-nt C388, C871 or C295 RNA.');
  const starts = [24,60,96,132,168,204,240,276,312,348,384,427];
  const allowed = new Set(starts.flatMap(start => [11,12,15].map(i => start + i + 16)));
  const changedPositions: number[] = [];
  for (let i = 0; i < protein.length; i++) if (protein[i] !== wtProtein[i]) { if (!allowed.has(i)) throw new Error('This sequence changes residues outside the original TRM positions. The three-site TRM models have not been validated for changed repeat architecture or backbone.'); changedPositions.push(i + 1); }
  const mutatedRepeatPositions = starts.flatMap((start, p) => changedPositions.some(i => [11,12,15].some(k => i === start + k + 17)) ? [p + 1] : []);
  const observedPositionGroup = ['4','5','6','7','8','4,7'].includes(mutatedRepeatPositions.join(','));
  return { site, changedPositions, wt: changedPositions.length === 0, mutatedRepeatPositions, observedPositionGroup, scopeStatus: changedPositions.length === 0 ? 'WT reference; excluded from training' : observedPositionGroup ? 'Exploratory; observed mutation-position group' : 'Extrapolation; unobserved mutation-position group' };
}
export function modelCompatibleSequence(bundle: PortableModels, core: string): string {
  if (!/^[ACDEFGHIKLMNPQRSTVWY]{492}$/.test(core)) throw new Error('The model-compatible export requires a 492-aa PUF12 core.');
  const protein = bundle.scope.prefix + core + bundle.scope.suffix;
  checkModelScope(bundle, protein, bundle.scope.rnaBySite.C388);
  return protein;
}
/** 8 features in the exact training order. Top20 means 20 matrix cells. */
export function interfaceFeatures(pr: Matrix): number[] {
  validatePR(pr);
  const flat = pr.flat(), total = sum(flat), rnaMax = Array.from({ length: 15 }, (_, j) => Math.max(...pr.map(row => row[j]))), proteinMax = pr.map(row => Math.max(...row));
  return [total, total / 15, mean(flat.sort((a,b) => b-a).slice(0,20)), mean(rnaMax), Math.min(...rnaMax), rnaMax.filter(x => x > .5).length / 15, proteinMax.filter(x => x > .5).length / 512, flat.filter(x => x > .5).length / 15];
}
/** Each argument matrix is a separate seed mean. Do not pool seeds as extra experimental samples. */
export function modelFeatures(model: PortableModel, seedPR: Matrix[]): number[] {
  if (!seedPR.length || seedPR.length > 100) throw new Error('Provide 1–100 seed-level CP matrices.');
  seedPR.forEach(validatePR);
  if (model.kind === 'logistic') {
    const fs = seedPR.map(interfaceFeatures);
    return fs[0].map((_, i) => mean(fs.map(f => f[i])) - model.wtFeatureValues![i]);
  }
  const vectors = seedPR.map(pr => pr.map((row, i) => {
    const top: number[] = [], delta: number[] = [];
    for (const start of [0, 5, 10]) {
      const values = row.slice(start, start+5).sort((a,b) => b-a);
      top.push(...values.slice(0,3).map(round4));
      delta.push(round4(round4(values[0]) - round4(Math.max(...model.wtPR[i].slice(start,start+5)))));
    }
    return [...top, ...delta];
  }));
  return model.regions!.flatMap(region => Array.from({ length: 12 }, (_, k) => mean(region.map(i => mean(vectors.map(v => v[i][k]))))));
}
/** Class score is uncalibrated. It is not an editing-percent prediction. */
export function predictFeatures(model: PortableModel, features: number[]): number {
  const expected = model.kind === 'logistic' ? model.mean!.length : model.nFeatures!;
  if (features.length !== expected || features.some(x => !Number.isFinite(x))) throw new Error('Model input feature shape or values are invalid.');
  if (model.kind === 'logistic') {
    const z = model.intercept! + sum(features.map((x, i) => (x - model.mean![i]) / model.scale![i] * model.coefficients![i]));
    return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
  }
  return mean(model.trees!.map(tree => {
    let node = 0, steps = 0;
    while (tree.left[node] !== -1) { if (++steps > tree.left.length) throw new Error('Invalid model tree.'); node = Math.fround(features[tree.feature[node]]) <= tree.threshold[node] ? tree.left[node] : tree.right[node]; }
    return tree.highScore[node];
  }));
}
export function predictPR(bundle: PortableModels, site: Site, seedPR: Matrix[]) {
  const model = bundle.models[site], features = modelFeatures(model, seedPR), score = predictFeatures(model, features);
  return { site, modelName: model.modelName, features, score, scoreThreshold: model.scoreThreshold, predictedClass: score >= model.scoreThreshold ? 'higher activity' : 'lower activity', labelThresholdPercent: model.labelThresholdPercent, scoreKind: 'uncalibrated high-activity classification score', commit: bundle.commit };
}
/** Call only after checking that the matching request/CIF actually contains protein and RNA. */
export function extractAF3PR(bundle: PortableModels, data: unknown, protein: string, rna: string): { site: Site; pr: Matrix } {
  const scope = checkModelScope(bundle, protein, rna);
  const d = data as { token_chain_ids?: unknown; contact_probs?: unknown; token_res_ids?: unknown };
  if (!d || !Array.isArray(d.token_chain_ids) || !Array.isArray(d.contact_probs)) throw new Error('AF3 full_data.json must include token_chain_ids and contact_probs.');
  const chains = d.token_chain_ids, cp = d.contact_probs;
  if (chains.length !== 534 || chains.some(c => c !== 'A' && c !== 'B') || cp.length !== chains.length || cp.some(row => !Array.isArray(row) || row.length !== chains.length || row.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1))) throw new Error('AF3 CP matrix must match exactly 519 protein tokens and 15 RNA tokens in chains A/B.');
  const proteinIdx = chains.flatMap((c,i) => c === 'A' ? [i] : []), rnaIdx = chains.flatMap((c,i) => c === 'B' ? [i] : []);
  if (proteinIdx.length !== 519 || rnaIdx.length !== 15) throw new Error('Incorrect chain lengths for the saved TRM models.');
  if (d.token_res_ids !== undefined) {
    const ids = d.token_res_ids;
    if (!Array.isArray(ids) || ids.length !== chains.length || [proteinIdx, rnaIdx].some(indices => indices.some((token,i) => ids[token] !== i + 1))) throw new Error('AF3 token residue IDs must be consecutive and in sequence order.');
  }
  const pr = proteinIdx.slice(7).map(i => rnaIdx.map(j => cp[i][j] as number));
  validatePR(pr);return { site: scope.site, pr };
}
