export type Transcript = { id: string; sequence: string };
export type EditingSite = {position: number; offset: number; context: string | null};
export type Hit = { transcript: string; start: number; sequence: string; mismatches: number; editingSites: EditingSite[] };
export type Candidate = { id: string; n: number; offset: number; start: number; end: number; motif: string; hits: Hit[]; exact: number; closest: number; pareto: boolean };
export type Settings = { recognitionLength: number; mismatch: number };
export type TrmCode = { id: string; base: string; trm: string; nativeRepeats: number[]; evidence: string };
export type TransferPolicy = { targetRepeatLengths: number[]; status: string; evidence: string; rule: string; defaultSelection: string };
export type Module = { id: string; repeat: number; base: string; trm: string; sequence: string; evidence: string; nativeRepeat?: number; nativeRepeats?: number[]; preferredForRepeat?: boolean; transfer?: boolean; preference?: Record<string, number> };
export type Scaffold = { id: string; repeats: number; ncap: string; ccap: string; evidence: string; modules: Module[] };
export type ModuleLibrary = { version: string; scaffolds: Scaffold[]; trmOptions?: TrmCode[]; transferPolicy?: TransferPolicy };
export type PredictionSet = { modelVersion: string; referenceSet: string; scoreType: 'ranking_score'; predictions: { context: string; score: number }[] };
export const BASES = ['A','C','G','U'];
const DEMO_RAW = ('AUGGCUACGUAUCCAGUAAGCUAGGUACCGUAACGUUGACUAGUCCAUGGUACGACUUGUACAUAGCUACGAUGCAU').slice(0,75) + 'C' + ('AGUCAGGUAUACGUUGAUGCUAACGGUACCAUGGCUAGUCAUAGGCUACUGAUCUGAACGUAGCUAGUCAGGCUAA').slice(0,75);
export const DEMO_SEQUENCE = DEMO_RAW.slice(0,62) + 'ACAUGGAGGAUG' + DEMO_RAW.slice(74);
export const DEFAULTS: Settings = {recognitionLength:12,mismatch:2};
export const EDITING_OFFSETS = [2,3,4,5];
export function normalizeRNA(input: string) {
  const lines=input.trim().split(/\r?\n/); const headers=lines.filter(l=>l.startsWith('>'));
  if(headers.length>1) throw new Error('Target accepts one sequence. Use Reference FASTA for multiple transcripts.');
  const seq=lines.filter(l=>!l.startsWith('>')).join('').replace(/\s/g,'').toUpperCase().replace(/T/g,'U');
  if(!/^[ACGU]+$/.test(seq)) throw new Error('Use only A, C, G, U (or T). Ambiguous bases and coordinate characters are not supported.');
  return seq;
}
export function parseFasta(input: string): Transcript[] {
  if(!input.trim().startsWith('>')) throw new Error('Reference must be FASTA with a unique >transcript_id for each record.');
  const records=input.trim().split(/^>/m).filter(Boolean).map(block=>{const [head,...lines]=block.split(/\r?\n/); return {id:head.trim().split(/\s/)[0],sequence:normalizeRNA(lines.join(''))};});
  if(new Set(records.map(r=>r.id)).size!==records.length) throw new Error('Duplicate transcript IDs in reference.');
  if(records.reduce((a,r)=>a+r.sequence.length,0)>25000) throw new Error('Browser preview supports up to 25,000 nt. Use the server workflow for a whole transcriptome.');
  return records;
}
export function demoReferences(): Transcript[] {
  const mut=(positions:number[])=>{const a=DEMO_SEQUENCE.split('');positions.forEach(p=>a[p]=a[p]==='A'?'G':'A');return a.join('');};
  return [ {id:'SYNTH-01',sequence:mut([62,18,99])}, {id:'SYNTH-02',sequence:mut([60,65,70,90])}, {id:'SYNTH-03',sequence:mut([58,66,68,71,120])}, {id:'SYNTH-04',sequence:mut([55,61,64,68,72])}, {id:'SYNTH-05',sequence:('GACUUGCAUACG'.repeat(13))} ];
}
export function contextAt(seq:string,position0:number) {return position0>=50&&position0+50<seq.length ? seq.slice(position0-50,position0+51):null;}
export function recognitionWindows(sequence:string,position:number,length:number) {
  if(!Number.isInteger(position)||position<1||position>sequence.length||!Number.isInteger(length)||length<8||length>12)return [];
  return EDITING_OFFSETS.map(offset=>{const end=position-offset,start=end-length+1;return {id:`R${length}-D${offset}`,n:length,offset,start,end,motif:sequence.slice(start-1,end)};}).filter(w=>w.start>=1);
}
export function editingSitesAfter(sequence:string,end1:number):EditingSite[]{
  return EDITING_OFFSETS.flatMap(offset=>{const position=end1+offset;return sequence[position-1]==='C'?[{position,offset,context:contextAt(sequence,position-1)}]:[];});
}
export function analyze(sequence: string, position: number, targetId: string, references: Transcript[], s: Settings): Candidate[] {
  if(!Number.isInteger(position)||position<1||position>sequence.length) throw new Error('Editing coordinate is outside the sequence (1-based).');
  if(sequence[position-1]!=='C') throw new Error(`Position ${position} is ${sequence[position-1]}. Choose a cytosine (C) for C→U editing.`);
  if(sequence.length>25000) throw new Error('Target sequence exceeds the 25,000 nt preview limit.');
  if(!targetId.trim()||/[\s<>]/.test(targetId)) throw new Error('Use a non-empty transcript ID without spaces or angle brackets.');
  if(!Number.isInteger(s.recognitionLength)||s.recognitionLength<8||s.recognitionLength>12||!Number.isInteger(s.mismatch)||s.mismatch<0||s.mismatch>3) throw new Error('Choose one recognition length from 8 to 12 nt.');
  const same=references.find(r=>r.id===targetId); if(same&&same.sequence!==sequence) throw new Error('The target ID exists in your reference with a different sequence. Use matching sequence/ID.');
  const refs=same?references:[{id:targetId,sequence},...references];
  const all:Candidate[]=[]; let totalHits=0;
  for(const w of recognitionWindows(sequence,position,s.recognitionLength)) {
    const {n,motif,start}=w; const hits:Hit[]=[];
    for(const ref of refs) for(let j=0;j<=ref.sequence.length-n;j++) {
      if(ref.id===targetId&&j===start-1)continue;
      let mm=0;for(let k=0;k<n;k++){if(ref.sequence[j+k]!==motif[k])mm++;if(mm>s.mismatch)break;}
      if(mm>s.mismatch)continue;
      if(++totalHits>100000) throw new Error('More than 100,000 similar windows were found. Use a smaller reference subset or indexed server screening.');
      hits.push({transcript:ref.id,start:j+1,sequence:ref.sequence.slice(j,j+n),mismatches:mm,editingSites:editingSitesAfter(ref.sequence,j+n)});
    }
    hits.sort((a,b)=>a.mismatches-b.mismatches||a.transcript.localeCompare(b.transcript)||a.start-b.start);
    all.push({...w,hits,exact:hits.filter(h=>h.mismatches===0).length,closest:hits.length?hits[0].mismatches:s.mismatch+1,pareto:false});
  }
  if(!all.length)throw new Error('Not enough upstream sequence for this recognition length and the +2–5 editing window.');
  all.forEach(a=>a.pareto=!all.some(b=>b.exact<=a.exact&&b.hits.length<=a.hits.length&&(b.exact<a.exact||b.hits.length<a.hits.length)));
  return all.sort((a,b)=>a.exact-b.exact||a.hits.length-b.hits.length||a.offset-b.offset);
}
export function validateLibrary(x:ModuleLibrary):ModuleLibrary {
  if(!x.version||!Array.isArray(x.scaffolds)||!x.scaffolds.length)throw new Error('Provide version and a non-empty scaffolds array.');
  const aa=/^[ACDEFGHIKLMNPQRSTVWY]*$/;
  if(x.trmOptions){
    if(!x.transferPolicy||!Array.isArray(x.transferPolicy.targetRepeatLengths)||x.transferPolicy.targetRepeatLengths.some(n=>!Number.isInteger(n)||n<8||n>12)||!x.transferPolicy.evidence)throw new Error('Shared TRM codes require a transfer policy for 8–12 repeats with evidence.');
    const tids=new Set<string>();
    for(const t of x.trmOptions){if(!t.id||tids.has(t.id)||!BASES.includes(t.base)||!t.trm||t.trm.length!==3||!aa.test(t.trm)||!t.evidence||!Array.isArray(t.nativeRepeats)||!t.nativeRepeats.length||t.nativeRepeats.some(n=>!Number.isInteger(n)||n<1||n>8))throw new Error('Invalid shared TRM code or native matrix source.');tids.add(t.id);}
  }
  const ids=new Set<string>();
  for(const s of x.scaffolds){
    if(!s.id||ids.has(s.id)||!Number.isInteger(s.repeats)||s.repeats<8||s.repeats>12||!s.evidence||typeof s.ncap!=='string'||typeof s.ccap!=='string'||!aa.test(s.ncap)||!aa.test(s.ccap)||!Array.isArray(s.modules)||!s.modules.length)throw new Error('Invalid scaffold: unique id, 8–12 repeats, caps, evidence and modules are required.');
    ids.add(s.id);const mids=new Set();
    for(const m of s.modules){if(!m.id||mids.has(m.id)||!Number.isInteger(m.repeat)||m.repeat<1||m.repeat>s.repeats||!BASES.includes(m.base)||!m.evidence||typeof m.sequence!=='string'||m.sequence.length<16||!aa.test(m.sequence)||!m.trm||m.trm.length!==3||m.trm!==[m.sequence[11],m.sequence[12],m.sequence[15]].join(''))throw new Error('Invalid repeat module. TRM must match 1-based residues 12, 13 and 16 in the module sequence.');mids.add(m.id);if(m.preference&&BASES.some(b=>!Number.isFinite(m.preference![b])||m.preference![b]<0||m.preference![b]>1))throw new Error('Preference requires A/C/G/U values between 0 and 1 on one comparable assay scale.');}
  }
  return x;
}
export function modulePlan(c:Candidate,lib:ModuleLibrary|null,overrides:Record<number,string>={},optimize=false) {
  const scaffold=lib?.scaffolds.find(s=>s.repeats===c.n); const rows=Array.from({length:c.n},(_,i)=>{
    const repeat=i+1,base=c.motif[c.n-1-i];
    const shared=lib?.transferPolicy?.targetRepeatLengths.includes(c.n)?lib.trmOptions||[]:[];
    const options:Module[]=scaffold?scaffold.modules.filter(m=>m.repeat===repeat&&m.base===base):shared.filter(m=>m.base===base).map(m=>({...m,id:`TRM-R${repeat}-${m.id}`,repeat,sequence:'',nativeRepeat:m.nativeRepeats[0],transfer:true}));
    const assess=(m:Module)=>{if(!m.preference)return null;const alternatives=c.hits.map(h=>h.sequence[c.n-1-i]).filter(b=>b!==base);const worst=Math.max(0,...alternatives.map(b=>m.preference![b]));return m.preference[base]-worst;};
    const sortable=options.every(m=>!!m.preference);const sorted=optimize&&sortable?[...options].sort((a,b)=>assess(b)!-assess(a)!):options;
    const selected=options.find(m=>m.id===overrides[repeat])||sorted[0]||null;
    return {repeat,base,options,selected,margin:selected?assess(selected):null};
  });
  const ready=!!scaffold&&rows.every(r=>r.selected);
  return {scaffold,rows,sequence:ready?scaffold!.ncap+rows.map(r=>r.selected!.sequence).join('')+scaffold!.ccap:null};
}
export function validatePredictions(x:PredictionSet):PredictionSet {
  if(!x.modelVersion||!x.referenceSet||x.scoreType!=='ranking_score'||!Array.isArray(x.predictions)||x.predictions.length>100000)throw new Error('Prediction JSON requires modelVersion, referenceSet, scoreType=ranking_score and predictions.');
  const seen=new Set();for(const p of x.predictions){p.context=normalizeRNA(p.context);if(p.context.length!==101||p.context[50]!=='C'||!Number.isFinite(p.score)||p.score<0||p.score>1||seen.has(p.context))throw new Error('Predictions require unique 101-nt contexts centered on C and scores in [0,1].');seen.add(p.context);}return x;
}
export function allCsites(refs:Transcript[]) {return refs.flatMap(r=>Array.from(r.sequence.matchAll(/C/g),m=>({transcript:r.id,position:m.index!+1,context:contextAt(r.sequence,m.index!)})));}
