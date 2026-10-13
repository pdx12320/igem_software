import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildSync} from 'esbuild';

const root=fileURLToPath(new URL('..',import.meta.url));
// Compile the trusted local component in memory with the existing toolchain.
// React stays external so the component and server renderer share one instance.
const bundle=buildSync({absWorkingDir:root,entryPoints:['components/local-downloads.tsx'],bundle:true,
  platform:'node',format:'cjs',external:['react','react-dom','lucide-react'],write:false});
const localModule={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(
  createRequire(import.meta.url),localModule,localModule.exports);
const {default:LocalDownloads}=localModule.exports;
const html=renderToStaticMarkup(React.createElement(LocalDownloads));
const release=JSON.parse(fs.readFileSync(path.join(root,'data/local-installer-release.json'),'utf8'));

test('platform downloads render as direct, named anchors to the local model installer',()=>{
  for(const [platform,label] of [['windows','Download for Windows'],['macos','Download for macOS']]){
    const href=release.urls[platform];
    assert.equal(href,`/downloads/v0.2.0-preview/${platform}.zip`);
    const anchor=[...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match=>match[0]).find(value=>value.includes(`href="${href}"`));
    assert.ok(anchor,`${platform} direct download anchor is present`);
    assert.match(anchor,/data-slot="button"/);
    assert.ok(anchor.includes(`download="${release.fileName}"`));
    assert.ok(anchor.includes(label));
  }
  assert.doesNotMatch(html,/<button\b/);
  assert.doesNotMatch(html,/cached ESM-2|Preview|324 MB|Both downloads contain/);
  assert.match(html,/First launch installs the models/);
});

test('platform names, test scope and setup help survive actual component rendering',()=>{
  assert.match(html,/aria-labelledby="local-download-title"/);
  assert.match(html,/<h3 id="download-windows-title">Windows<\/h3>/);
  assert.match(html,/<h3 id="download-macos-title">macOS<\/h3>/);
  assert.match(html,/focusable="false"/);
  assert.match(html,/href="\/orca-local-v0.2-guide\.txt" download=""/);
  assert.match(html,/href="\/orca-local-v0.2-sha256\.txt" download=""/);
  assert.match(html,/website CSV and species FASTA paths/);
});

test('download cards mount only in the final Export tab before the Back action',()=>{
  const source=fs.readFileSync(path.join(root,'app/page.tsx'),'utf8');
  const start=source.indexOf('<TabsContent value="report">');
  const end=source.indexOf('</TabsContent>',start);
  const content=source.slice(start,end);
  assert.equal((source.match(/<LocalDownloads\s*\/>/g)||[]).length,1);
  assert.ok(content.includes('<LocalDownloads/>'));
  assert.ok(content.indexOf('<LocalDownloads/>')>content.indexOf('Other formats'));
  assert.ok(content.indexOf('<LocalDownloads/>')<content.indexOf('Back · PUF'));
});
