import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildSync} from 'esbuild';

const root=fileURLToPath(new URL('..',import.meta.url));
const bundle=buildSync({absWorkingDir:root,entryPoints:['components/puf-ranking.tsx'],bundle:true,
  platform:'node',format:'cjs',external:['react','react-dom'],write:false});
const localModule={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(
  createRequire(import.meta.url),localModule,localModule.exports);
const PufCandidates=localModule.exports.default;
const props={protein:'A'.repeat(492),disabled:false,candidates:[{id:'candidate-1',label:'Design one',protein:'A'.repeat(492)}],
  onCandidates(){},result:null,onResult(){}};

test('the website keeps candidate handoff actions and leaves model execution to the local application',()=>{
  const html=renderToStaticMarkup(React.createElement(PufCandidates,props));
  assert.match(html,/PUF candidates/);
  assert.match(html,/Save candidate/);
  assert.match(html,/Protein FASTA/);
  assert.match(html,/Design one/);
  assert.match(html,/492 aa/);
  assert.match(html,/Remove Design one from candidate queue/);
  assert.doesNotMatch(html,/Rank candidates|ESM-2|Import result JSON|C295|C388|C871/);
  assert.doesNotMatch(bundle.outputFiles[0].text,/function rankLocalCandidates|puf-ranker-artifact/);
});

test('pending RNA changes prevent candidate mutation without hiding saved candidates',()=>{
  const html=renderToStaticMarkup(React.createElement(PufCandidates,{...props,disabled:true}));
  assert.match(html,/Apply RNA changes first/);
  assert.match(html,/Design one/);
  for(const action of ['Save candidate','Remove']){
    const button=[...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match=>match[0]).find(value=>value.endsWith(action+'</button>'));
    assert.ok(button);
    assert.match(button,/disabled=""/);
  }
});

test('the public Work flow has three ordered steps and no online model panel or model health request',()=>{
  const source=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
  const tabs=source.match(/const stepTabs=([^;]+);/)?.[1];
  assert.ok(tabs);
  assert.equal((tabs.match(/\['/g)||[]).length,3);
  assert.match(tabs,/\['design','RNA',Target\],\['optimize','PUF',Dna\],\['report','Export',FileText\]/);
  assert.doesNotMatch(source,/api\/workflow\/health|<OffTargetWorkspace|<TabsContent value="offtargets"|SYNTHETIC EXAMPLE|Protein N→C · antiparallel|<TableHead>TRMs<\/TableHead>/);
  assert.match(source,/<StepActions previous="design" next="report" label="Next · Export"/);
  assert.match(source,/navigate\('optimize'\)\}>Back · PUF/);
  assert.match(source,/restoreWorkflow\(raw.workflow/);
  assert.match(source,/serializeWorkflow\(\{candidates:rankCandidates/);
});

test('Methods experiments retain comparison, validation and fusion with no LaMAR job controls',()=>{
  const labBundle=buildSync({absWorkingDir:root,entryPoints:['components/lab-workspace.tsx'],bundle:true,
    platform:'node',format:'cjs',external:['react','react-dom'],write:false});
  const labModule={exports:{}};
  new Function('require','module','exports',labBundle.outputFiles[0].text)(
    createRequire(import.meta.url),labModule,labModule.exports);
  const html=renderToStaticMarkup(React.createElement(labModule.exports.default,{
    state:{assays:[],structures:{},notes:'',fusion:{order:'PUF-linker-APOBEC',linker:'',apobec:''}},
    protein:'A'.repeat(492),onChange(){},
  }));
  assert.equal((html.match(/role="tab"/g)||[]).length,3);
  assert.match(html,/>Compare<\/button>/);
  assert.match(html,/>Validation<\/button>/);
  assert.match(html,/>Fusion<\/button>/);
  assert.match(html,/Measured editing/);
  assert.doesNotMatch(html,/LAMAR jobs|Run LAMAR|Import LAMAR|Download job/);
  assert.doesNotMatch(labBundle.outputFiles[0].text,/function LamarJobs|api\/jobs\/lamar/);
});
