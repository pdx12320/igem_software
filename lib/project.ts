import constructs from '../data/constructs.json';
import {checkStructure} from './structure-input';
import {analyze,normalizeRNA,parseFasta,validateLibrary,validatePredictions,modulePlan,type ModuleLibrary,type PredictionSet} from './design';
export type AssayRow={construct:string;site:'C388'|'C295'|'C871';assay:string;replicate:string;editingPercent:number};
export type Fusion={order:'PUF-linker-APOBEC'|'APOBEC-linker-PUF';linker:string;apobec:string};
export type LabState={assays:AssayRow[];fusion:Fusion;notes:string;structures?:Record<string,string>};
export const emptyLab:LabState={assays:[],fusion:{order:'PUF-linker-APOBEC',linker:'',apobec:''},notes:''};
export function validateAssays(value:unknown):AssayRow[]{
 if(!Array.isArray(value)||value.length>10000)throw Error('Expected up to 10,000 experiment rows.');
 const seen=new Set<string>();
 return value.map(r=>{
  if(!r||!['construct','assay','replicate'].every(k=>typeof r[k]==='string'&&r[k].trim()&&r[k].length<=200)||!['C388','C295','C871'].includes(r.site)||typeof r.editingPercent!=='number'||!Number.isFinite(r.editingPercent)||r.editingPercent<0||r.editingPercent>100)throw Error('Each row needs construct, site, assay, replicate and editingPercent (0–100).');
  const key=JSON.stringify([r.construct,r.site,r.assay,r.replicate]);if(seen.has(key))throw Error('Duplicate construct/site/assay/replicate.');seen.add(key);
  return {construct:r.construct,site:r.site,assay:r.assay,replicate:r.replicate,editingPercent:r.editingPercent};
 });
}
export function summarize(values:number[]){if(!values.length)return null;const mean=values.reduce((a,b)=>a+b,0)/values.length;return {n:values.length,mean,sd:values.length>1?Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(values.length-1)):null};}
export function proteinSequence(s:string){const out=s.replace(/\s/g,'').toUpperCase();if(!/^[ACDEFGHIKLMNPQRSTVWY]+$/.test(out)||out.length>10000)throw Error('Use a protein sequence of 1–10,000 standard amino acids.');return out;}
export function assembleFusion(puf:string|null,f:Fusion){
 if(!puf)throw Error('Select an 8R / 12R scaffold or supply a complete scaffold first.');
 const parts={PUF:proteinSequence(puf),linker:proteinSequence(f.linker),APOBEC:proteinSequence(f.apobec)};
 if(!['PUF-linker-APOBEC','APOBEC-linker-PUF'].includes(f.order))throw Error('Invalid fusion order.');
 let end=0;const domains=f.order.split('-').map(name=>{const seq=parts[name as keyof typeof parts];const start=end+1;end+=seq.length;return {name,start,end,sequence:seq};});
 return {sequence:domains.map(d=>d.sequence).join(''),domains};
}
export function validateLab(v:unknown):LabState{
 const x=v as LabState;
 if(!x||typeof x.notes!=='string'||x.notes.length>20000||!x.fusion||!['PUF-linker-APOBEC','APOBEC-linker-PUF'].includes(x.fusion.order)||typeof x.fusion.linker!=='string'||typeof x.fusion.apobec!=='string'||x.fusion.linker.length>10000||x.fusion.apobec.length>10000)throw Error('Invalid project lab data.');
 const structures:Record<string,string>={};let size=0;
 for(const [id,text] of Object.entries(x.structures||{})){const c=constructs.find(c=>c.id===id);if(!c||typeof text!=='string')throw Error('Unknown saved structure.');size+=text.length;if(size>10000000)throw Error('Saved structures exceed 10 MB.');structures[id]=checkStructure(text,c.sequence);}
 return {assays:validateAssays(x.assays),fusion:x.fusion,notes:x.notes,structures};
}
export type ProjectFile={kind:'puf-studio-project';version:1;target:{id:string;sequence:string;position:number};length:number;windowStart:number;referenceName:string;references:{id:string;sequence:string}[];library:ModuleLibrary;predictions:PredictionSet|null;overrides:Record<number,string>;lab:LabState};
export function restoreProject(input:unknown){
 const p=input as ProjectFile;
 if(!p||p.kind!=='puf-studio-project'||p.version!==1)throw Error('Upload a PUF Studio project, version 1.');
 if(!p.target||typeof p.target.sequence!=='string'||typeof p.target.id!=='string'||typeof p.referenceName!=='string'||!Array.isArray(p.references)||!p.overrides||typeof p.overrides!=='object')throw Error('Incomplete project.');
 const seq=normalizeRNA(p.target.sequence);
 if(p.references.some(r=>!r||typeof r.id!=='string'||typeof r.sequence!=='string'||/[\s<>]/.test(r.id)))throw Error('Invalid reference record.');
 const refs=p.references.length?parseFasta(p.references.map(r=>'>'+r.id+'\n'+r.sequence).join('\n')):[];
 const library=validateLibrary(p.library),predictions=p.predictions?validatePredictions(p.predictions):null,lab=validateLab(p.lab);
 const settings={recognitionLength:p.length,mismatch:2};const candidates=analyze(seq,p.target.position,p.target.id,refs,settings);
 const chosen=candidates.find(c=>c.start===p.windowStart);if(!chosen)throw Error('Saved window does not match the target.');
 const base=modulePlan(chosen,library);
 for(const [k,v] of Object.entries(p.overrides)){const row=base.rows.find(r=>r.repeat===Number(k));if(typeof v!=='string'||!row?.options.some(m=>m.id===v))throw Error('Saved TRM selection is incompatible with its library.');}
 return {p:{...p,target:{...p.target,sequence:seq},references:refs,library,predictions,lab},candidates,chosen,settings};
}
