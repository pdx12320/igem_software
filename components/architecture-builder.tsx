'use client';
import {useState} from 'react';
import {ArrowRight,Download,RotateCcw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {modulePlan,type Candidate,type ModuleLibrary} from '@/lib/design';
import {defaultOrder,updateSourceOrder,referenceEditable,sourceOrder,withArchitecture,preferredCodes,baselineProtein,repeatSpans,af3Input} from '@/lib/architecture';
import type {StructureResult} from '@/lib/af3-analysis';
import StructureAssessment from './structure-assessment';
import ExpertDesigner from './expert-designer';
export function saveFile(name:string,value:unknown){const text=typeof value==='string'?value:JSON.stringify(value,null,2);const url=URL.createObjectURL(new Blob([text],{type:name.endsWith('.json')?'application/json':'text/plain'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function ArchitectureBuilder({candidate:c,library,overrides,onLibrary,onOverrides,rna,evidence,onEvidence,level,onLevel:setLevel}:{candidate:Candidate;library:ModuleLibrary;overrides:Record<number,string>;onLibrary:(v:ModuleLibrary)=>void;onOverrides:(v:Record<number,string>)=>void;rna:string;level:string;onLevel:(v:string)=>void;evidence:StructureResult[];onEvidence:(v:StructureResult[])=>void}){
 const [phase,setPhase]=useState('architecture'),[active,setActive]=useState(1),[error,setError]=useState('');
 const order=sourceOrder(library,c.n),plan=modulePlan(c,library,overrides),pos=Math.min(active,c.n),row=plan.rows[pos-1];
 const editable=referenceEditable(library,c.n);
 const baseline=baselineProtein(library,c.n);const spans=repeatSpans(plan.scaffold);
 function apply(order:number[]){try{const next=updateSourceOrder(library,c,overrides,order);onLibrary(next.library);onOverrides(next.overrides);setError('');}catch(e){setError((e as Error).message);}}
 function defaults(){onOverrides(Object.fromEntries(plan.rows.filter(r=>r.selected).map(r=>[r.repeat,(r.options.find(m=>m.preferredForRepeat)||r.options[0]).id])));}
 return <section className="architecture-workspace">
 <div className="builder-topline"><div><p className="eyebrow">02 / BUILD YOUR PUF</p><h2>Arrange. Inspect. Refine.</h2></div><Tabs value={level} onValueChange={setLevel}><TabsList aria-label="Experience level"><TabsTrigger value="beginner">Beginner</TabsTrigger><TabsTrigger value="expert">Advanced</TabsTrigger></TabsList></Tabs></div>
 <div className="fixed-window-summary"><span>Selected RNA · {c.start}–{c.end}</span><code>{c.motif}</code><span>{c.n} positions · protein N → C</span></div>
 {level==='expert'?<ExpertDesigner candidate={c} library={library} overrides={overrides} active={pos} onActive={setActive} onOrder={apply} onOverrides={onOverrides} evidence={evidence} onEvidence={onEvidence} rna={rna} error={error}/>:<Tabs value={phase} onValueChange={setPhase}><TabsList className="builder-phases" aria-label="PUF design stages"><TabsTrigger value="architecture">A · Repeat order</TabsTrigger><TabsTrigger value="trm">B · TRM choices</TabsTrigger><TabsTrigger value="effects">C · TRM assessment</TabsTrigger></TabsList>
 {error&&<p role="alert" className="notice error">{error}</p>}
 <div className="position-deck">{plan.rows.map(r=><button key={r.repeat} className={`position-card ${r.repeat===pos?'selected':''}`} aria-pressed={r.repeat===pos} onClick={()=>setActive(r.repeat)}><span>P{r.repeat}</span><strong>R{order[r.repeat-1]}</strong><code>{phase==='architecture'?c.motif[c.n-r.repeat]:r.selected?.trm||'—'}</code>{phase!=='architecture'&&r.selected?.preferredForRepeat&&<i aria-label="Preferred TRM">★</i>}</button>)}</div>
 <TabsContent value="architecture"><div className="panel secondary-panel"><div className="panel-heading"><div><h3>{level==='beginner'?'Start with the reference order':`P${pos} · choose its source repeat`}</h3><p>{level==='beginner'?`${c.n===8||c.n===12?'Reference scaffold':'Exploratory TRM plan'} · ${order.map(r=>'R'+r).join(' / ')}`:`RNA base ${row.base} · position ${c.end-pos+1}`}</p></div><Button variant="outline" disabled={!editable} onClick={()=>apply(defaultOrder(c.n))}><RotateCcw size={15}/>Reset order</Button></div>
 {level==='expert'&&<div className="source-picker">{Array.from({length:8},(_,i)=>i+1).map(r=><button key={r} disabled={!editable} aria-pressed={order[pos-1]===r} className={order[pos-1]===r?'selected':''} onClick={()=>{const next=[...order];next[pos-1]=r;apply(next);}}><b>R{r}</b><span>{preferredCodes(r,row.base).length} preferred TRMs for {row.base}</span></button>)}</div>}
 {!editable&&<p className="notice amber">Imported backbone: source rearrangement requires the built-in reference. Your current TRM design remains available.</p>}{!plan.scaffold&&<p className="notice amber">Source choices and TRMs are available. A matching {c.n}R scaffold is required for protein assembly.</p>}
 <div className="builder-actions"><Button onClick={()=>setPhase('trm')}>Use this order · choose TRMs <ArrowRight size={15}/></Button></div></div>
 <StructureAssessment key={'backbone-'+c.n} protein={baseline} spans={spans} rna={rna} stage="backbone" evidence={evidence} onEvidence={onEvidence}/>
 </TabsContent>
 <TabsContent value="trm"><div className="panel secondary-panel"><div className="panel-heading"><div><h3>{level==='beginner'?'Your starter TRM design':`P${pos} · R${order[pos-1]} · ${row.base}`}</h3><p>★ Native source R preference for the paired RNA base.</p></div><Button variant="outline" onClick={defaults}>Apply preferred TRMs</Button></div>
 {level==='expert'?<><div className="source-picker trm-code-picker">{row.options.filter(m=>m.preferredForRepeat).map(m=><button key={m.id} className={m.id===row.selected?.id?'selected':''} aria-pressed={m.id===row.selected?.id} onClick={()=>onOverrides({...overrides,[pos]:m.id})}><b><span className="visible-star">★</span> {m.trm}</b></button>)}</div>{!row.options.some(m=>m.preferredForRepeat)&&<p>No native R{order[pos-1]} preference is documented for {row.base}.</p>}<label htmlFor="active-trm">All available TRMs for P{pos}</label><NativeSelect id="active-trm" value={row.selected?.id||''} onChange={e=>onOverrides({...overrides,[pos]:e.target.value})}>{row.options.map(m=><option key={m.id} value={m.id}>{m.preferredForRepeat?'★ ':''}{m.trm}</option>)}</NativeSelect></>:<div className="beginner-summary"><strong>{plan.rows.filter(r=>r.selected?.preferredForRepeat).length} / {c.n}</strong><span>positions use a native-source preferred TRM. Other positions use the shared base-specific matrix. Switch to Advanced to change individual choices.</span></div>}
 <div className="builder-actions"><Button onClick={()=>setPhase('effects')}>Inspect TRM effects <ArrowRight size={15}/></Button><Button variant="outline" disabled={!plan.sequence} onClick={()=>saveFile('PUF-designed-protein.fasta',`>PUF_${order.join('-')}\n${plan.sequence}\n`)}><Download size={15}/>Protein FASTA</Button></div></div>
 </TabsContent>
 <TabsContent value="effects"><StructureAssessment key={'trm-'+c.n} protein={plan.sequence} spans={spans} rna={rna} stage="trm" evidence={evidence} onEvidence={onEvidence}/></TabsContent>
 </Tabs>}</section>;
}
