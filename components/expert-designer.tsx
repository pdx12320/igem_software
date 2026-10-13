'use client';
import {Download,RotateCcw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {modulePlan,type Candidate,type ModuleLibrary} from '@/lib/design';
import {sourceOrder,defaultOrder,referenceEditable,preferredCodes} from '@/lib/architecture';
export default function ExpertDesigner({candidate:c,library,overrides,active,onActive,onOrder,onOverrides,error}:{candidate:Candidate;library:ModuleLibrary;overrides:Record<number,string>;active:number;onActive:(p:number)=>void;onOrder:(order:number[])=>void;onOverrides:(v:Record<number,string>)=>void;error:string}){
 const plan=modulePlan(c,library,overrides),order=sourceOrder(library,c.n),row=plan.rows[active-1],editable=referenceEditable(library,c.n);
 function selectSource(source:number){const next=[...order];next[active-1]=source;onOrder(next);}
 function exportSequence(){if(!plan.sequence)return;const url=URL.createObjectURL(new Blob([`>PUF_${order.join('-')}\n${plan.sequence}\n`],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='PUF-advanced-design.fasta';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <div className="expert-designer">
 <div className="position-deck">{plan.rows.map(r=><button key={r.repeat} className={`position-card ${r.repeat===active?'selected':''}`} aria-pressed={r.repeat===active} aria-label={`Edit P${r.repeat}, source R${order[r.repeat-1]}, TRM ${r.selected?.trm||'unassigned'}`} onClick={()=>onActive(r.repeat)}><span>P{r.repeat}</span><strong>R{order[r.repeat-1]}</strong><code>{r.selected?.trm||'—'}</code><small>RNA {r.base}</small>{r.selected?.preferredForRepeat&&<i aria-label="Preferred for source R and RNA">★</i>}</button>)}</div>
 <section className="panel expert-controls"><div className="panel-heading"><div><h3>P{active} · R{order[active-1]} · {row.selected?.trm||'Choose TRM'}</h3><p>RNA {row.base} · coordinate {c.end-active+1}</p></div><Button variant="outline" disabled={!editable} onClick={()=>onOrder(defaultOrder(c.n))}><RotateCcw size={15}/>Reset order</Button></div>
 {error&&<p role="alert" className="notice error">{error}</p>}
 <label>Source repeat for P{active}</label><div className="source-picker">{Array.from({length:8},(_,i)=>i+1).map(r=><button key={r} disabled={!editable} aria-pressed={order[active-1]===r} className={order[active-1]===r?'selected':''} onClick={()=>selectSource(r)}><b>R{r}</b><span>{preferredCodes(r,row.base).length?`${preferredCodes(r,row.base).length} ★ options`:'Shared TRMs'}</span></button>)}</div>
 {!editable&&<p className="notice amber">Source rearrangement needs an audited reference scaffold.</p>}{!plan.scaffold&&<p className="notice amber">Protein assembly requires a matching {c.n}R scaffold.</p>}
 <label htmlFor="expert-trm">TRM for P{active} / R{order[active-1]}</label><NativeSelect id="expert-trm" aria-label={`Select TRM for P${active} source R${order[active-1]}`} value={row.selected?.id||''} disabled={!row.options.length} onChange={e=>onOverrides({...overrides,[active]:e.target.value})}>{row.options.map(m=><option key={m.id} value={m.id}>{m.preferredForRepeat?'★ ':''}{m.trm}</option>)}</NativeSelect>
 <div className="source-picker trm-code-picker">{row.options.filter(m=>m.preferredForRepeat).map(m=><button key={m.id} aria-pressed={m.id===row.selected?.id} className={m.id===row.selected?.id?'selected':''} onClick={()=>onOverrides({...overrides,[active]:m.id})}><b><span className="visible-star">★</span> {m.trm}</b></button>)}</div>
 <div className="builder-actions"><Button variant="outline" onClick={()=>onActive(active===c.n?1:active+1)}>Next position · P{active===c.n?1:active+1}</Button><Button variant="outline" disabled={!plan.sequence} onClick={exportSequence}><Download size={15}/>Protein FASTA</Button></div></section>
 </div>;
}
