import bundledRelease from '../data/local-download-release.json' with {type:'json'};

type AssetFetcher = {fetch(request:Request):Promise<Response>};
export type DownloadRelease = {
 version:string;fileName:string;bytes:number;sha256:string;
 urls:{windows:string;macos:string};
 parts:Array<{path:string;bytes:number;sha256:string}>;
};

const release=bundledRelease as DownloadRelease;

function matchesEtag(value:string|null,etag:string){
 return value?.split(',').some(item=>item.trim()==='*'||item.trim().replace(/^W\//,'')===etag)??false;
}

function byteRange(value:string,size:number):{start:number;end:number}|null{
 const match=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!match||(!match[1]&&!match[2]))return null;
 if(!match[1]){
  const suffix=Number(match[2]);
  if(!Number.isSafeInteger(suffix)||suffix<=0)return null;
  return {start:Math.max(0,size-suffix),end:size-1};
 }
 const start=Number(match[1]),end=match[2]?Number(match[2]):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;
 return {start,end:Math.min(end,size-1)};
}

/** Stream the immutable package through ASSETS with bounded memory and native
 * download/range semantics. Pieces stay below the host's individual asset cap.
 * Does not access model inputs, run inference, or accept uploads. */
export async function handleLocalDownload(request:Request,assets:AssetFetcher,current:DownloadRelease=release):Promise<Response|null>{
 const url=new URL(request.url);
 if(url.pathname!==current.urls.windows&&url.pathname!==current.urls.macos)return null;
 if(!assets||typeof assets.fetch!=='function')return new Response('Download assets are temporarily unavailable.',{status:503,headers:{'Cache-Control':'no-store'}});
 if(!Number.isSafeInteger(current.bytes)||current.bytes<=0||!current.parts.length||current.parts.some(part=>!Number.isSafeInteger(part.bytes)||part.bytes<=0)||current.parts.reduce((sum,part)=>sum+part.bytes,0)!==current.bytes)return new Response('Download manifest is inconsistent.',{status:503,headers:{'Cache-Control':'no-store'}});
 const etag=`"${current.sha256}"`;
 const headers=new Headers({
  'Content-Type':'application/zip',
  'Content-Disposition':`attachment; filename="${current.fileName}"`,
  'Accept-Ranges':'bytes','ETag':etag,'X-Content-Type-Options':'nosniff',
  'Cache-Control':'public, max-age=31536000, immutable',
 });
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 if(url.search)return new Response('Download URLs do not accept parameters.',{status:400,headers:{'Cache-Control':'no-store'}});
 if(matchesEtag(request.headers.get('If-None-Match'),etag))return new Response(null,{status:304,headers});
 let selected={start:0,end:current.bytes-1},status=200;
 const requested=request.headers.get('Range');
 const ifRange=request.headers.get('If-Range');
 if(request.method==='GET'&&requested&&(!ifRange||ifRange===etag)){
  const parsed=byteRange(requested,current.bytes);
  if(!parsed)return new Response(null,{status:416,headers:{...Object.fromEntries(headers),'Content-Range':`bytes */${current.bytes}`,'Content-Length':'0'}});
  selected=parsed;status=206;
  headers.set('Content-Range',`bytes ${selected.start}-${selected.end}/${current.bytes}`);
 }
 headers.set('Content-Length',String(selected.end-selected.start+1));
 if(request.method==='HEAD')return new Response(null,{status,headers});
 const segments:Array<{path:string;start:number;end:number;size:number}>=[];
 let offset=0;
 for(const part of current.parts){
  const end=offset+part.bytes-1;
  if(selected.start<=end&&selected.end>=offset)segments.push({path:part.path,start:Math.max(0,selected.start-offset),end:Math.min(part.bytes-1,selected.end-offset),size:part.bytes});
  offset+=part.bytes;
 }
 if(offset!==current.bytes||!segments.length)return new Response('Download manifest is inconsistent.',{status:503,headers:{'Cache-Control':'no-store'}});
 let next=0,reader:ReadableStreamDefaultReader<Uint8Array>|null=null,skip=0,remaining=0,cancelled=false;
 const body=new ReadableStream<Uint8Array>({
  async pull(controller){
   try{
    while(!cancelled){
     if(!reader){
      if(next>=segments.length){controller.close();return;}
      const part=segments[next++];
      const partResponse=await assets.fetch(new Request(new URL(part.path,url),{method:'GET',headers:{Range:`bytes=${part.start}-${part.end}`,'Accept-Encoding':'identity'}}));
      if(cancelled){await partResponse.body?.cancel();return;}
      if((partResponse.status!==200&&partResponse.status!==206)||!partResponse.body){await partResponse.body?.cancel();throw Error('A package asset is unavailable. Retry the download.');}
      const expectedLength=partResponse.status===206?part.end-part.start+1:part.size;
      const assetLength=partResponse.headers.get('Content-Length');
      if((assetLength!==null&&Number(assetLength)!==expectedLength)||/^text\/html\b/i.test(partResponse.headers.get('Content-Type')??'')||!['','identity'].includes(partResponse.headers.get('Content-Encoding')??'')){await partResponse.body.cancel();throw Error('A package asset returned invalid download metadata.');}
      if(partResponse.status===206&&partResponse.headers.get('Content-Range')!==`bytes ${part.start}-${part.end}/${part.size}`){await partResponse.body.cancel();throw Error('A package asset returned a mismatched range.');}
      reader=partResponse.body.getReader();
      skip=partResponse.status===206?0:part.start;
      remaining=part.end-part.start+1;
     }
     const {value,done}=await reader.read();
     if(cancelled)return;
     if(done){reader.releaseLock();reader=null;throw Error('The package download was truncated. Retry the download.');}
     if(!value?.byteLength)continue;
     const begin=Math.min(skip,value.byteLength);skip-=begin;
     const length=Math.min(remaining,value.byteLength-begin);
     if(!length)continue;
     remaining-=length;
     controller.enqueue(value.subarray(begin,begin+length));
     if(remaining===0){const finished=reader;reader=null;try{await finished.cancel();}finally{finished.releaseLock();}if(!cancelled&&next>=segments.length)controller.close();}
     return;
    }
   }catch(error){
    console.error('ORCA package download failed:',error instanceof Error?error.message:'Stream failure.');
    if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();reader=null;}
    if(!cancelled)controller.error(error);
   }
  },
  async cancel(){cancelled=true;const active=reader;reader=null;if(active){await active.cancel().catch(()=>{});active.releaseLock();}},
 });
 return new Response(body,{status,headers});
}
