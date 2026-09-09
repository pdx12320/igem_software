'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Download,RotateCcw,Box,Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import built from '@/data/structure-showcase.json';

type Atom={chain:string;resi:number;b:number;x:number;y:number;z:number};
type Viewer={
 addModel:(text:string,format:string)=>void;
 setStyle:(selection:object,style:object)=>void;
 addStyle:(selection:object,style:object)=>void;
 zoomTo:(selection?:object)=>void;
 zoom:(factor:number)=>void;
 rotate:(angle:number,axis:string)=>void;
 render:()=>void;resize:()=>void;clear:()=>void;
 removeAllLabels:()=>void;addLabel:(text:string,style:object,selection?:object)=>void;
 setClickable:(selection:object,value:boolean,callback:(atom:Atom)=>void)=>void;
 getView:()=>number[];setView:(view:number[])=>void;
};
type Mol={createViewer:(el:HTMLElement,config:object)=>Viewer};
declare global{interface Window{$3Dmol?:Mol}}
let libraryPromise:Promise<Mol>|null=null;
function loadViewer(){
 if(window.$3Dmol)return Promise.resolve(window.$3Dmol);
 if(!libraryPromise)libraryPromise=new Promise<Mol>((resolve,reject)=>{
  const script=document.createElement('script');script.src='/vendor/3Dmol-min.js';script.async=true;
  const timer=setTimeout(()=>{libraryPromise=null;script.remove();reject(new Error('3D viewer loading timed out.'));},20000);
  script.onload=()=>{clearTimeout(timer);if(window.$3Dmol)resolve(window.$3Dmol);else{libraryPromise=null;reject(new Error('3D viewer unavailable.'));}};
  script.onerror=()=>{clearTimeout(timer);libraryPromise=null;script.remove();reject(new Error('3D viewer could not load.'));};
  document.head.appendChild(script);
 });
 return libraryPromise;
}
const palette=['#42c7b4','#5fbfd7','#7ea4e8','#aaa0e8','#d09bd6','#e7a3b2','#eab189','#d3c47f','#aacd88','#77c9a4','#60b8c2','#769dd1'];
const confidence=(a:Atom)=>a.b>=90?'#0053d6':a.b>=70?'#65cbf3':a.b>=50?'#ffdb13':'#ff7d45';
export default function StructureShowcase({modelUrl='/structures/wt-puf12-c388.cif',modelProtein=built.protein,modelName='PUF12 · C388 RNA',external=false}:{modelUrl?:string;modelProtein?:string;modelName?:string;external?:boolean}){
 const data=useMemo(()=>({...built,protein:modelProtein,repeats:built.repeats.map(r=>({...r,wtTrm:r.trmPositions1.map(p=>modelProtein[p-1]).join('')}))}),[modelProtein]);
 const host=useRef<HTMLDivElement>(null),viewer=useRef<Viewer|null>(null),initialView=useRef<number[]|null>(null);
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [color,setColor]=useState('repeat'),[trms,setTrms]=useState(true),[selected,setSelected]=useState<number|null>(null),[rnaSelected,setRnaSelected]=useState<number|null>(null);
 const repeat=data.repeats.find(r=>r.repeat===selected);
 useEffect(()=>{
  let cancelled=false;let observer:ResizeObserver|undefined;let instance:Viewer|undefined;
  const controller=new AbortController();setReady(false);setError('');
  Promise.all([loadViewer(),fetch(modelUrl,{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('Structure could not load.');return r.text();})]).then(([mol,cif])=>{
   if(cancelled||!host.current)return;
   instance=mol.createViewer(host.current,{backgroundColor:'#19143D',antialias:true});
   if(!instance)throw new Error('WebGL is unavailable in this browser.');
   viewer.current=instance;instance.addModel(cif,'cif');
   instance.setStyle({chain:'A'},{cartoon:{color:'#72c5c0'}});
   instance.setStyle({chain:'B'},{stick:{color:'#f4da97',radius:.2}});
   instance.setClickable({chain:'A'},true,a=>{const r=data.repeats.find(r=>a.resi>=r.start1&&a.resi<=r.end1);setSelected(r?.repeat??null);setRnaSelected(r?.rnaPosition??null);});
   instance.setClickable({chain:'B'},true,a=>{setRnaSelected(a.resi);setSelected(data.repeats.find(r=>r.rnaPosition===a.resi)?.repeat??null);});
   instance.zoomTo();instance.rotate(25,'y');instance.render();initialView.current=instance.getView();
   observer=new ResizeObserver(()=>{instance?.resize();instance?.render();});observer.observe(host.current);
   setReady(true);
  }).catch(e=>{if(!cancelled)setError(e.message||'Unable to display this structure.');});
  return()=>{cancelled=true;controller.abort();observer?.disconnect();instance?.clear();viewer.current=null;host.current?.replaceChildren();};
 },[attempt,modelUrl,data]);
 useEffect(()=>{
  const v=viewer.current;if(!ready||!v)return;
  v.setStyle({},{});
  v.setStyle({chain:'A'},{cartoon:color==='confidence'?{colorfunc:confidence}:{color:'#728f9f'}});
  if(color==='repeat')data.repeats.forEach((r,i)=>v.setStyle({chain:'A',resi:Array.from({length:r.end1-r.start1+1},(_,j)=>r.start1+j)},{cartoon:{color:palette[i]}}));
  v.setStyle({chain:'B'},{stick:color==='confidence'?{colorfunc:confidence,radius:.2}:{color:'#ead398',radius:.2}});
  if(trms)data.repeats.forEach((r,i)=>v.addStyle({chain:'A',resi:r.trmPositions1},{stick:{color:color==='confidence'?undefined:palette[i],...(color==='confidence'?{colorfunc:confidence}:{}),radius:.15}}));
  if(repeat){
   v.addStyle({chain:'A',resi:repeat.trmPositions1},{stick:{color:'#ffffff',radius:.25}});
   v.setStyle({chain:'B',resi:repeat.rnaPosition},{stick:{color:'#ffffff',radius:.25},sphere:{color:'#ffffff',scale:.25}});
  }
  if(rnaSelected&&rnaSelected>12)v.addStyle({chain:'B',resi:rnaSelected},{sphere:{color:'#ffffff',scale:.25}});
  // Keep target C visible in repeat mode; confidence mode preserves its actual pLDDT coloring.
  if(color==='repeat')v.setStyle({chain:'B',resi:15},{stick:{color:'#ff9850',radius:.28},sphere:{color:'#ff9850',scale:.3}});
  v.removeAllLabels();
  v.addLabel('C388',{fontSize:14,fontColor:'#ffffff',backgroundColor:'#874621',backgroundOpacity:.85,inFront:true},{chain:'B',resi:15});
  v.render();
 },[ready,color,trms,repeat,rnaSelected]);
 function reset(){setSelected(null);setRnaSelected(null);setColor('repeat');setTrms(true);if(initialView.current){viewer.current?.setView(initialView.current);viewer.current?.render();}}
 const m=data.models[0];
 return <article className="structure-card">
  <div className="structure-title"><div><span className="showcase-label">EXPLORE THE COMPLEX</span><h3>{modelName}</h3></div><span className="structure-predicted">AF3 prediction</span></div>
  <div className="structure-canvas-wrap"><div className="structure-canvas" ref={host} tabIndex={0} role="region" aria-label="Interactive PUF12–RNA structure. Drag to rotate, pinch or scroll to zoom. Arrow keys rotate; plus and minus zoom." onKeyDown={e=>{const v=viewer.current;if(!v)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key)){e.preventDefault();if(e.key==='+'||e.key==='=')v.zoom(1.1);else if(e.key==='-')v.zoom(.9);else v.rotate(e.key==='ArrowLeft'||e.key==='ArrowDown'?-10:10,e.key==='ArrowLeft'||e.key==='ArrowRight'?'y':'x');v.render();}}}/>
  {!ready&&<div className="structure-loading" role="status">{error?<><Box size={28}/><p>{error}</p><Button variant="outline" onClick={()=>setAttempt(a=>a+1)}>Retry</Button><a href={modelUrl} download>Download structure</a></>:<><Loader2 className="spin" size={26}/><p>Loading protein–RNA structure…</p></>}</div>}
  <span className="structure-gesture">Drag to rotate · scroll / pinch to zoom</span></div>
  <div className="structure-controls"><NativeSelect aria-label="Structure coloring" value={color} onChange={e=>setColor(e.target.value)}><option value="repeat">Repeat colors</option><option value="confidence">pLDDT confidence</option></NativeSelect><Button variant="outline" aria-pressed={trms} onClick={()=>setTrms(t=>!t)}>TRM side chains {trms?'on':'off'}</Button><Button variant="outline" onClick={reset} aria-label="Reset structure view"><RotateCcw size={15}/>Reset</Button><a className="structure-download" href={modelUrl} download aria-label="Download predicted CIF"><Download size={18}/></a></div>
  {color==='confidence'?<div className="structure-legend">{[['#0053d6','≥90'],['#65cbf3','70–90'],['#ffdb13','50–70'],['#ff7d45','<50']].map(([c,t])=><span key={t}><i style={{background:c}}/>{t}</span>)}<span>Atom pLDDT</span></div>:<div className="structure-legend"><span><i style={{background:'#ead398'}}/>RNA</span><span><i style={{background:'#ff9850'}}/>Target C388</span><span>Protein N → C: R1 → R12</span></div>}
  <div className="structure-sequence"><span>RNA 5′ → 3′</span><div>{data.rna.split('').map((base,i)=><button key={i} aria-label={'RNA '+base+(i+1)+(i===14?' · target C388':'')} aria-pressed={rnaSelected===i+1} className={(i===14?'target-base ':'')+(rnaSelected===i+1?'active':'')} onClick={()=>{setRnaSelected(i+1);setSelected(data.repeats.find(r=>r.rnaPosition===i+1)?.repeat??null);}}><small>{i+1}</small><b>{base}</b><small>{i<12?'R'+(12-i):i===14?'C388':'+'+(i-11)}</small></button>)}</div></div>
  <div className="structure-selection" aria-live="polite">{repeat?<><b>R{repeat.repeat} · {repeat.wtTrm} → {repeat.base}{repeat.rnaPosition}</b><span>TRM residues {repeat.trmPositions1.join(', ')}{!external&&<> · closest heavy atoms {repeat.minTrmRnaDistance.toFixed(2)} Å</>}</span></>:rnaSelected?<><b>{data.rna[rnaSelected-1]}{rnaSelected}{rnaSelected===15?' · target C388':''}</b><span>Downstream +{rnaSelected-12} from the designed recognition window.</span></>:<><b>Select a base or repeat in the structure.</b><span>12 repeats · 492 aa · 15 nt RNA</span></>}</div>
  <details className="structure-protein"><summary>Protein sequence · select a TRM residue</summary><div>{data.protein.split('').map((aa,i)=>{const r=data.repeats.find(r=>r.trmPositions1.includes(i+1));return <button key={i} disabled={!r} title={'Residue '+(i+1)+(r?' · R'+r.repeat+' TRM':'')} aria-label={aa+(i+1)+(r?' · R'+r.repeat+' TRM':'')} className={r&&r.repeat===selected?'active':r?'is-trm':''} onClick={()=>{if(r){setSelected(r.repeat);setRnaSelected(r.rnaPosition);}}}>{aa}</button>;})}</div></details>
  <div className="structure-stats">{external?<span>Imported structure · summary scores not supplied</span>:<><span>ipTM <b>{m.iptm.toFixed(2)}</b></span><span>pTM <b>{m.ptm.toFixed(2)}</b></span><span>Model <b>0 / rank 1</b></span></>}</div>
  <p className="structure-scope">{external?'Uploaded construct-specific structure.':'Fixed WT PUF12-9–C388 example. New TRM designs require a new structure prediction.'}</p>
 </article>;
}
