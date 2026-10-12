'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Check,Download,FileUp,Loader2,RefreshCw,ScanLine} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {validateReferenceSites} from '@/lib/reference-sites';
import {MAX_FASTA_BYTES,OFFTARGET_MODEL_ID,targetKey,validateJobReceipt,validateOffTargetResult,resultMatchesInputs,type WorkflowTarget,type OffTargetState,type OffTargetRequest} from '@/lib/offtarget-workflow';

function saveJson(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function OffTargetWorkspace({target,disabled,serviceReady,state,onChange,onPreview}:{target:WorkflowTarget;disabled:boolean;serviceReady:boolean;state:OffTargetState;onChange:(value:OffTargetState)=>void;onPreview:(file:File)=>Promise<void>}){
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[query,setQuery]=useState('');
 const epoch=useRef(0),controller=useRef<AbortController|null>(null),latest=useRef(state),currentTarget=useRef(targetKey(target));
 useLayoutEffect(()=>{latest.current=state;currentTarget.current=targetKey(target);},[state,target]);
 useEffect(()=>()=>{epoch.current++;controller.current?.abort();},[]);
 const active=resultMatchesInputs(state,target)?state.result:null;
 const scopedRequest=state.request&&targetKey(state.request.target)===targetKey(target)&&state.request.reference.sha256===state.reference?.sha256&&state.request.reference.species===state.species.trim()?state.request:null;
 const job=scopedRequest?state.job:null;
 async function jsonRequest(path:string,init?:RequestInit){const response=await fetch('/api/workflow'+path,{...init,credentials:'same-origin',signal:controller.current?.signal});const body=await response.json().catch(()=>null);if(!response.ok)throw Error(typeof body?.error==='string'?body.error:`Model service returned HTTP ${response.status}.`);return body;}
 function invalidate(next:Partial<OffTargetState>){epoch.current++;controller.current?.abort();setError('');setMessage('');onChange({...state,...next,request:null,job:null,result:null});}
 async function chooseFile(file?:File){
  if(!file)return;
  const previous=state;const operation=++epoch.current;controller.current?.abort();controller.current=new AbortController();setBusy('Checking FASTA…');setError('');setMessage('');onChange({...state,file:null,reference:null,request:null,job:null,result:null});
  try{
   if(!file.size||file.size>MAX_FASTA_BYTES)throw Error('Upload an uncompressed transcript FASTA up to 100 MiB.');
   if(!((await file.slice(0,4096).text()).trimStart().startsWith('>')))throw Error('Expected a FASTA header beginning with >.');
   await validateReferenceSites(file,[],target,controller.current.signal);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
   if(operation!==epoch.current)return;
   const retain=previous.reference?.sha256===hash&&previous.reference.species===latest.current.species.trim()&&previous.request&&targetKey(previous.request.target)===targetKey(target);
   if(retain&&previous.result){await validateReferenceSites(file,previous.result.sites,target,controller.current.signal);if(operation!==epoch.current)return;}
   onChange({...latest.current,file,reference:retain&&previous.reference?previous.reference:{name:file.name,species:latest.current.species.trim(),kind:'transcript',sha256:hash,sizeBytes:file.size},request:retain?previous.request:null,job:retain?previous.job:null,result:retain?previous.result:null});setMessage('FASTA ready.');
  }catch(e){if(operation===epoch.current)setError((e as Error).message);}finally{if(operation===epoch.current)setBusy('');}
 }
 async function submit(){
  if(!state.file||!state.reference||!state.species.trim()||disabled||!serviceReady)return;
  const operation=++epoch.current,key=targetKey(target);controller.current?.abort();controller.current=new AbortController();setBusy('Submitting…');setError('');setMessage('');
  const request:OffTargetRequest={schemaVersion:1,requestId:scopedRequest&&!job?scopedRequest.requestId:crypto.randomUUID(),modelId:OFFTARGET_MODEL_ID,target:{...target},reference:{...state.reference,species:state.species.trim()},scoreType:'raw_ranking_score'};
  onChange({...state,reference:request.reference,request,job:null,result:null});
  try{const body=new FormData();body.append('metadata',JSON.stringify(request));body.append('fasta',state.file,state.file.name);const receipt=validateJobReceipt(await jsonRequest('/jobs',{method:'POST',body}),request);if(operation!==epoch.current||key!==currentTarget.current)return;onChange({...latest.current,reference:request.reference,request,job:receipt,result:null});setMessage('Submitted.');}
  catch(e){if(operation===epoch.current)setError((e as Error).message);}finally{if(operation===epoch.current)setBusy('');}
 }
 async function refresh(){
  if(!scopedRequest||!job||!state.file)return;const request=scopedRequest,operation=++epoch.current,key=targetKey(target);controller.current?.abort();controller.current=new AbortController();setBusy('Checking status…');setError('');
  try{const receipt=validateJobReceipt(await jsonRequest('/jobs/'+encodeURIComponent(job.id)),request,job.id);if(operation!==epoch.current||key!==currentTarget.current)return;onChange({...latest.current,job:receipt,result:null});if(receipt.status==='succeeded'){const result=validateOffTargetResult(await jsonRequest('/jobs/'+encodeURIComponent(job.id)+'/result'),request,job.id);await validateReferenceSites(state.file,result.sites,target,controller.current?.signal);if(operation!==epoch.current||key!==currentTarget.current)return;onChange({...latest.current,job:receipt,result});setMessage(`${result.sites.length} sites verified.`);}else setMessage('Status: '+receipt.status+'.');}
  catch(e){if(operation===epoch.current)setError((e as Error).message);}finally{if(operation===epoch.current)setBusy('');}
 }
 async function importResult(file?:File){
  if(!file||!state.file||!state.reference||!state.species.trim())return;const operation=++epoch.current,key=targetKey(target);controller.current?.abort();controller.current=new AbortController();setBusy('Checking result…');setError('');
  try{if(file.size>40*1024*1024)throw Error('Result JSON limit: 40 MiB.');const data=JSON.parse(await file.text());const request:OffTargetRequest=scopedRequest??{schemaVersion:1,requestId:typeof data.requestId==='string'?data.requestId:'',modelId:OFFTARGET_MODEL_ID,target:{...target},reference:{...state.reference,species:state.species.trim()},scoreType:'raw_ranking_score'};if(!/^[A-Za-z0-9_-]{1,128}$/.test(request.requestId))throw Error('Invalid request ID.');const result=validateOffTargetResult(data,request,job?.id);await validateReferenceSites(state.file,result.sites,target,controller.current?.signal);if(operation!==epoch.current||key!==currentTarget.current)return;onChange({...latest.current,reference:request.reference,request,job:{id:result.jobId,requestId:request.requestId,referenceSha256:request.reference.sha256,status:'succeeded'},result});setMessage('Results imported.');}
  catch(e){if(operation===epoch.current)setError((e as Error).message);}finally{if(operation===epoch.current)setBusy('');}
 }
 const visible=active?.sites.filter(s=>s.transcript.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity))??[];
 return <section className="panel model-workflow-panel">
  <div className="panel-heading"><h2>LAMAR</h2><span className={`pill ${serviceReady?'green':'neutral'}`}>{serviceReady?'Ready':'Offline'}</span></div>
  <p className="model-label">RNA-context scores · PUF-independent</p>
  <div className="model-workflow-body"><div className="workflow-input-grid"><label htmlFor="reference-species">Species<Input id="reference-species" placeholder="Homo sapiens" maxLength={200} value={state.species} disabled={!!busy||disabled} onChange={e=>invalidate({species:e.target.value,reference:state.reference?{...state.reference,species:e.target.value.trim()}:null})}/></label><label htmlFor="species-fasta">Transcript FASTA · ≤100 MiB<Input id="species-fasta" type="file" accept=".fa,.fasta,.fna,.fas,.txt" disabled={!!busy||disabled} onChange={e=>{void chooseFile(e.target.files?.[0]);e.target.value='';}}/></label></div>
  <p className="model-label">mRNA / cDNA · RNA orientation · Unique transcript IDs</p>
  {state.reference&&!state.file&&<p className="notice">Reselect the same FASTA to verify saved results.</p>}{state.reference&&<div className="reference-receipt"><FileUp size={20}/><div><b>{state.reference.name}</b><span>{(state.reference.sizeBytes/1024).toFixed(1)} KiB</span></div><Check size={18}/></div>}
  <div className="builder-actions"><Button disabled={disabled||!!busy||!serviceReady||!state.file||!state.species.trim()} onClick={()=>void submit()}>{busy?<Loader2 size={16} className="spin"/>:<ScanLine size={16}/>}{scopedRequest&&!job?'Resume':'Run LAMAR'}</Button><Button variant="outline" disabled={disabled||!!busy||!state.file||state.file.size>100000} onClick={async()=>{if(!state.file)return;setError('');setBusy('Reading subset…');try{await onPreview(state.file);setMessage('Subset applied.');}catch(e){setError((e as Error).message);}finally{setBusy('');}}}>Preview · ≤25,000 nt</Button></div>
  {busy&&<p role="status">{busy}</p>}{error&&<p className="notice error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
  {job&&<div className="workflow-job"><div><span className={`pill ${job.status==='succeeded'?'green':'neutral'}`}>{job.status}</span>{job.message&&<p>{job.message}</p>}</div><Button variant="outline" disabled={!!busy||disabled||!serviceReady||!state.file} onClick={()=>void refresh()}><RefreshCw size={15}/>Refresh</Button></div>}
  <details className="workflow-import"><summary>Details & import</summary><p className="model-label">Run uploads the RNA, species and FASTA to the model service. Preview is a local sequence search.</p><p className="model-label">Genomic FASTA needs transcript conversion. Cross-species accuracy is unvalidated. Raw scores are not editing probabilities.</p>{state.reference&&<p className="model-label">Reference SHA-256<br/><code>{state.reference.sha256}</code></p>}{job&&<p className="model-label">Job: <code>{job.id}</code></p>}{active&&<p className="model-label">Model: {active.modelVersion}</p>}<label htmlFor="lamar-workflow-result">Import result JSON<Input id="lamar-workflow-result" type="file" accept=".json" disabled={!!busy||disabled||!state.file||!state.reference||!state.species.trim()} onChange={e=>{void importResult(e.target.files?.[0]);e.target.value='';}}/></label><div className="builder-actions">{scopedRequest&&<Button variant="outline" onClick={()=>saveJson('ORCA-LAMAR-request.json',scopedRequest)}><Download size={14}/>Save request</Button>}{active&&<Button variant="outline" onClick={()=>saveJson('ORCA-LAMAR-result.json',active)}><Download size={14}/>Save result</Button>}</div></details>
  {active&&<><div className="workflow-result-heading"><div><h3>Sites</h3><p>{active.sites.length} total · {active.sites.filter(s=>s.score!==null).length} scored</p></div><Input aria-label="Search model site transcript IDs" placeholder="Find transcript…" value={query} onChange={e=>setQuery(e.target.value)}/></div><Table><TableHeader><TableRow><TableHead>Transcript</TableHead><TableHead>C position · 1-based</TableHead><TableHead>Raw score</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{visible.slice(0,100).map((s,i)=><TableRow key={i}><TableCell>{s.transcript}{s.transcript===target.id&&s.position===target.position&&<span className="pill neutral">Target</span>}</TableCell><TableCell>{s.position}</TableCell><TableCell>{s.score===null?'—':s.score.toFixed(4)}</TableCell><TableCell>{s.status.replaceAll('_',' ')}</TableCell></TableRow>)}</TableBody></Table><p className="model-label">{Math.min(100,visible.length)} / {visible.length} shown · CSV includes all sites. Missing scores do not mean zero risk.</p>{!active.sites.length&&<p className="notice">No sites returned; off-target editing is not ruled out.</p>}</>}
  </div>
 </section>;
}
