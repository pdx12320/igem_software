'use client';
import {useMemo} from 'react';
import {Download,RotateCcw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {modulePlan,type Candidate,type ModuleLibrary} from '@/lib/design';
import {sourceOrder,defaultOrder,referenceEditable,repeatSpans,preferredCodes} from '@/lib/architecture';
import type {StructureResult} from '@/lib/af3-analysis';
import {assessmentReport,archivedAssessment} from '@/lib/assessment-report';
import {modelCompatibleSequence,checkModelScope,type PortableModels,type Site} from '@/lib/trm-inference';
import rawModels from '@/data/trm-models.json';
import StructureAssessment from './structure-assessment';
const models=rawModels as unknown as PortableModels;
export default function ExpertDesigner({candidate:c,library,overrides,active,onActive,onOrder,onOverrides,evidence,onEvidence,rna,error}:{candidate:Candidate;library:ModuleLibrary;overrides:Record<number,string>;active:number;onActive:(p:number)=>void;onOrder:(order:number[])=>void;onOverrides:(v:Record<number,string>)=>void;evidence:StructureResult[];onEvidence:(v:StructureResult[])=>void;rna:string;error:string}){
 const plan=modulePlan(c,library,overrides),order=sourceOrder(library,c.n),row=plan.rows[active-1],editable=referenceEditable(library,c.n);
 const uploaded=useMemo(()=>assessmentReport(evidence,plan.sequence),[evidence,plan.sequence]);
 const archived=useMemo(()=>archivedAssessment(plan.sequence),[plan.sequence]);
 let scope='';try{if(plan.sequence)scope=checkModelScope(models,modelCompatibleSequence(models,plan.sequence),models.scope.rnaBySite.C388).scopeStatus;}catch{}
 function selectSource(source:number){const next=[...order];next[active-1]=source;onOrder(next);}
 function exportSequence(){if(!plan.sequence)return;const url=URL.createObjectURL(new Blob([`>PUF_${order.join('-')}\n${plan.sequence}\n`],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='PUF-advanced-design.fasta';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <div className="expert-designer">
 <div className="position-deck">{plan.rows.map(r=><button key={r.repeat} className={`position-card ${r.repeat===active?'selected':''}`} aria-pressed={r.repeat===active} aria-label={`Edit P${r.repeat}, source R${order[r.repeat-1]}, TRM ${r.selected?.trm||'unassigned'}`} onClick={()=>onActive(r.repeat)}><span>P{r.repeat}</span><strong>R{order[r.repeat-1]}</strong><code>{r.selected?.trm||'—'}</code><small>RNA {r.base}</small>{r.selected?.preferredForRepeat&&<i aria-label="Preferred for source R and RNA">★</i>}</button>)}</div>
 <div className="expert-columns"><section className="panel expert-controls"><div className="panel-heading"><div><p className="eyebrow">EDIT POSITION</p><h3>P{active} · R{order[active-1]} · {row.selected?.trm||'Choose TRM'}</h3><p>Paired RNA: {row.base} at coordinate {c.end-active+1}</p></div><Button variant="outline" disabled={!editable} onClick={()=>onOrder(defaultOrder(c.n))}><RotateCcw size={15}/>Reset R order</Button></div>
 {error&&<p role="alert" className="notice error">{error}</p>}
 <label>Source repeat for P{active}</label><div className="source-picker">{Array.from({length:8},(_,i)=>i+1).map(r=><button key={r} disabled={!editable} aria-pressed={order[active-1]===r} className={order[active-1]===r?'selected':''} onClick={()=>selectSource(r)}><b>R{r}</b><span>{preferredCodes(r,row.base).length?`${preferredCodes(r,row.base).length} ★ options`:'Shared TRMs'}</span></button>)}</div>
 {!editable&&<p className="notice amber">Source rearrangement needs an audited reference scaffold.</p>}
 <label htmlFor="expert-trm">TRM for P{active} / R{order[active-1]}</label><NativeSelect id="expert-trm" aria-label={`Select TRM for P${active} source R${order[active-1]}`} value={row.selected?.id||''} disabled={!row.options.length} onChange={e=>onOverrides({...overrides,[active]:e.target.value})}>{row.options.map(m=><option key={m.id} value={m.id}>{m.preferredForRepeat?'★ ':''}{m.trm}</option>)}</NativeSelect>
 <div className="source-picker trm-code-picker">{row.options.filter(m=>m.preferredForRepeat).map(m=><button key={m.id} aria-pressed={m.id===row.selected?.id} className={m.id===row.selected?.id?'selected':''} onClick={()=>onOverrides({...overrides,[active]:m.id})}><b><span className="visible-star">★</span> {m.trm}</b></button>)}</div>
 <p className="model-label">★ Native R{order[active-1]} preference for {row.base}. Other positions keep their selections.</p>
 <div className="builder-actions"><Button variant="outline" onClick={()=>onActive(active===c.n?1:active+1)}>Next position · P{active===c.n?1:active+1}</Button><Button variant="outline" disabled={!plan.sequence} onClick={exportSequence}><Download size={15}/>Protein FASTA</Button></div></section>
 <aside className="expert-evaluation"><section className="panel auto-evaluation" aria-live="polite" aria-atomic="true"><p className="eyebrow">AUTO-EVALUATION</p><h3>Current whole PUF design</h3><span className="pill green">3 trained models loaded</span><p className="model-label">C388 / C295 / C871 reference RNAs</p><p className="model-label">P{active}: R{order[active-1]} / {row.selected?.trm||'—'} · {plan.sequence?plan.sequence.length+' aa':'Scaffold required'}</p>
 <div className="live-score-list">{(['C388','C295','C871'] as Site[]).map(site=>{const live=uploaded.find(r=>r.prediction?.site===site)?.prediction,record=archived?.sites.find(r=>r.site===site);const score=live?.score??record?.score;const m=models.models[site];return <div key={site} className="live-score"><div><b>{site}</b><small>{site==='C388'?'Reference target':'Reference off-target'}</small></div><div><strong>{score===undefined?'—':score.toFixed(3)}</strong><span>{score!==undefined?(score>=m.scoreThreshold?'Higher activity class':'Lower activity class'):!plan.sequence?'Scaffold required':!scope?'Outside TRM-model scope':'Matching AF3 CP required'}</span></div><p>{live?'Computed from matching uploaded CP':record?`Exact archived case · ${archived!.scoreKind}`:'No score for this sequence'}</p></div>;})}</div>
 {scope?<p className="model-label">{scope}. Scores update automatically when matching CP data are available.</p>:<p className="model-label">Changed backbones can be assessed with CP / PAE / pLDDT. The current TRM classifiers require the original PUF12 backbone.</p>}
 <p className="model-label">Frozen GitHub model version: {models.commit.slice(0,7)} · C388 logistic regression / C295 and C871 random forests.</p><p className="model-label">Whole-construct class scores · uncalibrated. C295 position-group-out balanced accuracy: 52.5%.</p>
 </section><StructureAssessment protein={plan.sequence} spans={repeatSpans(plan.scaffold)} rna={rna} stage="trm" evidence={evidence} onEvidence={onEvidence} displayResults={false}/>
 </aside></div>
 <details className="expert-structural-details"><summary>Inspect current structural evidence</summary><StructureAssessment protein={plan.sequence} spans={repeatSpans(plan.scaffold)} rna={rna} stage="trm" evidence={evidence} onEvidence={onEvidence}/></details>
 </div>;
}
