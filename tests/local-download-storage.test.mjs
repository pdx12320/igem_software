import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildSync} from 'esbuild';
const bundle=buildSync({entryPoints:[new URL('../lib/local-download-storage.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
const {createLocalReleaseAssetFetcher,handleLocalReleaseUpload,isLocalReleaseReady}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const downloadBundle=buildSync({entryPoints:[new URL('../lib/local-downloads.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
const {handleLocalDownload}=await import('data:text/javascript;base64,'+Buffer.from(downloadBundle.outputFiles[0].contents).toString('base64'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const PARTS=[Buffer.from('ABCD'),Buffer.from('EFG')];
const ALL=Buffer.concat(PARTS),TOKEN='fixture-only-private-key';
const RELEASE={version:'fixture',fileName:'fixture.zip',bytes:ALL.length,sha256:sha(ALL),
 urls:{windows:'/downloads/fixture/windows.zip',macos:'/downloads/fixture/macos.zip'},
 parts:PARTS.map((bytes,index)=>({path:`/download-assets/fixture/part-${String(index).padStart(3,'0')}.bin`,bytes:bytes.length,sha256:sha(bytes)}))};
const readyKey='local-releases/fixture/ready.json';
const key=index=>RELEASE.parts[index].path.slice(1);
const request=(path,init={})=>new Request('https://orca.example'+path,init);
function putRequest(index,body=PARTS[index],headers={}){
 return request('/internal/local-release-assets/'+RELEASE.parts[index].path.split('/').at(-1),{
  method:'PUT',body,headers:{Authorization:'Bearer '+TOKEN,'Content-Length':String(PARTS[index].length),...headers},
 });
}
const completeRequest=(init={})=>request('/internal/local-release-assets/complete',{method:'POST',headers:{Authorization:'Bearer '+TOKEN},...init});
function fakeBucket(){
 const objects=new Map(),calls=[];
 function metadata(value){return value?{size:value.bytes.length,customMetadata:{...value.customMetadata}}:null;}
 return {
  objects,calls,
  seed(index,{bytes=PARTS[index],hash=RELEASE.parts[index].sha256}={}){objects.set(key(index),{bytes:Buffer.from(bytes),customMetadata:{sha256:hash}});},
  async head(name){calls.push({operation:'head',name});return metadata(objects.get(name));},
  async get(name,options){
   calls.push({operation:'get',name,options});
   const value=objects.get(name);if(!value)return null;
   const selected=options?.range?value.bytes.subarray(options.range.offset,options.range.offset+options.range.length):value.bytes;
   return {...metadata(value),body:new Response(selected).body,...(options?.range?{range:{...options.range}}:{})};
  },
  async put(name,body,options){
   calls.push({operation:'put',name,options});
   assert.equal(options.onlyIf.get('If-None-Match'),'*','native conditional write is mandatory');
   if(objects.has(name))return null;
   assert.ok(options.sha256 instanceof ArrayBuffer);
   assert.equal(options.sha256.byteLength,32,'checksum has its exact 32-byte buffer range');
   const bytes=Buffer.from(await new Response(body).arrayBuffer());
   const expected=Buffer.from(options.sha256).toString('hex');
   if(sha(bytes)!==expected)throw Error('fake R2: checksum did not match');
   const value={bytes,customMetadata:{...options.customMetadata}};
   objects.set(name,value);
   return metadata(value);
  },
 };
}

test('R2 adapter gets only manifest keys and translates inclusive ranges to offset/length',async()=>{
 const bucket=fakeBucket();bucket.seed(0);
 const adapter=createLocalReleaseAssetFetcher(bucket,RELEASE);
 const response=await adapter.fetch(request(RELEASE.parts[0].path,{headers:{Range:'bytes=1-2',Authorization:'Bearer ignored',Cookie:'ignored'}}));
 assert.equal(response.status,206);
 assert.equal(response.headers.get('Content-Range'),'bytes 1-2/4');
 assert.equal(response.headers.get('Content-Length'),'2');
 assert.equal(await response.text(),'BC');
 assert.deepEqual(bucket.calls,[{operation:'get',name:key(0),options:{range:{offset:1,length:2}}}]);
});

test('complete download and cross-piece ranges use R2 without buffering a package',async()=>{
 const bucket=fakeBucket();bucket.seed(0);bucket.seed(1);
 const adapter=createLocalReleaseAssetFetcher(bucket,RELEASE);
 const full=await handleLocalDownload(request(RELEASE.urls.windows),adapter,RELEASE);
 assert.deepEqual(Buffer.from(await full.arrayBuffer()),ALL);
 const range=await handleLocalDownload(request(RELEASE.urls.macos,{headers:{Range:'bytes=2-5'}}),adapter,RELEASE);
 assert.equal(range.status,206);
 assert.equal(await range.text(),'CDEF');
});

test('missing or mismatched R2 objects return503 for GET and HEAD without falsely reporting readiness',async()=>{
 const bucket=fakeBucket(),adapter=createLocalReleaseAssetFetcher(bucket,RELEASE);
 assert.equal(await isLocalReleaseReady(bucket,RELEASE),false);
 for(const method of ['GET','HEAD'])assert.equal((await adapter.fetch(request(RELEASE.parts[0].path,{method}))).status,503);
 bucket.seed(0,{hash:'a'.repeat(64)});
 for(const method of ['GET','HEAD'])assert.equal((await adapter.fetch(request(RELEASE.parts[0].path,{method}))).status,503);
 bucket.seed(0,{bytes:Buffer.from('ABC')});
 assert.equal((await adapter.fetch(request(RELEASE.parts[0].path,{method:'HEAD'}))).status,503);
});

test('adapter rejects arbitrary keys, queries, methods and invalid ranges before reading storage',async()=>{
 const bucket=fakeBucket(),adapter=createLocalReleaseAssetFetcher(bucket,RELEASE);
 assert.equal((await adapter.fetch(request('/download-assets/private/part-000.bin'))).status,404);
 assert.equal((await adapter.fetch(request(RELEASE.parts[0].path+'?token=ignored'))).status,400);
 assert.equal((await adapter.fetch(request(RELEASE.parts[0].path,{method:'POST'}))).status,405);
 for(const Range of ['bytes=0-4','bytes=-1','bytes=1-0','bytes=0-1,2-3','bytes=9007199254740992-9007199254740993']){
  assert.equal((await adapter.fetch(request(RELEASE.parts[0].path,{headers:{Range}}))).status,416);
 }
 assert.deepEqual(bucket.calls,[]);
 assert.equal((await createLocalReleaseAssetFetcher(undefined,RELEASE).fetch(request(RELEASE.parts[0].path))).status,503);
});

test('disabled or unauthorized upload routes reveal no token and never access R2',async()=>{
 const bucket=fakeBucket();
 for(const token of [undefined,'wrong-key']){
  for(const incoming of [putRequest(0),completeRequest()]){
   const response=await handleLocalReleaseUpload(incoming,bucket,token,RELEASE);
   assert.equal(response.status,404);
   assert.equal((await response.text()).includes(TOKEN),false);
  }
 }
 const missingAuth=putRequest(0,PARTS[0],{Authorization:''});
 assert.equal((await handleLocalReleaseUpload(missingAuth,bucket,TOKEN,RELEASE)).status,404);
 assert.deepEqual(bucket.calls,[]);
 assert.equal(await handleLocalReleaseUpload(request('/other'),bucket,TOKEN,RELEASE),null);
});

test('authenticated PUT passes the known-length request body and exact native SHA256 to R2',async()=>{
 const bucket=fakeBucket(),incoming=putRequest(0),originalBody=incoming.body;
 const originalPut=bucket.put;
 bucket.put=async(name,body,options)=>{
  assert.equal(body,originalBody,'do not replace known-length HTTP stream with unknown-length TransformStream');
  assert.equal(Buffer.from(options.sha256).toString('hex'),RELEASE.parts[0].sha256);
  assert.deepEqual(options.customMetadata,{sha256:RELEASE.parts[0].sha256});
  return originalPut(name,body,options);
 };
 const response=await handleLocalReleaseUpload(incoming,bucket,TOKEN,RELEASE);
 assert.equal(response.status,201);
 assert.deepEqual(await response.json(),{stored:true,alreadyExists:false});
 assert.deepEqual(bucket.objects.get(key(0)).bytes,PARTS[0]);
});

test('bad length, body checksum, encoding and scope are rejected without corrupting stored pieces',async()=>{
 const bucket=fakeBucket();
 for(const [headers,status] of [[{'Content-Length':''},400],[{'Content-Length':'3'},400],[{'Content-Length':'NaN'},400],[{'Content-Encoding':'gzip'},400],[{'Transfer-Encoding':'chunked'},400]]){
  assert.equal((await handleLocalReleaseUpload(putRequest(0,PARTS[0],headers),bucket,TOKEN,RELEASE)).status,status);
 }
 const noLength=putRequest(0);noLength.headers.delete('Content-Length');
 assert.equal((await handleLocalReleaseUpload(noLength,bucket,TOKEN,RELEASE)).status,411);
 assert.deepEqual(bucket.calls,[]);
 const wrong=await handleLocalReleaseUpload(putRequest(0,Buffer.from('XXXX')),bucket,TOKEN,RELEASE);
 assert.equal(wrong.status,400);
 assert.equal(bucket.objects.size,0);
 for(const path of ['/internal/local-release-assets/part-999.bin','/internal/local-release-assets/part-000.bin/other','/internal/local-release-assets/%70art-000.bin']){
  assert.equal((await handleLocalReleaseUpload(request(path,{method:'PUT',headers:{Authorization:'Bearer '+TOKEN}}),bucket,TOKEN,RELEASE)).status,404);
 }
});

test('same hash and size are idempotent; different hash or size is preserved with409',async()=>{
 const bucket=fakeBucket();bucket.seed(0);
 const again=await handleLocalReleaseUpload(putRequest(0),bucket,TOKEN,RELEASE);
 assert.equal(again.status,200);
 assert.equal((await again.json()).alreadyExists,true);
 assert.equal(bucket.calls.filter(call=>call.operation==='put').length,0);
 for(const seeded of [{hash:'b'.repeat(64)},{bytes:Buffer.from('ABC')}]){
  bucket.seed(0,seeded);
  const preserved=Buffer.from(bucket.objects.get(key(0)).bytes);
  assert.equal((await handleLocalReleaseUpload(putRequest(0),bucket,TOKEN,RELEASE)).status,409);
  assert.deepEqual(bucket.objects.get(key(0)).bytes,preserved);
 }
 assert.equal(bucket.calls.filter(call=>call.operation==='put').length,0);
});

test('conditional write races never overwrite an existing object',async()=>{
 for(const conflict of [false,true]){
  const bucket=fakeBucket();
  bucket.put=async(_name,_body,options)=>{
   assert.equal(options.onlyIf.get('If-None-Match'),'*');
   bucket.seed(0,conflict?{hash:'c'.repeat(64)}:{});
   return null;
  };
  const response=await handleLocalReleaseUpload(putRequest(0),bucket,TOKEN,RELEASE);
  assert.equal(response.status,conflict?409:200);
 }
});

test('complete checks every piece before creating a checksum-verified ready marker',async()=>{
 const bucket=fakeBucket();bucket.seed(0);
 assert.equal((await handleLocalReleaseUpload(completeRequest(),bucket,TOKEN,RELEASE)).status,409);
 assert.equal(bucket.objects.has(readyKey),false);
 bucket.seed(1,{hash:'d'.repeat(64)});
 assert.equal((await handleLocalReleaseUpload(completeRequest(),bucket,TOKEN,RELEASE)).status,409);
 assert.equal(bucket.objects.has(readyKey),false);
 bucket.seed(1);
 const ready=await handleLocalReleaseUpload(completeRequest(),bucket,TOKEN,RELEASE);
 assert.equal(ready.status,201);
 assert.equal(await isLocalReleaseReady(bucket,RELEASE),true);
 const stored=bucket.objects.get(readyKey);
 assert.equal(stored.customMetadata.sha256,RELEASE.sha256);
 assert.deepEqual(JSON.parse(stored.bytes),{version:RELEASE.version,bytes:RELEASE.bytes,sha256:RELEASE.sha256,parts:2});
 const puts=bucket.calls.filter(call=>call.operation==='put').length;
 const again=await handleLocalReleaseUpload(completeRequest(),bucket,TOKEN,RELEASE);
 assert.equal(again.status,200);
 assert.equal((await again.json()).alreadyExists,true);
 assert.equal(bucket.calls.filter(call=>call.operation==='put').length,puts);
});

test('conflicting completion markers stay immutable, and missing bindings safely fail readiness',async()=>{
 const bucket=fakeBucket();
 bucket.objects.set(readyKey,{bytes:Buffer.from('{}'),customMetadata:{sha256:'e'.repeat(64)}});
 assert.equal(await isLocalReleaseReady(bucket,RELEASE),false);
 assert.equal((await handleLocalReleaseUpload(completeRequest(),bucket,TOKEN,RELEASE)).status,409);
 assert.equal(bucket.calls.filter(call=>call.operation==='put').length,0);
 assert.equal(await isLocalReleaseReady(undefined,RELEASE),false);
 assert.equal((await handleLocalReleaseUpload(putRequest(0),undefined,TOKEN,RELEASE)).status,503);
});
