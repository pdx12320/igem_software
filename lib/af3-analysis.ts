import {unzipSync,strFromU8} from 'fflate';
export type Span={position:number;start:number;end:number};
export type StructureResult={protein:string;rna:string;seed:string;model:number;file:string;densities:number[];plddt:number[];interfaces:{left:number;right:number;cp:number;pae:number}[];pr:number[][]};
const AA:Record<string,string>={ALA:'A',ARG:'R',ASN:'N',ASP:'D',CYS:'C',GLN:'Q',GLU:'E',GLY:'G',HIS:'H',ILE:'I',LEU:'L',LYS:'K',MET:'M',PHE:'F',PRO:'P',SER:'S',THR:'T',TRP:'W',TYR:'Y',VAL:'V'};
export function readCif(cif:string){
 const headers:string[]=[];const chains:Record<string,Map<number,{aa:string;bs:number[]}>>={};
 for(const line of cif.split(/\r?\n/)){
  if(line.startsWith('_atom_site.'))headers.push(line.trim());if(!/^ATOM\s/.test(line))continue;
  const row=line.trim().split(/\s+/);const v=(key:string)=>row[headers.indexOf('_atom_site.'+key)]?.replace(/^["']|["']$/g,'');
  const chain=v('label_asym_id'),id=Number(v('label_seq_id')),res=v('label_comp_id'),b=Number(v('B_iso_or_equiv'));
  if(!chain||!Number.isInteger(id)||id<1||!Number.isFinite(b)||b<0||b>100)throw Error('Invalid AlphaFold CIF residue or confidence.');
  chains[chain]||=new Map();const r=chains[chain].get(id)||{aa:AA[res]||res,bs:[]};r.bs.push(b);chains[chain].set(id,r);
 }
 function residues(chain:string){const rows=[...(chains[chain]||[])].sort((a,b)=>a[0]-b[0]);if(rows.some((r,i)=>r[0]!==i+1))throw Error('CIF chain numbering must be continuous and start at 1.');return rows.map(r=>r[1]);}
 const a=residues('A'),b=residues('B');if(!a.length||!b.length||Object.keys(chains).length!==2)throw Error('Use one protein chain A and one RNA chain B.');
 return {protein:a.map(r=>r.aa).join(''),rna:b.map(r=>r.aa).join(''),plddt:a.map(r=>r.bs.reduce((a,b)=>a+b,0)/r.bs.length)};
}
export function analyzeFullData(full:any,cif:string,spans:Span[],meta:{seed:string;model:number;file:string}):StructureResult{
 const structure=readCif(cif);const ids=full.token_chain_ids,cp=full.contact_probs,pae=full.pae;
 if(!Array.isArray(ids)||ids.length>1000||ids.some(id=>id!=='A'&&id!=='B'))throw Error('AF3 supports one protein and one RNA, up to 1,000 tokens.');
 const ai=ids.flatMap((v:string,i:number)=>v==='A'?[i]:[]),bi=ids.flatMap((v:string,i:number)=>v==='B'?[i]:[]);
 if(ai.length!==structure.protein.length||bi.length!==structure.rna.length)throw Error('CP token counts do not match the CIF sequence.');
 if(!Array.isArray(full.token_res_ids)||full.token_res_ids.length!==ids.length||ai.some((v:number,i:number)=>full.token_res_ids[v]!==i+1)||bi.some((v:number,i:number)=>full.token_res_ids[v]!==i+1))throw Error('CP token residue numbering does not match the CIF.');
 for(const [matrix,max] of [[cp,1],[pae,100000]] as [number[][],number][]){if(!Array.isArray(matrix)||matrix.length!==ids.length||matrix.some(row=>!Array.isArray(row)||row.length!==ids.length||row.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)))throw Error('Invalid CP / PAE matrix.');}
 if(spans.some(s=>s.start<1||s.end>ai.length))throw Error('Repeat mapping exceeds the protein length.');
 const densities=[4,12,24].map(g=>{let count=0;for(let i=0;i<ai.length;i++)for(let j=i+g;j<ai.length;j++)if(cp[ai[i]][ai[j]]>0.5)count++;return count/ai.length;});
 const interfaces=[];
 for(let a=0;a<spans.length;a++)for(let b=a+1;b<spans.length;b++){
  let sum=0,ps=0,n=0;for(let i=spans[a].start-1;i<spans[a].end;i++)for(let j=spans[b].start-1;j<spans[b].end;j++){if(Math.abs(i-j)<4)continue;sum+=cp[ai[i]][ai[j]];ps+=(pae[ai[i]][ai[j]]+pae[ai[j]][ai[i]])/2;n++;}
  interfaces.push({left:a+1,right:b+1,cp:sum/n,pae:ps/n});
 }
 return {...structure,...meta,densities,plddt:spans.map(s=>structure.plddt.slice(s.start-1,s.end).reduce((a,b)=>a+b,0)/(s.end-s.start+1)),interfaces,pr:ai.map((i:number)=>bi.map((j:number)=>cp[i][j]))};
}
export async function analyzeZip(file:File,spans:Span[],expectedProtein?:string){
 if(file.size>150000000)throw Error('Upload an AF3 result ZIP up to 150 MB.');const bytes=new Uint8Array(await file.arrayBuffer());
 const names:string[]=[];let total=0;unzipSync(bytes,{filter:f=>{names.push(f.name);if(/(_full_data_\d+\.json|_model_\d+\.cif|_job_request\.json)$/.test(f.name)){total+=f.originalSize;if(f.originalSize>60000000||total>350000000)throw Error('Expanded structure data exceeds the browser limit.');}return false;}});
 const fullNames=names.filter(n=>/_full_data_\d+\.json$/.test(n));if(!fullNames.length||fullNames.length>30)throw Error('Include 1–30 AF3 full_data JSON files and their matching CIFs.');
 const results:StructureResult[]=[];
 for(const name of fullNames){await new Promise(r=>setTimeout(r,0));const cifName=name.replace('_full_data_','_model_').replace(/\.json$/,'.cif');const folder=name.slice(0,name.lastIndexOf('/')+1);const request=names.find(n=>n.startsWith(folder)&&n.endsWith('_job_request.json')&&n.slice(folder.length).indexOf('/')<0);if(!names.includes(cifName)||!request)throw Error('Each model needs its CIF and job_request JSON.');
  const parts=unzipSync(bytes,{filter:f=>[name,cifName,request].includes(f.name)});const req=JSON.parse(strFromU8(parts[request]));const q=Array.isArray(req)?req[0]:req;if(!q?.modelSeeds||q.modelSeeds.length!==1)throw Error('Use AF3 results with one identifiable seed per job folder.');
  const result=analyzeFullData(JSON.parse(strFromU8(parts[name])),strFromU8(parts[cifName]),spans,{seed:String(q.modelSeeds[0]),model:Number(name.match(/_(\d+)\.json$/)![1]),file:name});
  if(expectedProtein&&result.protein!==expectedProtein)throw Error('This structure does not match the current protein sequence. Export a new AF3 input or restore the matching design.');
  if(q.sequences?.[0]?.proteinChain?.sequence!==result.protein||q.sequences?.[1]?.rnaSequence?.sequence!==result.rna)throw Error('AF3 request and CIF sequences differ.');
  if(results.some(r=>r.protein===result.protein&&r.rna===result.rna&&r.seed===result.seed&&r.model===result.model))throw Error('Duplicate seed / model / sequence result.');results.push(result);
 }
 return results;
}
export function averageStructures(rows:StructureResult[]){
 if(!rows.length)return null;const first=rows[0];if(rows.some(r=>r.protein!==first.protein||r.rna!==first.rna))throw Error('Compare one protein–RNA pair at a time.');
 const groups=[...new Set(rows.map(r=>r.seed))].map(s=>rows.filter(r=>r.seed===s));const mean=(fn:(r:StructureResult)=>number)=>groups.reduce((v,g)=>v+g.reduce((a,r)=>a+fn(r),0)/g.length,0)/groups.length;
 return {protein:first.protein,rna:first.rna,seeds:groups.length,models:rows.length,densities:first.densities.map((_,i)=>mean(r=>r.densities[i])),plddt:first.plddt.map((_,i)=>mean(r=>r.plddt[i])),interfaces:first.interfaces.map((v,i)=>({...v,cp:mean(r=>r.interfaces[i].cp),pae:mean(r=>r.interfaces[i].pae)})),pr:first.pr.map((row,i)=>row.map((_,j)=>mean(r=>r.pr[i][j])))};
}
export function validateStructureEvidence(value:unknown):StructureResult[]{
 if(!Array.isArray(value)||value.length>60)throw Error('A project supports up to 60 saved AF3 models.');
 const seen=new Set<string>();
 for(const r of value){
  if(!r||typeof r.protein!=='string'||!/^[ACDEFGHIKLMNPQRSTVWY]{16,700}$/.test(r.protein)||typeof r.rna!=='string'||!/^[ACGU]{1,200}$/.test(r.rna)||typeof r.seed!=='string'||!/^\d+$/.test(r.seed)||!Number.isInteger(r.model)||r.model<0||typeof r.file!=='string')throw Error('Invalid saved AF3 identity.');
  if(!Array.isArray(r.pr)||r.pr.length!==r.protein.length||r.pr.some((row:unknown)=>!Array.isArray(row)||row.length!==r.rna.length||row.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)))throw Error('Invalid saved protein–RNA contact matrix.');
  if(!Array.isArray(r.densities)||r.densities.length!==3||r.densities.some((v:number)=>!Number.isFinite(v)||v<0)||!Array.isArray(r.plddt)||r.plddt.length<8||r.plddt.length>12||r.plddt.some((v:number)=>!Number.isFinite(v)||v<0||v>100))throw Error('Invalid saved structural metrics.');
  const n=r.plddt.length,pairs=new Set<string>();if(!Array.isArray(r.interfaces)||r.interfaces.length!==n*(n-1)/2)throw Error('Invalid saved interface map.');
  for(const p of r.interfaces){const key=p.left+'-'+p.right;if(!Number.isInteger(p.left)||!Number.isInteger(p.right)||p.left<1||p.right>n||p.left>=p.right||pairs.has(key)||!Number.isFinite(p.cp)||p.cp<0||p.cp>1||!Number.isFinite(p.pae)||p.pae<0)throw Error('Invalid saved repeat interface.');pairs.add(key);}
  const key=JSON.stringify([r.protein,r.rna,r.seed,r.model]);if(seen.has(key))throw Error('Duplicate saved AF3 model.');seen.add(key);
 }
 return value;
}
