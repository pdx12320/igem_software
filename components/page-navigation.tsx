'use client';
import {useEffect,useRef} from 'react';
const pages=[['overview','Overview'],['workbench','Work'],['methods','Methods']] as const;
export default function PageNavigation({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const ref=useRef<HTMLElement>(null);
 function reveal(){const el=ref.current;const active=el?.querySelector<HTMLElement>('[aria-current="page"]');if(!el||!active)return;const a=active.getBoundingClientRect(),n=el.getBoundingClientRect();const delta=a.left<n.left?a.left-n.left:a.right>n.right?a.right-n.right:0;if(delta)el.scrollBy({left:delta,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
 useEffect(()=>{reveal();},[value]);
 useEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(reveal);observer.observe(el);for(const child of el.children)observer.observe(child);return()=>observer.disconnect();},[]);
 return <div className="page-navigation"><nav ref={ref} aria-label="Main navigation">{pages.map(([id,label])=><button key={id} type="button" className={value===id?'active':''} aria-current={value===id?'page':undefined} onClick={()=>onChange(id)} onFocus={e=>{const el=ref.current;if(!el)return;const a=e.currentTarget.getBoundingClientRect(),n=el.getBoundingClientRect();if(a.left<n.left)el.scrollLeft+=a.left-n.left;if(a.right>n.right)el.scrollLeft+=a.right-n.right;}}>{label}</button>)}</nav></div>;
}
