import {Download,FileText,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import release from '@/data/local-installer-release.json';

function WindowsMark(){
 return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 3h12v12H3zm14 0h12v12H17zM3 17h12v12H3zm14 0h12v12H17z"/></svg>;
}

function MacMark(){
 return <svg viewBox="0 0 36 40" aria-hidden="true" focusable="false"><path fill="currentColor" d="M24 1c.2 2.6-.8 5.1-2.4 6.8-1.7 1.8-4.2 2.8-6.5 2.6-.2-2.4.9-5 2.5-6.6C19.3 2 21.8 1 24 1Zm-.4 10c-2.5-.1-4.7 1.5-6.1 1.5-1.5 0-3.6-1.4-5.8-1.4-3 0-5.8 1.7-7.2 4.4-3.1 5.6-.8 13.9 2.3 18.1 1.6 2.1 3.3 4.4 5.7 4.3 2.3-.1 3.2-1.5 5.8-1.5 2.8 0 3.6 1.5 6.1 1.4 2.5-.1 4-2.1 5.5-4.4 1.6-2.4 2.3-4.7 2.4-4.8-.1 0-4.8-1.8-4.8-7-.1-4.4 3.6-6.4 3.8-6.6-2.1-3-5.3-3.5-6.5-3.6Z"/></svg>;
}

const platforms=[
 {id:'windows' as const,name:'Windows',subtitle:'Windows x64',action:'Download for Windows',Mark:WindowsMark},
 {id:'macos' as const,name:'macOS',subtitle:'Apple Silicon · Intel',action:'Download for macOS',Mark:MacMark},
];

export default function LocalDownloads(){
 return <section className="app-downloads" aria-labelledby="local-download-title">
  <div className="app-downloads-heading"><h2 id="local-download-title">ORCA for your computer</h2></div>
  <div className="app-download-grid">
   {platforms.map(({id,name,subtitle,action,Mark})=><article className="app-download-card" key={id} aria-labelledby={'download-'+id+'-title'}>
    <div className="app-download-card-top"><span className={'app-platform-mark '+id}><Mark/></span></div>
    <div className="app-download-card-copy"><h3 id={'download-'+id+'-title'}>{name}</h3><p className="app-download-platform">{subtitle}</p></div>
    <div className="app-download-card-bottom"><Button asChild className="app-download-action"><a href={release.urls[id]} download={release.fileName}><Download size={17} aria-hidden="true"/>{action}</a></Button></div>
   </article>)}
  </div>
  <details className="app-download-help"><summary>Installation</summary><div className="app-download-help-body"><p>Extract the ZIP and open the launcher for your system. First launch installs the models. Enter your website CSV and species FASTA paths to run locally.</p><div className="app-download-help-links"><a href="/orca-local-v0.2-guide.txt" download><FileText size={15} aria-hidden="true"/>Setup guide</a><a href="/orca-local-v0.2-sha256.txt" download><ShieldCheck size={15} aria-hidden="true"/>SHA-256</a></div></div></details>
 </section>;
}
