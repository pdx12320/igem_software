const AA:Record<string,string>={ALA:'A',ARG:'R',ASN:'N',ASP:'D',CYS:'C',GLN:'Q',GLU:'E',GLY:'G',HIS:'H',ILE:'I',LEU:'L',LYS:'K',MET:'M',PHE:'F',PRO:'P',SER:'S',THR:'T',TRP:'W',TYR:'Y',VAL:'V'};
export function checkStructure(cif:string,protein:string){
 if(cif.length>2000000)throw Error('Structure limit: 2 MB per CIF.');
 const headers:string[]=[];const a=new Map<number,string>(),b=new Map<number,string>();
 for(const l of cif.split(/\r?\n/)){
  if(l.startsWith('_atom_site.'))headers.push(l.trim());
  if(!/^ATOM\s/.test(l))continue;
  const row=l.trim().split(/\s+/);const val=(field:string)=>row[headers.indexOf('_atom_site.'+field)]?.replace(/^["']|["']$/g,'');
  const chain=val('label_asym_id'),id=Number(val('label_seq_id')),res=val('label_comp_id');
  if(!Number.isInteger(id)||id<1)throw Error('CIF residue numbering is invalid.');
  if(chain==='A')a.set(id,AA[res]||'?');if(chain==='B')b.set(id,res);
 }
 const seq=(m:Map<number,string>)=>[...m].sort((x,y)=>x[0]-y[0]).map((x,i)=>x[0]===i+1?x[1]:'?').join('');
 if(seq(a)!==protein||seq(b)!=='ACAUGGAGGACGUGC')throw Error('Expected chain A to match the selected construct and chain B to contain ACAUGGAGGACGUGC.');
 return cif;
}
