// Transport and evidence validation only. Biological inference runs in the model service.
export const OFFTARGET_MODEL_ID = 'module4-lamar-101';
export const MAX_FASTA_BYTES = 100 * 1024 * 1024;
export type WorkflowTarget = {id:string;sequence:string;position:number;motif:string;bindingStart:number};
export type UploadedReference = {name:string;species:string;kind:'transcript';sha256:string;sizeBytes:number};
export type OffTargetRequest = {schemaVersion:1;requestId:string;modelId:typeof OFFTARGET_MODEL_ID;target:WorkflowTarget;reference:UploadedReference;scoreType:'raw_ranking_score'};
export type JobReceipt = {id:string;requestId:string;referenceSha256:string;status:'queued'|'running'|'succeeded'|'failed';message?:string};
export type OffTargetSite = {transcript:string;position:number;context:string|null;score:number|null;bindingStart?:number;mismatches?:number;status:'scored'|'unscored'|'insufficient_context'};
export type OffTargetResult = {schemaVersion:1;jobId:string;requestId:string;modelId:typeof OFFTARGET_MODEL_ID;modelVersion:string;referenceSha256:string;species:string;referenceKind:'transcript';scope:'uploaded-transcript-fasta';scoreType:'raw_ranking_score';target:WorkflowTarget;sites:OffTargetSite[]};
export type OffTargetState = {file:File|null;reference:UploadedReference|null;species:string;request:OffTargetRequest|null;job:JobReceipt|null;result:OffTargetResult|null};
export const emptyOffTargetState:OffTargetState = {file:null,reference:null,species:'',request:null,job:null,result:null};
export function targetKey(target:WorkflowTarget){return JSON.stringify([target.id,target.sequence,target.position,target.motif,target.bindingStart]);}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected a JSON object.');return value as Record<string,unknown>;}
function text(value:unknown,max=300):value is string{return typeof value==='string'&&value.trim().length>0&&value.length<=max;}
export function validateJobReceipt(value:unknown,request:OffTargetRequest,expectedId?:string):JobReceipt{
 const x=object(value);
 if(!text(x.id,128)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x.id)||x.requestId!==request.requestId||x.referenceSha256!==request.reference.sha256||!['queued','running','succeeded','failed'].includes(x.status as string)||(expectedId!==undefined&&x.id!==expectedId))throw Error('Job receipt does not match the submitted request and reference.');
 if(x.message!==undefined&&!text(x.message,1000))throw Error('Invalid job status message.');
 return {id:x.id,requestId:request.requestId,referenceSha256:request.reference.sha256,status:x.status as JobReceipt['status'],...(typeof x.message==='string'?{message:x.message}:{})};
}
export function validateOffTargetResult(value:unknown,request:OffTargetRequest,expectedJobId?:string):OffTargetResult{
 const x=object(value),t=object(x.target);
 if(x.schemaVersion!==1||x.modelId!==OFFTARGET_MODEL_ID||!text(x.modelVersion)||!text(x.jobId,128)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x.jobId)||x.requestId!==request.requestId||x.referenceSha256!==request.reference.sha256||x.species!==request.reference.species||x.referenceKind!=='transcript'||x.scope!=='uploaded-transcript-fasta'||x.scoreType!=='raw_ranking_score'||(expectedJobId!==undefined&&x.jobId!==expectedJobId))throw Error('Results must match this job, species, reference checksum and model contract.');
 if(t.id!==request.target.id||t.sequence!==request.target.sequence||t.position!==request.target.position||t.motif!==request.target.motif||t.bindingStart!==request.target.bindingStart)throw Error('Results belong to a different RNA target or binding interval.');
 if(!Array.isArray(x.sites)||x.sites.length>100000)throw Error('Expected at most 100,000 site rows; export larger results from the service.');
 const seen=new Set<string>();
 const sites=x.sites.map(value=>{
  const s=object(value);
  if(!text(s.transcript)||!Number.isSafeInteger(s.position)||(s.position as number)<1||!['scored','unscored','insufficient_context'].includes(s.status as string))throw Error('Site rows need a transcript ID, 1-based C position and status.');
  if(s.context!==null&&(typeof s.context!=='string'||!/^([ACGU]{50})C([ACGU]{50})$/.test(s.context)))throw Error('A scored RNA context must be 101 nt with central C.');
  if(s.score!==null&&(typeof s.score!=='number'||!Number.isFinite(s.score)))throw Error('Raw ranking scores must be finite numbers, or null when unavailable.');
  if((s.status==='scored'&&(s.context===null||s.score===null))||(s.status!=='scored'&&s.score!==null)||(s.status==='insufficient_context'&&s.context!==null))throw Error('Site status is inconsistent with its context and score.');
  if(s.bindingStart!==undefined&&(!Number.isSafeInteger(s.bindingStart)||(s.bindingStart as number)<1))throw Error('Binding start must be a positive 1-based coordinate.');
  if(s.mismatches!==undefined&&(!Number.isSafeInteger(s.mismatches)||(s.mismatches as number)<0||(s.mismatches as number)>request.target.motif.length))throw Error('Invalid mismatch count.');
  const key=JSON.stringify([s.transcript,s.position,s.bindingStart??null]);if(seen.has(key))throw Error('Duplicate site row.');seen.add(key);
  return {transcript:s.transcript,position:s.position as number,context:s.context as string|null,score:s.score as number|null,status:s.status as OffTargetSite['status'],...(s.bindingStart===undefined?{}:{bindingStart:s.bindingStart as number}),...(s.mismatches===undefined?{}:{mismatches:s.mismatches as number})};
 });
 const contexts=new Map<string,number>();
 for(const s of sites)if(s.context&&s.score!==null){const previous=contexts.get(s.context);if(previous!==undefined&&previous!==s.score)throw Error('Identical RNA contexts have conflicting scores.');contexts.set(s.context,s.score);}
 return {schemaVersion:1,jobId:x.jobId,requestId:request.requestId,modelId:OFFTARGET_MODEL_ID,modelVersion:x.modelVersion,referenceSha256:request.reference.sha256,species:request.reference.species,referenceKind:'transcript',scope:'uploaded-transcript-fasta',scoreType:'raw_ranking_score',target:{...request.target},sites};
}
export function resultMatchesInputs(state:OffTargetState,target:WorkflowTarget){
 const {result,request,reference,job}=state;
 // A restored project has no live FASTA; reselect and verify its sites before reuse.
 return !!state.file&&!!result&&!!request&&!!reference&&state.species.trim()===reference.species&&request.reference.species===reference.species&&result.species===reference.species&&targetKey(request.target)===targetKey(target)&&targetKey(result.target)===targetKey(target)&&request.reference.sha256===reference.sha256&&result.referenceSha256===reference.sha256&&result.requestId===request.requestId&&result.modelId===request.modelId&&result.scoreType===request.scoreType&&(!job||(job.id===result.jobId&&job.requestId===request.requestId&&job.referenceSha256===reference.sha256&&job.status==='succeeded'));
}
export function predictionsFromResult(result:OffTargetResult){
 const scored=new Map<string,number>();for(const s of result.sites)if(s.context&&s.score!==null)scored.set(s.context,s.score);
 return {modelVersion:result.modelVersion,referenceSet:result.referenceSha256,scoreType:'raw_ranking_score' as const,predictions:[...scored].map(([context,score])=>({context,score}))};
}
