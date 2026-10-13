'use client';
import {useState} from 'react';
import type {Candidate,ModuleLibrary} from '@/lib/design';
import {updateSourceOrder} from '@/lib/architecture';
import type {StructureResult} from '@/lib/af3-analysis';
import ExpertDesigner from './expert-designer';
export function saveFile(name:string,value:unknown){const text=typeof value==='string'?value:JSON.stringify(value,null,2);const url=URL.createObjectURL(new Blob([text],{type:name.endsWith('.json')?'application/json':'text/plain'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function ArchitectureBuilder({candidate:c,library,overrides,onLibrary,onOverrides}:{candidate:Candidate;library:ModuleLibrary;overrides:Record<number,string>;onLibrary:(v:ModuleLibrary)=>void;onOverrides:(v:Record<number,string>)=>void;rna:string;level:string;onLevel:(v:string)=>void;evidence:StructureResult[];onEvidence:(v:StructureResult[])=>void}){
 const [active,setActive]=useState(1),[error,setError]=useState('');
 const pos=Math.min(active,c.n);
 function apply(order:number[]){try{const next=updateSourceOrder(library,c,overrides,order);onLibrary(next.library);onOverrides(next.overrides);setError('');}catch(e){setError((e as Error).message);}}
 return <section className="architecture-workspace">
 <div className="builder-topline"><h2>Build PUF</h2></div>
 <div className="fixed-window-summary"><span>Selected RNA · {c.start}–{c.end}</span><code>{c.motif}</code></div>
 <ExpertDesigner candidate={c} library={library} overrides={overrides} active={pos} onActive={setActive} onOrder={apply} onOverrides={onOverrides} error={error}/>
 </section>;
}
