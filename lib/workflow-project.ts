import {validateRankCandidates, validateRankResult, type RankCandidate, type RankResult} from './puf-ranking';
import {
  emptyOffTargetState, MAX_FASTA_BYTES, OFFTARGET_MODEL_ID, targetKey,
  validateJobReceipt, validateOffTargetResult,
  type OffTargetState, type OffTargetRequest, type UploadedReference, type WorkflowTarget,
} from './offtarget-workflow';

export type WorkflowSnapshot = {candidates: RankCandidate[]; ranking: RankResult | null; offtarget: OffTargetState};
export type SavedWorkflow = {
  schemaVersion: 1; candidates: RankCandidate[]; ranking: RankResult | null;
  offtarget: Omit<OffTargetState, 'file'>;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected a workflow JSON object.');
  return value as Record<string, unknown>;
}
function boundedText(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value) && (allowEmpty || !!value.trim());
}
function validateTarget(value: unknown): WorkflowTarget {
  const target = object(value);
  if (!boundedText(target.id, 200) || /[\s<>]/.test(target.id) ||
    typeof target.sequence !== 'string' || !/^[ACGU]{1,25000}$/.test(target.sequence) ||
    !Number.isSafeInteger(target.position) || (target.position as number) < 1 || (target.position as number) > target.sequence.length ||
    target.sequence[(target.position as number) - 1] !== 'C' ||
    typeof target.motif !== 'string' || !/^[ACGU]{8,12}$/.test(target.motif) ||
    !Number.isSafeInteger(target.bindingStart) || (target.bindingStart as number) < 1 ||
    target.sequence.slice((target.bindingStart as number) - 1, (target.bindingStart as number) - 1 + target.motif.length) !== target.motif) {
    throw Error('Saved workflow target needs standard RNA, a 1-based C position and the exact 8–12 nt binding interval.');
  }
  return {id: target.id, sequence: target.sequence, position: target.position as number, motif: target.motif, bindingStart: target.bindingStart as number};
}
function validateReference(value: unknown): UploadedReference {
  const reference = object(value);
  if (!boundedText(reference.name, 512) || !boundedText(reference.species, 200, true) ||
    reference.species !== reference.species.trim() || reference.kind !== 'transcript' ||
    typeof reference.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(reference.sha256) ||
    !Number.isSafeInteger(reference.sizeBytes) || (reference.sizeBytes as number) < 1 || (reference.sizeBytes as number) > MAX_FASTA_BYTES) {
    throw Error('Saved reference needs its filename, species, transcript type, SHA256 and bounded byte size.');
  }
  return {name: reference.name, species: reference.species, kind: 'transcript', sha256: reference.sha256, sizeBytes: reference.sizeBytes as number};
}
function validateRequest(value: unknown, reference: UploadedReference, target?: WorkflowTarget): OffTargetRequest {
  const request = object(value), savedReference = validateReference(request.reference), savedTarget = validateTarget(request.target);
  if (request.schemaVersion !== 1 || request.modelId !== OFFTARGET_MODEL_ID || request.scoreType !== 'raw_ranking_score' ||
    typeof request.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(request.requestId) || !savedReference.species ||
    JSON.stringify(savedReference) !== JSON.stringify(reference) || (target && targetKey(savedTarget) !== targetKey(target))) {
    throw Error('Saved model request does not match the project target, species, reference or raw-score contract.');
  }
  return {schemaVersion: 1, requestId: request.requestId, modelId: OFFTARGET_MODEL_ID,
    target: savedTarget, reference: savedReference, scoreType: 'raw_ranking_score'};
}

/** Restore data only: browser File objects and running transports never survive a project file. */
export function restoreWorkflow(input: unknown, target?: WorkflowTarget): WorkflowSnapshot {
  const currentTarget = target ? validateTarget(target) : undefined;
  if (input === undefined) return {candidates: [], ranking: null, offtarget: {...emptyOffTargetState}};
  const saved = object(input);
  if (saved.schemaVersion !== 1) throw Error('Unsupported workflow project schema.');
  const candidates = validateRankCandidates(saved.candidates);
  let ranking: RankResult | null = null;
  if (saved.ranking !== null) {
    const ranked = object(saved.ranking);
    if (ranked.source !== 'bundled' && ranked.source !== 'service' && ranked.source !== 'imported') throw Error('Saved ranking requires its result source.');
    ranking = validateRankResult(ranked, candidates, ranked.source);
  }
  const source = object(saved.offtarget);
  if (!boundedText(source.species, 200, true)) throw Error('Invalid saved species name.');
  const species = source.species.trim();
  const reference = source.reference === null ? null : validateReference(source.reference);
  if (reference && reference.species !== species) throw Error('Saved species and reference metadata disagree.');
  let request: OffTargetRequest | null = null;
  if (source.request !== null) {
    if (!reference) throw Error('Saved model requests require reference metadata.');
    request = validateRequest(source.request, reference, currentTarget);
  }
  if (!request && (source.job !== null || source.result !== null)) throw Error('Saved job and results require their original model request.');
  const job = source.job === null ? null : validateJobReceipt(source.job, request!);
  if (source.result !== null && (!job || job.status !== 'succeeded')) throw Error('Saved results require the matching completed job receipt.');
  const result = source.result === null ? null : validateOffTargetResult(source.result, request!, job!.id);
  return {candidates, ranking, offtarget: {file: null, reference, species, request, job, result}};
}

/** Save immutable evidence, excluding the selected File and evidence for a previous target. */
export function serializeWorkflow(input: WorkflowSnapshot, target?: WorkflowTarget): SavedWorkflow {
  const currentTarget = target ? validateTarget(target) : undefined;
  const stale = !!(currentTarget && input.offtarget.request && targetKey(input.offtarget.request.target) !== targetKey(currentTarget));
  const {reference, species} = input.offtarget;
  const candidate: SavedWorkflow = {
    schemaVersion: 1, candidates: input.candidates, ranking: input.ranking,
    offtarget: {reference, species, request: stale ? null : input.offtarget.request,
      job: stale ? null : input.offtarget.job, result: stale ? null : input.offtarget.result},
  };
  const restored = restoreWorkflow(candidate, currentTarget);
  return {schemaVersion: 1, candidates: restored.candidates, ranking: restored.ranking,
    offtarget: {reference: restored.offtarget.reference, species: restored.offtarget.species,
      request: restored.offtarget.request, job: restored.offtarget.job, result: restored.offtarget.result}};
}
