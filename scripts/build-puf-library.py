import json,hashlib,re,sys
from pathlib import Path
source=Path(sys.argv[1]) if len(sys.argv)>1 else Path('public/puf12-input.fasta')
records=[]
for b in source.read_text().split('>')[1:]:
 h,*lines=b.splitlines();records.append({'id':h,'sequence':''.join(lines)})
wt=records[0]['sequence']
native='GRSRLLEDFRNNRYPNLQLREIAGHIMEFSQDQHGSRFIQLKLERATPAERQLVFNEILQAAYQLMVDVFGNYVIQKFFEFGSLEQKLALAERIRGHVLSLALQMYGCRVIQKALEFIPSDQQNEMVRELDGHVLKCVKDQNGNHVVQKCIECVQPQSLQFIIDAFKGQVFALSTHPYGCRVIQRILEHCLPDQTLPILEELHQHTEQLVQDQYGNYVIQHVLEHGRPEDKSKIVAEIRGNVLVLSQHKFASNVVEKCVTHASRTERAVLIDEVCTMNDGPHSALYTMMKDQYANYVVQKMIDVAEPGQRKIVMHKIRPHIATLRKYTYGKHILAKLEKYYMKNGVDLG'
# Figure 4, page 7. Each cell is preserved in printed order; empty cells remain empty.
matrix=[
 {'A':['SRQ'],'C':['QFR','TFR','SFK'],'G':['SGD'],'U':['NYQ','NFQ']},
 {'A':['VFQ','CFP','SRQ'],'C':[],'G':[],'U':['NYQ','NFW','NFP']},
 {'A':['TRQ','CRQ'],'C':['QFR'],'G':['SNE','THE','TTE'],'U':['NTQ','NPG']},
 {'A':['RGY','RMY','RLY'],'C':['SYR','TFR','CRR'],'G':[],'U':['NWP','NYP']},
 {'A':['PHQ','CRQ'],'C':['TTR','TKR','CKR'],'G':['GVD'],'U':['RAN','QKQ','GNS']},
 {'A':['VFH','VFW','VWH'],'C':[],'G':['SWD','SHE','SRE'],'U':['NYQ','TWK','HHR']},
 {'A':['MHQ'],'C':['KWN','ERN'],'G':['SNE','DWE','DFE'],'U':['NPG','NPS','NSG']},
 {'A':['QLR'],'C':[],'G':[],'U':['NYQ','NWP','NYP']}
]
preferred={1:{'C':'QFR'},2:{'A':'VFQ'},3:{'G':'THE'},4:{'C':'TFR'},5:{'A':'PHQ'},6:{'G':'SWD'},7:{'U':'NPG'}}
# The team confirmed native 8R TRM matching is feasible across 8–12R.
# Pool only published codes and retain the original per-repeat matrix.
transfer_policy={'targetRepeatLengths':[8,9,10,11,12],'status':'team_reported_experimentally_validated','evidence':'Project team confirmation, 2026-09-01: native 8R TRM matching to 8–12R is experimentally feasible.','rule':'Shared base-specific native 8R TRM pool; preserve each code’s source rows.','defaultSelection':'Prefer the scaffold’s homologous native row when available, then author-used codes, then matrix order. Defaults are not a quantitative rank.'}
pool=[]
for base in 'ACGU':
 codes=list(dict.fromkeys(code for row in matrix for code in row[base]))
 codes.sort(key=lambda code:not any(row.get(base)==code for row in preferred.values()))
 for code in codes:
  parents=[i+1 for i,row in enumerate(matrix) if code in row[base]]
  pool.append({'id':f'{base}-{code}','base':base,'trm':code,'nativeRepeats':parents,'evidence':f'Zhou 2021 Fig4 / native rows {parents}; 8–12R transfer experimentally validated per project team'})
starts8=[24+36*i for i in range(7)]+[283]
starts12=[24+36*i for i in range(11)]+[427]
map12=[1,2,3,5,6,7,5,6,7,6,7,8]
scaffolds=[];audit=[]
for n,seq,starts,mapping,sid,source_ref in [(8,native,starts8,list(range(1,9)),'PUM1-1M8Y-8R','https://www.rcsb.org/fasta/entry/1M8Y/display'),(12,wt,starts12,map12,'PUF12-9_WT','User FASTA: 00_PUF12-9_WT')]:
 mods=[];split=[]
 for i,(start,parent) in enumerate(zip(starts,mapping)):
  end=starts[i+1] if i+1<n else start+36
  template=seq[start:end];src=native[starts8[parent-1]:starts8[parent-1]+36]
  matches=sum(template[j]==src[j] for j in range(36) if j not in (11,12,15))
  row={'repeat':i+1,'nativeRepeat':parent,'start1':start+1,'end1':end,'trmPositions1':[start+12,start+13,start+16],'wtTrm':''.join(template[j] for j in (11,12,15)),'coreIdentityExcludingTRM':f'{matches}/33','sequence':template}
  split.append(row)
  for base in 'ACGU':
   codes=[m['trm'] for m in pool if m['base']==base]
   # Red in Fig4 identifies designs used by the authors, not a quantitative rank.
   codes=sorted(codes,key=lambda code:(code not in matrix[parent-1][base],code!=preferred.get(parent,{}).get(base)))
   for code in codes:
    code_sources=next(m['nativeRepeats'] for m in pool if m['base']==base and m['trm']==code)
    source_parent=parent if parent in code_sources else code_sources[0]
    s=list(template)
    for j,a in zip((11,12,15),code):s[j]=a
    mods.append({'id':f'{sid}-R{i+1}-{base}-{code}','repeat':i+1,'base':base,'trm':code,'sequence':''.join(s),'nativeRepeat':source_parent,'nativeRepeats':code_sources,'preferredForRepeat':code in matrix[parent-1][base],'transfer':n!=8 or source_parent!=parent,'evidence':f'Zhou 2021 Fig4 / native R{source_parent}; shared 8–12R TRM matching, experimentally validated per project team'})
  if n==12:audit.append(row)
 scaffold={'id':sid,'repeats':n,'ncap':seq[:24],'ccap':seq[starts[-1]+36:],'evidence':source_ref+'; native 8R TRM matching to 8–12R experimentally validated per project team','modules':mods,'repeatMap':split,'wildTypeSequence':seq,'proteinLength':len(seq)}
 assert scaffold['ncap']+''.join(m['sequence'] for m in split)+scaffold['ccap']==seq
 scaffolds.append(scaffold)
# The named single-repeat mutants independently check absolute TRM numbering R4–R8.
for record in records[1:]:
 m=re.match(r'\d+_R(\d+)-([A-Z]{3})x?$',record['id']);assert m,record['id']
 r=int(m[1]);start=starts12[r-1];s=record['sequence']
 assert ''.join(s[start+j] for j in (11,12,15))==m[2],record['id']
 changes=[{'position1':i+1,'from':a,'to':b} for i,(a,b) in enumerate(zip(wt,s)) if a!=b]
 assert all(c['position1'] in (start+12,start+13,start+16) for c in changes)
 record['changes']=changes
obj={'version':'zhou2021-fig4_repeat-preference_v3','scaffolds':scaffolds,'trmOptions':pool,'transferPolicy':transfer_policy,'starMeaning':'The TRM occurs in the original matrix row for this scaffold repeat and RNA base. Qualitative repeat/base support, not an affinity score. No repeat-specific star is inferred for unmapped scaffolds.'}
Path('data/puf-library.json').write_text(json.dumps(obj,indent=2))
Path('data/trm-matrix.json').write_text(json.dumps({'source':'10.1038/s41467-021-25433-6','figure':4,'page':7,'positions':[12,13,16],'rows':matrix,'authorUsed':preferred,'emptyMeaning':'No highly base-specific TRM detected; not zero binding','quantitativeScores':None},indent=2))
Path('data/puf12-audit.json').write_text(json.dumps({'inputFile':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'recordCount':len(records),'lengths':sorted(set(len(r['sequence']) for r in records)),'wt':records[0],'repeatMap':audit,'nativeReference':'https://www.rcsb.org/fasta/entry/1M8Y/display','mappingStatus':'Repeat ancestry inferred by sequence homology; shared native 8R TRM matching to 8–12R experimentally feasible per project team','transferPolicy':transfer_policy,'scaffold9to11':'Not supplied; TRM design available, protein assembly requires the matching scaffold','variants':records[1:]},indent=2))
# Publish reusable evidence data with the site, under the same version control.
for f in ['puf-library.json','trm-matrix.json','puf12-audit.json']:Path('public/'+f).write_bytes(Path('data/'+f).read_bytes())
Path('public/puf12-input.fasta').write_bytes(source.read_bytes())
print('Built',len(mods),'12R modules; 31 variant names and mutations verified.')
print('Native-to-engineered map:',map12)
print('Terminal repeat12 TRM positions:',audit[-1]['trmPositions1'])
