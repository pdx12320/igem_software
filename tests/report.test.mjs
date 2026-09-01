import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyze,modulePlan,DEMO_SEQUENCE,DEFAULTS,demoReferences,editingSitesAfter,allCsites} from '../lib/design.ts';
import {buildDesignReport} from '../lib/report.ts';

const lib=JSON.parse(fs.readFileSync(new URL('../data/puf-library.json',import.meta.url),'utf8'));
function fixture(){
 const refs=demoReferences(),c=analyze(DEMO_SEQUENCE,76,'target',refs,DEFAULTS).find(c=>c.offset===2),plan=modulePlan(c,lib);
 return {createdAt:'2026-09-01T16:00:00.000Z',analysisScope:'Synthetic example · 5 transcripts',target:{id:'target',sequence:DEMO_SEQUENCE,coordinate1:76},selectedDesign:c,moduleLibraryVersion:lib.version,modulePlan:plan.rows.map(r=>({repeat:r.repeat,base:r.base,module:r.selected})),pufProtein:plan.sequence,scaffoldId:plan.scaffold.id,lamar:null,localBystanders:editingSitesAfter(DEMO_SEQUENCE,c.end).filter(s=>s.position!==76),backgroundSites:allCsites([{id:'target',sequence:DEMO_SEQUENCE},...refs])};
}
test('readable report preserves selected window, TRMs, source scope and complete protein',()=>{
 const d=fixture(),html=buildDesignReport(d);
 assert.match(html,/<h1>Design Report<\/h1>/);assert.ok(html.includes(d.selectedDesign.motif));
 assert.match(html,/63–74/);assert.ok(html.includes(d.analysisScope));assert.match(html,/492 aa/);
 assert.ok(html.replaceAll('\n','').includes(d.pufProtein));
 for(const row of d.modulePlan)assert.ok(html.includes(row.module.trm));
 assert.match(html,/class="star" aria-label="Preferred/);assert.match(html,/window.print\(\)/);
});
test('missing scores stay unavailable, real zero scores display 0.000',()=>{
 const d=fixture(),missing=buildDesignReport(d);
 assert.match(missing,/Score unavailable/);assert.doesNotMatch(missing,/class="score">0\.000/);
 const ctx=d.target.sequence.slice(25,126);
 d.lamar={modelVersion:'LAMAR-test',referenceSet:'fixed-universe',scoreType:'ranking_score',predictions:[{context:ctx,score:0}]};
 const scored=buildDesignReport(d);assert.match(scored,/<strong>0\.000<\/strong>/);assert.match(scored,/LAMAR-test/);assert.match(scored,/fixed-universe/);
});
test('untrusted target, reference and model metadata are escaped in portable HTML',()=>{
 const d=fixture(),payload='<img src=x onerror="alert(1)">';
 d.target.id=payload;d.analysisScope=payload;d.moduleLibraryVersion=payload;
 d.selectedDesign.hits[0].transcript=payload;
 d.lamar={modelVersion:payload,referenceSet:payload,scoreType:'ranking_score',predictions:[]};
 const html=buildDesignReport(d);assert.ok(!html.includes(payload));assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
 assert.doesNotMatch(html,/<script|<img/i);
});
test('TRM-only plans remain readable without invented full protein sequences',()=>{
 const d=fixture(),c={...d.selectedDesign,n:10,start:65,motif:d.selectedDesign.motif.slice(-10)},p=modulePlan(c,lib);
 const html=buildDesignReport({...d,selectedDesign:c,modulePlan:p.rows.map(r=>({repeat:r.repeat,base:r.base,module:r.selected})),pufProtein:p.sequence,scaffoldId:null});
 assert.match(html,/10\/10 repeats assigned/);assert.match(html,/Full protein assembly requires a matching scaffold/);
 assert.doesNotMatch(html,/492 aa/);
});
test('readable hit table is bounded and declares the full hit count',()=>{
 const d=fixture(),hit=d.selectedDesign.hits[0];
 d.selectedDesign.hits=Array.from({length:65},(_,i)=>({...hit,transcript:`unique-${String(i).padStart(3,'0')}`}));
 const html=buildDesignReport(d);assert.match(html,/65 matches at ≤2 mismatches; showing 50/);
 assert.match(html,/unique-049/);assert.doesNotMatch(html,/unique-050/);
});
