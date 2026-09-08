import {analyze,modulePlan,validateLibrary,type ModuleLibrary} from './design';
export const CASE_RNA='ACAUGGAGGACGUGC';
export const CASE_REFS=[{id:'C295-fragment',sequence:'CGGAACUGGAGGAAC'},{id:'C871-fragment',sequence:'UGGUGGAAGACAUGC'}];
export function c388Case(base:ModuleLibrary,wt:string,trms:{repeat:number;wtTrm:string}[]){
 const library=structuredClone(base);library.version+='-WT-C388-case';
 const scaffold=library.scaffolds.find(s=>s.repeats===12)!;const overrides:Record<number,string>={};
 trms.forEach(r=>{const b=CASE_RNA[12-r.repeat],original=scaffold.modules.find(m=>m.repeat===r.repeat&&m.base===b)!;const existing=scaffold.modules.find(m=>m.repeat===r.repeat&&m.base===b&&m.trm===r.wtTrm);if(existing){overrides[r.repeat]=existing.id;return;}const seq=original.sequence.split('');[11,12,15].forEach((p,i)=>seq[p]=r.wtTrm[i]);const id='case-wt-R'+r.repeat;scaffold.modules.push({...original,id,trm:r.wtTrm,sequence:seq.join(''),preferredForRepeat:false,evidence:'Exact WT from user-supplied PUF12 FASTA; case baseline, not a new matrix preference.'});overrides[r.repeat]=id;});
 validateLibrary(library);const settings={recognitionLength:12,mismatch:2};const candidates=analyze(CASE_RNA,15,'C388-fragment',CASE_REFS,settings);const chosen=candidates.find(c=>c.start===1)!;
 if(modulePlan(chosen,library,overrides).sequence!==wt)throw Error('WT case scaffold mismatch.');
 return {library,overrides,settings,candidates,chosen};
}
