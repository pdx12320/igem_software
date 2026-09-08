"""Audit user-provided AF3 ZIP and package the rank-0 showcase with provenance."""
import sys,zipfile,json,hashlib,shlex,math,statistics
from pathlib import Path
root=Path(__file__).resolve().parents[1]
zpath=Path(sys.argv[1]); z=zipfile.ZipFile(zpath)
prefix='fold_wt_puf12_9_c388'
request=json.loads(z.read(prefix+'_job_request.json'))[0]
protein=request['sequences'][0]['proteinChain']['sequence']
rna=request['sequences'][1]['rnaSequence']['sequence']
wt=(root/'public/puf12-input.fasta').read_text().split('\n>')[0].split('\n',1)[1].strip().replace('\n','')
assert protein==wt and len(protein)==492
assert rna=='ACAUGGAGGACGUGC'
audit=json.loads((root/'data/puf12-audit.json').read_text())
def atoms(i):
 text=z.read(f'{prefix}_model_{i}.cif').decode()
 rows=[shlex.split(l,posix=False) for l in text.splitlines() if l.startswith('ATOM ')]
 return [dict(chain=r[6],resi=int(r[8]),resn=r[5],name=r[3].strip('"'),xyz=list(map(float,r[10:13])),b=float(r[14])) for r in rows]
models=[]
for i in range(5):
 d=json.loads(z.read(f'{prefix}_summary_confidences_{i}.json'))
 a=atoms(i)
 assert len({r['resi'] for r in a if r['chain']=='A'})==492
 assert ''.join(dict((r['resi'],r['resn']) for r in a if r['chain']=='B').values())==rna
 models.append({'model':i,**{k:d[k] for k in ['iptm','ptm','ranking_score','has_clash']},
  'proteinMeanAtomPlddt':round(statistics.mean(r['b'] for r in a if r['chain']=='A'),2),
  'rnaMeanAtomPlddt':round(statistics.mean(r['b'] for r in a if r['chain']=='B'),2),
  'targetMeanAtomPlddt':round(statistics.mean(r['b'] for r in a if r['chain']=='B' and r['resi']==15),2)})
a=atoms(0); repeats=[]
for rep in audit['repeatMap']:
 r={k:rep[k] for k in ['repeat','start1','end1','trmPositions1','wtTrm']}
 r['rnaPosition']=13-r['repeat'];r['base']=rna[r['rnaPosition']-1]
 pa=[x for x in a if x['chain']=='A' and x['resi'] in r['trmPositions1']]
 rb=[x for x in a if x['chain']=='B' and x['resi']==r['rnaPosition']]
 r['minTrmRnaDistance']=round(min(math.dist(x['xyz'],y['xyz']) for x in pa for y in rb),2)
 repeats.append(r)
data={'name':request['name'],'protein':protein,'rna':rna,'proteinChain':'A','rnaChain':'B','targetRnaPosition':15,'targetTranscriptPosition':388,'bindingInterval':[1,12],'selectedModel':0,'seed':request['modelSeeds'],'sourceZipSha256':hashlib.sha256(zpath.read_bytes()).hexdigest(),'models':models,'repeats':repeats,'mappingNote':'RNA positions are assigned by the designed antiparallel register; distances are geometric minima, not binding or editing probabilities.'}
(root/'data/structure-showcase.json').write_text(json.dumps(data,indent=2)+'\n')
(root/'public/structures/wt-puf12-c388-audit.json').write_text(json.dumps(data,indent=2)+'\n')
for src,dest in [(prefix+'_model_0.cif','wt-puf12-c388.cif'),('terms_of_use.md','alphafold-output-terms.md'),(prefix+'_job_request.json','wt-puf12-c388-input.json')]:
 (root/'public/structures'/dest).write_bytes(z.read(src))
print(json.dumps({'models':models,'repeatDistances':[r['minTrmRnaDistance'] for r in repeats]},indent=2))
