import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSync} from 'esbuild';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'puf-model-tests-'));
const modules={};for(const name of ['architecture','design','trm-inference','af3-analysis','assessment-report','project','c388-case']){const out=path.join(dir,name+'.mjs');buildSync({entryPoints:[new URL('../lib/'+name+'.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',outfile:out});modules[name]=await import(pathToFileURL(out));}fs.rmSync(dir,{recursive:true});
const json=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const base=json('../data/puf-library.json'),templates=json('../data/repeat-templates.json'),models=json('../data/trm-models.json'),examples=json('../data/three-site-examples.json'),golden=json('./trm-golden-inputs.json'),wt=json('../data/structure-showcase.json');
const {defaultOrder,withArchitecture,baselineProtein,repeatSpans,referenceEditable}=modules.architecture;
const {modulePlan,analyze}=modules.design;
const {predictPR,predictFeatures,checkModelScope,modelCompatibleSequence}=modules['trm-inference'];
const {c388Case,CASE_RNA,CASE_REFS}=modules['c388-case'];
const candidate=analyze(CASE_RNA,15,'C388-fragment',CASE_REFS,{recognitionLength:12,mismatch:2}).find(c=>c.start===1);
test('reference baselines round-trip exactly; a source swap preserves caps and slot loop',()=>{
 assert.equal(baselineProtein(base,12),wt.protein);const ref=templates.references.find(r=>r.repeats===8);assert.equal(baselineProtein(base,8),ref.ncap+ref.slots.map(s=>s.core+s.suffix).join('')+ref.ccap);
 const order=defaultOrder(12);order[7]=4;const lib=withArchitecture(base,12,order),protein=baselineProtein(lib,12);assert.equal(protein.length,492);assert.equal(protein.slice(276,312),templates.nativeSources[3].core);assert.equal(protein.slice(420,427),'MNDGPHS');assert.equal(protein.slice(0,276),wt.protein.slice(0,276));assert.equal(protein.slice(312),wt.protein.slice(312));assert.equal(base.sourceOrders,undefined);
 const plan=modulePlan(candidate,lib);assert.ok(plan.rows[7].options.every(m=>m.sourceRepeat===4));assert.ok(plan.rows[7].options.filter(m=>m.preferredForRepeat).every(m=>modules.architecture.preferredCodes(4,plan.rows[7].base).includes(m.trm)));
});
test('unrecognized imported backbones cannot be silently replaced or assessed as WT',()=>{const custom=structuredClone(base);custom.scaffolds[1].ncap='A'+custom.scaffolds[1].ncap;assert.equal(referenceEditable(custom,12),false);assert.equal(baselineProtein(custom,12),null);assert.throws(()=>withArchitecture(custom,12,defaultOrder(12)));});
test('9–11 source selection enables preferences but no protein is invented',()=>{for(const n of [9,10,11]){const lib=withArchitecture(base,n,defaultOrder(n));const c=analyze(CASE_RNA,15,'C388-fragment',CASE_REFS,{recognitionLength:n,mismatch:2})[0];const p=modulePlan(c,lib);assert.equal(p.sequence,null);assert.ok(p.rows.some(r=>r.options.some(m=>m.preferredForRepeat)));}});
test('all 31 real case core sequences are reproduced by their loaded TRM choices',()=>{const starts=templates.references.find(r=>r.repeats===12).slots;for(const c of examples.constructs){const trms=starts.map((r,i)=>({repeat:i+1,wtTrm:[r.start1+11,r.start1+12,r.start1+15].map(p=>c.coreProtein[p-1]).join('')}));const result=c388Case(base,c.coreProtein,trms);assert.equal(modulePlan(result.chosen,result.library,result.overrides).sequence,c.coreProtein);}});
test('portable models match sklearn on 93 archived feature vectors and nine CP cases',()=>{for(const c of examples.constructs)for(const [site,row] of Object.entries(c.sites)){assert.ok(Math.abs(predictFeatures(models.models[site],row.features)-row.finalModelScore)<1e-12);}
 for(const t of golden.tests){const seeds=t.seedSparseCP.map(entries=>{const pr=Array.from({length:512},()=>Array(15).fill(0));for(const [index,value] of entries)pr[Math.floor(index/15)][index%15]=value;return pr;});const p=predictPR(models,t.site,seeds);assert.ok(Math.abs(p.score-t.expectedScore)<1e-12);assert.ok(p.features.every((x,i)=>Math.abs(x-t.expectedFeatures[i])<1e-10));}
});
test('model scope enforces original tags and backbone and marks extrapolation',()=>{const protein=modelCompatibleSequence(models,wt.protein);assert.equal(protein,models.scope.wtProtein);assert.equal(checkModelScope(models,protein,CASE_RNA).wt,true);assert.throws(()=>checkModelScope(models,wt.protein,CASE_RNA));assert.throws(()=>checkModelScope(models,'A'+protein.slice(1),CASE_RNA));assert.throws(()=>checkModelScope(models,protein,'A'.repeat(15)));const a=protein.split('');a[16+24+11]='A';const scope=checkModelScope(models,a.join(''),CASE_RNA);assert.equal(scope.observedPositionGroup,false);assert.match(scope.scopeStatus,/Extrapolation/);});
test('CIF/CP identities, pair counts and exact high-CP thresholds are enforced',()=>{const cif=fs.readFileSync(new URL('../public/structures/wt-puf12-c388.cif',import.meta.url),'utf8'),n=507;const cp=Array.from({length:n},()=>Array(n).fill(0)),pae=cp.map(r=>[...r]);cp[0][4]=cp[4][0]=0.51;cp[0][12]=cp[12][0]=0.5;cp[0][24]=cp[24][0]=0.9;const full={token_chain_ids:[...Array(492).fill('A'),...Array(15).fill('B')],token_res_ids:[...Array.from({length:492},(_,i)=>i+1),...Array.from({length:15},(_,i)=>i+1)],contact_probs:cp,pae};const r=modules['af3-analysis'].analyzeFullData(full,cif,repeatSpans(base.scaffolds[1]),{seed:'1',model:0,file:'test'});assert.deepEqual(r.densities,[2/492,1/492,1/492]);assert.equal(r.interfaces.length,66);assert.equal(r.protein,wt.protein);assert.equal(r.pr.length,492);assert.equal(modules['af3-analysis'].validateStructureEvidence([r]).length,1);assert.throws(()=>modules['af3-analysis'].validateStructureEvidence([r,r]));full.token_res_ids[2]=99;assert.throws(()=>modules['af3-analysis'].analyzeFullData(full,cif,[],{seed:'1',model:0,file:'test'}));});
test('report invalidates stale protein evidence and recomputes compatible class scores',()=>{const t=golden.tests.find(t=>t.construct==='p8_r6_gve'&&t.site==='C388');const pr=Array.from({length:519},()=>Array(15).fill(0));for(const [i,v] of t.seedSparseCP[0])pr[7+Math.floor(i/15)][i%15]=v;const r={protein:t.protein,rna:t.rna,seed:'1',model:0,file:'test',pr,densities:[1,1,1],plddt:Array(12).fill(90),interfaces:Array.from({length:12},(_,i)=>Array.from({length:11-i},(_,j)=>({left:i+1,right:i+j+2,cp:.1,pae:2}))).flat()};const report=modules['assessment-report'].assessmentReport([r],t.protein.slice(16,-11));assert.equal(report.length,1);assert.ok(Math.abs(report[0].prediction.score-t.expectedScore)<1e-12);assert.equal(modules['assessment-report'].assessmentReport([r],wt.protein).length,0);});
test('changing one source preserves the other eleven TRMs and protein segments',()=>{
 const starts=templates.references.find(r=>r.repeats===12).slots;
 const trms=starts.map((r,i)=>({repeat:i+1,wtTrm:[r.start1+11,r.start1+12,r.start1+15].map(p=>wt.protein[p-1]).join('')}));
 const current=c388Case(base,wt.protein,trms),order=defaultOrder(12);order[7]=4;
 const updated=modules.architecture.updateSourceOrder(current.library,current.chosen,current.overrides,order);
 const before=modulePlan(current.chosen,current.library,current.overrides),after=modulePlan(current.chosen,updated.library,updated.overrides);
 for(let i=0;i<12;i++)if(i!==7){assert.equal(after.rows[i].selected.trm,before.rows[i].selected.trm);assert.equal(after.rows[i].selected.sequence,before.rows[i].selected.sequence);}
 assert.equal(after.sequence.slice(0,276),wt.protein.slice(0,276));assert.equal(after.sequence.slice(312),wt.protein.slice(312));
 assert.deepEqual(modules.architecture.updateSourceOrder(updated.library,current.chosen,updated.overrides,order),updated);
 const p={kind:'puf-studio-project',version:1,target:{id:'C388-fragment',sequence:CASE_RNA,position:15},length:12,windowStart:1,referenceName:'case',references:CASE_REFS,library:updated.library,predictions:null,overrides:updated.overrides,lab:modules.project.emptyLab,experience:'expert'};
 const restored=modules.project.restoreProject(JSON.parse(JSON.stringify(p)));assert.equal(modulePlan(restored.chosen,restored.p.library,restored.p.overrides).sequence,after.sequence);
});
