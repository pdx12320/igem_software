import templates from '../data/repeat-templates.json';
import matrix from '../data/trm-matrix.json';
import {validateLibrary,modulePlan,type Candidate,type ModuleLibrary,type Scaffold} from './design';
export const WT_ORDER=[1,2,3,5,6,7,5,6,7,6,7,8];
export function defaultOrder(n:number){return n===12?[...WT_ORDER]:n===8?[1,2,3,4,5,6,7,8]:[1,2,3,...Array.from({length:n-4},(_,i)=>[5,6,7][i%3]),8];}
export function sourceOrder(lib:ModuleLibrary,n:number){return lib.sourceOrders?.[n]||lib.scaffolds.find(s=>s.repeats===n)?.repeatSources||defaultOrder(n);}
export function preferredCodes(source:number,base:string){return (matrix.rows[source-1] as Record<string,string[]>)[base]||[];}
export function referenceEditable(lib:ModuleLibrary,n:number){
 const ref=templates.references.find(r=>r.repeats===n),scaffold=lib.scaffolds.find(s=>s.repeats===n);if(!scaffold)return !ref;
 if(!ref||scaffold.ncap!==ref.ncap||scaffold.ccap!==ref.ccap)return false;
 const order=sourceOrder(lib,n);
 return scaffold.modules.every(m=>{const slot=ref.slots[m.repeat-1],core=order[m.repeat-1]===slot.sourceRepeat?slot.core:templates.nativeSources[order[m.repeat-1]-1].core;const expected=core+slot.suffix;return m.sequence.length===expected.length&&[...m.sequence].every((a,i)=>[11,12,15].includes(i)||a===expected[i]);});
}
export function withArchitecture(lib:ModuleLibrary,n:number,order:number[]):ModuleLibrary{
 if(order.length!==n||order.some(x=>!Number.isInteger(x)||x<1||x>8))throw Error('Choose one source R1–R8 per position.');
 if(!referenceEditable(lib,n))throw Error('This imported scaffold has a different backbone. Keep its TRM design or restore the built-in library to rearrange native sources.');
 const next=structuredClone(lib);next.sourceOrders={...next.sourceOrders,[n]:[...order]};
 const ref=templates.references.find(r=>r.repeats===n);
 const current=next.scaffolds.find(s=>s.repeats===n);
 if(!ref||!current)return next;
 const modules:Scaffold['modules']=[];const repeatMap:NonNullable<Scaffold['repeatMap']>=[];let start=ref.ncap.length+1;
 order.forEach((source,i)=>{
  const slot=ref.slots[i];const core=source===slot.sourceRepeat?slot.core:templates.nativeSources[source-1].core;
  const sequence=core+slot.suffix;
  repeatMap.push({repeat:i+1,nativeRepeat:source,start1:start,end1:start+sequence.length-1,sequence});start+=sequence.length;
  for(const base of ['A','C','G','U']){
   const codes=(next.trmOptions||[]).filter(m=>m.base===base).sort((a,b)=>Number(!preferredCodes(source,base).includes(a.trm))-Number(!preferredCodes(source,base).includes(b.trm)));
   for(const code of codes){const s=sequence.split('');[11,12,15].forEach((p,j)=>s[p]=code.trm[j]);modules.push({...code,id:`ARCH-${n}-${order.join('')}-P${i+1}-${base}-${code.trm}`,repeat:i+1,sequence:s.join(''),sourceRepeat:source,nativeRepeat:source,preferredForRepeat:preferredCodes(source,base).includes(code.trm),transfer:true});}
  }
 });
 const scaffold:Scaffold={id:`${ref.id}__${order.join('-')}`,repeats:n,ncap:ref.ncap,ccap:ref.ccap,modules,repeatSources:[...order],repeatMap,architectureLabel:order.every((r,i)=>r===ref.sourceOrder[i])?'Reference source order':'Custom source order · unvalidated',evidence:'Reference caps and slot insertions preserved; same-source reference cores retained; changed sources use exact native 36-aa cores. New combinations require validation.'};
 next.scaffolds=next.scaffolds.map(s=>s.repeats===n?scaffold:s);
 return validateLibrary(next);
}
export function repeatSpans(scaffold:Scaffold|null|undefined){if(!scaffold)return [];let start=scaffold.ncap.length+1;return Array.from({length:scaffold.repeats},(_,i)=>{const m=scaffold.modules.find(m=>m.repeat===i+1);const span={position:i+1,start,end:start+35};start+=m?.sequence.length||36;return span;});}
export function baselineProtein(lib:ModuleLibrary,n:number){if(!referenceEditable(lib,n))return null;const ref=templates.references.find(r=>r.repeats===n);if(!ref)return null;const order=sourceOrder(lib,n);return ref.ncap+order.map((r,i)=>(r===ref.slots[i].sourceRepeat?ref.slots[i].core:templates.nativeSources[r-1].core)+ref.slots[i].suffix).join('')+ref.ccap;}
export function af3Input(protein:string,rnas:{id:string;sequence:string}[]){return rnas.map(r=>({name:`PUF_${r.id}`,modelSeeds:[1],sequences:[{proteinChain:{sequence:protein,count:1}},{rnaSequence:{sequence:r.sequence,count:1}}],dialect:'alphafoldserver',version:1}));}

/** Change source modules while retaining every compatible per-position TRM selection. */
export function updateSourceOrder(lib:ModuleLibrary,c:Candidate,overrides:Record<number,string>,order:number[]){
 const oldOrder=sourceOrder(lib,c.n);if(order.length===oldOrder.length&&order.every((r,i)=>r===oldOrder[i]))return {library:lib,overrides};
 const before=modulePlan(c,lib,overrides),next=withArchitecture(lib,c.n,order),after=modulePlan(c,next),selected:Record<number,string>={};
 for(const old of before.rows){if(!old.selected)continue;const row=after.rows[old.repeat-1];const sameCode=row.options.find(m=>m.trm===old.selected!.trm);
  if(sameCode){selected[old.repeat]=sameCode.id;continue;}
  if(oldOrder[old.repeat-1]===order[old.repeat-1]&&after.scaffold){
   const id=`${after.scaffold.id}-preserved-P${old.repeat}-${old.base}-${old.selected.trm}`;
   after.scaffold.modules.push({...old.selected,id,sourceRepeat:order[old.repeat-1],preferredForRepeat:preferredCodes(order[old.repeat-1],old.base).includes(old.selected.trm)});selected[old.repeat]=id;
  }
 }
 validateLibrary(next);return {library:next,overrides:selected};
}
