import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildSync} from 'esbuild';

const root=fileURLToPath(new URL('..',import.meta.url));
function load(entry){
 const bundle=buildSync({absWorkingDir:root,entryPoints:[entry],bundle:true,
  platform:'node',format:'cjs',external:['react','react-dom'],write:false});
 const localModule={exports:{}};
 new Function('require','module','exports',bundle.outputFiles[0].text)(
  createRequire(import.meta.url),localModule,localModule.exports);
 return localModule.exports;
}
const Builder=load('components/architecture-builder.tsx').default;
const {analyze,DEMO_SEQUENCE,demoReferences,DEFAULTS,modulePlan}=load('lib/design.ts');
const {withArchitecture,defaultOrder}=load('lib/architecture.ts');
const library=JSON.parse(fs.readFileSync(new URL('../data/puf-library.json',import.meta.url),'utf8'));
const candidate=analyze(DEMO_SEQUENCE,76,'TARGET-DEMO',demoReferences(),DEFAULTS).find(row=>row.offset===2);
const props={candidate,library,overrides:{},onLibrary(){},onOverrides(){},
 rna:DEMO_SEQUENCE,evidence:[],onEvidence(){},level:'beginner',onLevel(){}};
const render=overrides=>renderToStaticMarkup(React.createElement(Builder,{...props,...overrides}));

test('saved Basic and Advanced projects open the same editable PUF controls without assessment panels',()=>{
 for(const level of ['beginner','expert']){
  const html=render({level});
  assert.match(html,/>Build PUF</);
  assert.match(html,/Source repeat for P/);
  assert.match(html,/aria-label="Select TRM for P1 source R1"/);
  assert.match(html,/>Reset order</);
  assert.match(html,/>Protein FASTA</);
  assert.equal((html.match(/aria-label="Edit P\d+,/g)||[]).length,12);
  assert.doesNotMatch(html,/Basic|Advanced|TRM assessment|TRM structure|Structural evidence|AF3|models loaded|role="tab"/);
 }
});

test('a saved module override is selected when the simplified editor opens',()=>{
 const first=modulePlan(candidate,library).rows[0];
 const replacement=first.options.find(module=>module.id!==first.selected?.id);
 assert.ok(replacement);
 const html=render({overrides:{1:replacement.id}});
 const options=[...html.matchAll(/<option\b[^>]*>[^<]*<\/option>/g)].map(match=>match[0]);
 const active=options.find(option=>option.includes(`value="${replacement.id}"`));
 assert.ok(active);
 assert.match(active,/selected=""/);
 assert.match(html,new RegExp(`aria-label="Edit P1, source R1, TRM ${replacement.trm}"`));
});

test('an architecture without a supplied scaffold retains the assembly explanation and disables protein export',()=>{
 const selected=analyze(DEMO_SEQUENCE,76,'TARGET-DEMO',demoReferences(),{...DEFAULTS,recognitionLength:10}).find(row=>row.offset===2);
 const html=render({candidate:selected,library:withArchitecture(library,10,defaultOrder(10))});
 assert.match(html,/Protein assembly requires a matching 10R scaffold/);
 const button=[...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
  .map(match=>match[0]).find(value=>value.endsWith('Protein FASTA</button>'));
 assert.ok(button);
 assert.match(button,/disabled=""/);
});
