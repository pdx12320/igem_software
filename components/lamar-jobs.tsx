'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {validatePredictions,type PredictionSet} from '@/lib/design';
type Job={id:string;status:'queued'|'running'|'succeeded'|'failed';referenceId:string;message?:string};
type Reference={id:string;name:string};
export default function LamarJobs({target,onPredictions}:{target:{id:string;sequence:string;position:number;motif:string};onPredictions:(p:PredictionSet)=>void}){
 const [endpoint,setEndpoint]=useState(''),[connected,setConnected]=useState(''),[references,setReferences]=useState<Reference[]>([]),[referenceId,setReferenceId]=useState(''),[job,setJob]=useState<Job|null>(null),[resumeId,setResumeId]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[result,setResult]=useState<PredictionSet|null>(null);
 async function request(base:string,path:string,init:RequestInit={}){
  const r=await fetch(base+path,{...init,credentials:'omit',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json',...init.headers}});
  if(!r.ok)throw Error('Model service returned '+r.status+'.');return r.json();
 }
 function validateJob(v:Job){if(!v||typeof v.id!=='string'||!v.id||v.id.length>200||!['queued','running','succeeded','failed'].includes(v.status)||typeof v.referenceId!=='string'||(v.message!==undefined&&typeof v.message!=='string'))throw Error('Invalid job response.');return v;}
 async function act(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function connect(){await act(async()=>{const u=new URL(endpoint);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('Use an HTTPS service base URL without credentials or query parameters.');const base=u.href.replace(/\/$/,'');const r=await request(base,'/references');if(!Array.isArray(r.references)||!r.references.length||r.references.some((x:Reference)=>typeof x.id!=='string'||typeof x.name!=='string')||new Set(r.references.map((x:Reference)=>x.id)).size!==r.references.length)throw Error('Service must return a unique reference catalog.');setConnected(base);setReferences(r.references);setReferenceId(r.references[0].id);setJob(null);setResult(null);setMessage('Connected. Choose a versioned reference.');});}
 async function submit(){await act(async()=>{if(target.position<51||target.position+50>target.sequence.length)throw Error('A 101-nt target context is required. Load the full target transcript in step 01.');const j=validateJob(await request(connected,'/jobs',{method:'POST',body:JSON.stringify({referenceId,target,scope:'whole-transcriptome',scoreType:'ranking_score'})}));if(j.referenceId!==referenceId)throw Error('Service returned a different reference.');setJob(j);setResumeId(j.id);setResult(null);});}
 async function refresh(id:string){await act(async()=>{if(!id.trim())throw Error('Enter a job ID.');const j=validateJob(await request(connected,'/jobs/'+encodeURIComponent(id)));if(j.id!==id)throw Error('Job ID mismatch.');setJob(j);setResult(null);if(j.status==='succeeded'){const r=await request(connected,'/jobs/'+encodeURIComponent(j.id)+'/result');const p=validatePredictions(r);setResult(p);setMessage('Results available. Download or import the ranking scores.');}});}
 function exportJson(name:string,v:unknown){const u=URL.createObjectURL(new Blob([JSON.stringify(v,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 return <div className="jobs-panel"><h3>Whole-transcriptome jobs</h3><p>External LAMAR service required. Submit sends your target RNA.</p>
 <div className="lab-toolbar"><label>Service URL<Input value={endpoint} placeholder="https://your-model-service.example/api" onChange={e=>{setEndpoint(e.target.value);setConnected('');setJob(null);setResult(null);setReferences([]);}}/></label><Button disabled={busy||!endpoint} onClick={connect}>Connect</Button></div>
 <div className="lab-toolbar"><label>Reference transcriptome<NativeSelect disabled={!connected||busy} value={referenceId} onChange={e=>setReferenceId(e.target.value)}>{references.length?references.map(r=><option key={r.id} value={r.id}>{r.name} · {r.id}</option>):<option value="">Connect to load references</option>}</NativeSelect></label><Button disabled={busy||!connected} onClick={submit}>Submit target</Button></div>
 <div className="lab-toolbar"><label>Job ID<Input value={resumeId} onChange={e=>setResumeId(e.target.value)} placeholder="Saved job ID"/></label><Button variant="outline" disabled={busy||!connected||!resumeId} onClick={()=>refresh(resumeId)}>Check status</Button></div>
 {message&&<p role="status" className="notice">{message}</p>}{busy&&<p role="status">Contacting model service…</p>}
 {job&&<article className="job-card"><b>{job.id}</b><span>{job.status.toUpperCase()}</span><p>Reference: {job.referenceId}</p>{job.message&&<p>{job.message}</p>}<Button variant="outline" onClick={()=>exportJson('lamar-job-receipt.json',{service:connected,...job})}>Job receipt</Button><Button variant="outline" disabled={busy} onClick={()=>refresh(job.id)}>Refresh</Button></article>}
 {result&&<div className="lab-toolbar"><span>{result.modelVersion} · {result.predictions.length} contexts</span><Button onClick={()=>{onPredictions(result);setMessage('Scores imported into the design workbench.');}}>Import scores</Button><Button variant="outline" onClick={()=>exportJson('lamar-job-results.json',result)}>Download results</Button></div>}
 <a href="/lamar-service-contract.md" download>Service contract</a>
 </div>;
}
