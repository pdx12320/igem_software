import manifest from '../data/local-download-release.json' with {type:'json'};
import type {DownloadRelease} from './local-downloads';

type Part = DownloadRelease['parts'][number];
export type ReleaseObject = {
 size:number;customMetadata?:Record<string,string>;
 body?:ReadableStream<Uint8Array>;
 range?:{offset?:number;length?:number};
};
/** Structural subset of the documented Cloudflare Workers R2 binding API. */
export type ReleaseBucket = {
 head(key:string):Promise<ReleaseObject|null>;
 get(key:string,options?:{range?:{offset:number;length:number}}):Promise<ReleaseObject|null>;
 put(key:string,body:ReadableStream<Uint8Array>|string,options:{
  onlyIf:Headers;sha256:ArrayBuffer;customMetadata:Record<string,string>;
  httpMetadata:{contentType:string;cacheControl:string};
 }):Promise<ReleaseObject|null>;
};
const release = manifest as DownloadRelease;
const uploadPrefix = '/internal/local-release-assets/';
const error = (message:string,status:number) => new Response(message,{status,headers:{'Cache-Control':'no-store'}});
const reply = (value:Record<string,unknown>,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});

function partKey(part:Part){return part.path.slice(1);}
function readyKey(current:DownloadRelease){return `local-releases/${current.version}/ready.json`;}
function matchesPart(object:ReleaseObject|null,part:Part){return !!object&&object.size===part.bytes&&object.customMetadata?.sha256===part.sha256;}
function hashBytes(hex:string):ArrayBuffer{
 if(!/^[0-9a-f]{64}$/.test(hex))throw Error('Invalid release checksum.');
 // A fresh Uint8Array owns exactly 32 bytes: no pooled-buffer offset ambiguity.
 const bytes=new Uint8Array(32);
 for(let index=0;index<bytes.length;index++)bytes[index]=Number.parseInt(hex.slice(index*2,index*2+2),16);
 return bytes.buffer;
}
function authenticated(request:Request,key:string|undefined){
 if(!key)return false;
 const provided=/^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization')??'')?.[1]??'';
 const encoder=new TextEncoder(),expected=encoder.encode(key),received=encoder.encode(provided);
 let difference=expected.length^received.length;
 for(let index=0;index<expected.length;index++)difference|=expected[index]^(received[index]??0);
 return difference===0;
}

/** Serve only immutable manifest-selected pieces through R2, never arbitrary keys.
 * R2.get range uses offset/length, while HTTP endpoints use inclusive endpoints.
 * https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ */
export function createLocalReleaseAssetFetcher(bucket:ReleaseBucket|undefined,current:DownloadRelease=release){
 return {async fetch(request:Request):Promise<Response>{
  const url=new URL(request.url);
  const part=current.parts.find(value=>value.path===url.pathname);
  if(!part)return error('Unknown package asset.',404);
  if(url.search)return error('Asset parameters are not supported.',400);
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  if(!bucket)return error('Package storage is temporarily unavailable.',503);
  const headers=new Headers({'Content-Type':'application/octet-stream','Content-Length':String(part.bytes),
   'ETag':`"${part.sha256}"`,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
  try{
   if(request.method==='HEAD'){
    const object=await bucket.head(partKey(part));
    return matchesPart(object,part)?new Response(null,{status:200,headers}):error('Package asset is temporarily unavailable.',503);
   }
   let offset=0,length=part.bytes,status=200;
   const range=request.headers.get('Range');
   if(range){
    const parsed=/^bytes=(\d+)-(\d+)$/.exec(range);
    const start=parsed?Number(parsed[1]):-1,end=parsed?Number(parsed[2]):-1;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>=part.bytes)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${part.bytes}`,'Content-Length':'0'}});
    offset=start;length=end-start+1;status=206;
    headers.set('Content-Range',`bytes ${start}-${end}/${part.bytes}`);
    headers.set('Content-Length',String(length));
   }
   const object=await bucket.get(partKey(part),status===206?{range:{offset,length}}:undefined);
   if(!matchesPart(object,part)||!object?.body||(status===206&&object.range&&(object.range.offset!==offset||object.range.length!==length))){
    await object?.body?.cancel();
    return error('Package asset is temporarily unavailable.',503);
   }
   return new Response(object.body,{status,headers});
  }catch{return error('Package storage is temporarily unavailable.',503);}
 }};
}

/** A public download is ready only after the authenticated completion marker. */
export async function isLocalReleaseReady(bucket:ReleaseBucket|undefined,current:DownloadRelease=release):Promise<boolean>{
 if(!bucket)return false;
 try{return (await bucket.head(readyKey(current)))?.customMetadata?.sha256===current.sha256;}
 catch{return false;}
}

/** Restricted deployment transport; remove ORCA_RELEASE_UPLOAD_KEY after seeding.
 * The request body is passed directly to R2 so its known Content-Length survives.
 * Native SHA256 validation and If-None-Match:* prevent corrupt/racing overwrites.
 * Secrets are supplied by Worker env through the caller and never persisted here.
 */
export async function handleLocalReleaseUpload(request:Request,bucket:ReleaseBucket|undefined,uploadKey:string|undefined,current:DownloadRelease=release):Promise<Response|null>{
 const url=new URL(request.url);
 if(!url.pathname.startsWith(uploadPrefix))return null;
 if(!authenticated(request,uploadKey))return error('Not found.',404);
 if(url.search)return error('Upload parameters are not supported.',400);
 if(!bucket)return error('Package storage is temporarily unavailable.',503);
 const name=url.pathname.slice(uploadPrefix.length);
 if(name==='complete'){
  if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
  try{
   const existing=await bucket.head(readyKey(current));
   if(existing){
    if(existing.customMetadata?.sha256===current.sha256)return reply({ready:true,alreadyExists:true});
    return error('A different release completion marker already exists.',409);
   }
   for(const part of current.parts){
    if(!matchesPart(await bucket.head(partKey(part)),part))return error('The complete verified package has not been uploaded.',409);
   }
   const body=JSON.stringify({version:current.version,bytes:current.bytes,sha256:current.sha256,parts:current.parts.length});
   const checksum=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
   const written=await bucket.put(readyKey(current),body,{
    onlyIf:new Headers({'If-None-Match':'*'}),sha256:checksum,
    customMetadata:{sha256:current.sha256},httpMetadata:{contentType:'application/json',cacheControl:'no-store'},
   });
   if(!written){
    const raced=await bucket.head(readyKey(current));
    return raced?.customMetadata?.sha256===current.sha256?reply({ready:true,alreadyExists:true}):error('A conflicting completion marker already exists.',409);
   }
   return reply({ready:true,alreadyExists:false},201);
  }catch{return error('Release completion could not be verified.',503);}
 }
 const part=current.parts.find(value=>value.path.split('/').at(-1)===name&&/^part-\d{3}\.bin$/.test(name));
 if(!part)return error('Unknown package asset.',404);
 if(request.method!=='PUT')return new Response(null,{status:405,headers:{Allow:'PUT'}});
 const declared=request.headers.get('Content-Length');
 if(declared===null)return error('A fixed Content-Length is required.',411);
 if(!/^\d+$/.test(declared)||Number(declared)!==part.bytes)return error('Upload length differs from the immutable release manifest.',400);
 if(request.headers.has('Transfer-Encoding')||request.headers.has('Content-Encoding'))return error('Upload encoding is not supported.',400);
 if(!request.body)return error('An original package asset body is required.',400);
 try{
  const existing=await bucket.head(partKey(part));
  if(existing)return matchesPart(existing,part)?reply({stored:true,alreadyExists:true}):error('A different object already exists; it has been preserved.',409);
  const written=await bucket.put(partKey(part),request.body,{
   onlyIf:new Headers({'If-None-Match':'*'}),sha256:hashBytes(part.sha256),
   customMetadata:{sha256:part.sha256},httpMetadata:{contentType:'application/octet-stream',cacheControl:'public, max-age=31536000, immutable'},
  });
  if(!written){
   const raced=await bucket.head(partKey(part));
   return matchesPart(raced,part)?reply({stored:true,alreadyExists:true}):error('A different object already exists; it has been preserved.',409);
  }
  return matchesPart(written,part)?reply({stored:true,alreadyExists:false},201):error('Stored object metadata differs from the release manifest.',503);
 }catch{return error('Upload checksum or storage validation failed.',400);}
}
