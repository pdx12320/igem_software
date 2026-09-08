'use client';
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
const pages=[['overview','Overview'],['workbench','Design workbench'],['examples','Examples'],['lab','Evidence & engineering'],['methods','Methods & evidence']] as const;
export default function PageNavigation({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const ref=useRef<HTMLElement>(null);
 const [edges,setEdges]=useState({left:false,right:false});
 function measure(){const el=ref.current;if(el)setEdges({left:el.scrollLeft>2,right:el.scrollLeft+el.clientWidth<el.scrollWidth-2});}
 function reveal(){const el=ref.current;const active=el?.querySelector<HTMLElement>('[aria-current="page"]');if(!el||!active)return;const a=active.getBoundingClientRect(),n=el.getBoundingClientRect();const delta=a.left<n.left?a.left-n.left:a.right>n.right?a.right-n.right:0;if(delta)el.scrollBy({left:delta,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});measure();}
 useEffect(()=>{reveal();},[value]);
 useEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(reveal);observer.observe(el);for(const child of el.children)observer.observe(child);measure();return()=>observer.disconnect();},[]);
 function slide(direction:number){const el=ref.current;if(el)el.scrollBy({left:direction*el.clientWidth*.7,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
 return <div className="page-navigation"><Button variant="ghost" size="icon" className="nav-scroll-button" aria-label="Scroll navigation left" disabled={!edges.left} onClick={()=>slide(-1)}><ChevronLeft size={18}/></Button><nav ref={ref} aria-label="Main navigation" onScroll={measure}>{pages.map(([id,label])=><button key={id} type="button" className={value===id?'active':''} aria-current={value===id?'page':undefined} onClick={()=>onChange(id)} onFocus={e=>{const el=ref.current;if(!el)return;const a=e.currentTarget.getBoundingClientRect(),n=el.getBoundingClientRect();if(a.left<n.left)el.scrollLeft+=a.left-n.left;if(a.right>n.right)el.scrollLeft+=a.right-n.right;}}>{label}</button>)}</nav><Button variant="ghost" size="icon" className="nav-scroll-button" aria-label="Scroll navigation right" disabled={!edges.right} onClick={()=>slide(1)}><ChevronRight size={18}/></Button></div>;
}
