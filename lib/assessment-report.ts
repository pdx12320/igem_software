import {averageStructures,type StructureResult} from './af3-analysis';
import {checkModelScope,modelCompatibleSequence,predictPR,predictFeatures,type PortableModels} from './trm-inference';
import raw from '../data/trm-models.json';
import examples from '../data/three-site-examples.json';
const bundle=raw as unknown as PortableModels;
export function assessmentReport(rows:StructureResult[],protein:string|null){
 let tagged:string|null=null;try{if(protein)tagged=modelCompatibleSequence(bundle,protein);}catch{}
 const matching=rows.filter(r=>r.protein===protein||r.protein===tagged);
 return [...new Set(matching.map(r=>JSON.stringify([r.protein,r.rna])))].map(key=>{
  const [protein,rna]=JSON.parse(key),same=matching.filter(r=>r.protein===protein&&r.rna===rna);const aggregate=averageStructures(same)!;
  let prediction:ReturnType<typeof predictPR>|null=null;let scope='Structural descriptors only';
  try{const checked=checkModelScope(bundle,protein,rna);scope=checked.scopeStatus;const seedPR=[...new Set(same.map(r=>r.seed))].map(seed=>averageStructures(same.filter(r=>r.seed===seed))!.pr.slice(7));prediction=predictPR(bundle,checked.site,seedPR);}catch{}
  const {pr,...metrics}=aggregate;return {...metrics,scope,prediction,sourceCommit:raw.commit};
 });
}

export function archivedAssessment(protein:string|null){const match=examples.constructs.find(c=>c.coreProtein===protein);if(!match)return null;return {name:match.name,sourceCommit:raw.commit,scoreKind:match.id==='wt_puf12_9'?'WT reference extrapolation':'Training refit; not validation',sites:Object.entries(match.sites).map(([site,row])=>({site,editingPercent:row.editingPercent,score:predictFeatures(bundle.models[site as keyof typeof bundle.models],row.features),heldOut:row.heldOut}))};}
