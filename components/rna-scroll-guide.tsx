'use client';

import {useEffect, useId, useState} from 'react';

const STRAND = 'M24 8 C-2 24 50 40 24 56 S-2 88 24 104 S50 136 24 152 S-2 184 24 200';

export default function RnaScrollGuide() {
  const clipId = useId();
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const range = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', schedule, {passive: true});
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, []);
  return <aside className="rna-scroll-guide" aria-label="RNA page guide">
    <div role="progressbar" aria-label="Page scroll progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
      <svg viewBox="0 0 48 208" aria-hidden="true">
        <defs><clipPath id={clipId}><rect width="48" height={8 + 192 * progress}/></clipPath></defs>
        <path d={STRAND} fill="none" stroke="#e1dff0" strokeWidth="3"/>
        <path d={STRAND} fill="none" stroke="#8176ce" strokeWidth="3" clipPath={`url(#${clipId})`}/>
        {['A','U','G','A','U'].map((base, index) => <g key={index} className={progress >= index / 4 ? 'rna-base reached' : 'rna-base'}>
          <circle cx="24" cy={8 + index * 48} r="7"/><text x="24" y={11 + index * 48}>{base}</text>
        </g>)}
      </svg>
    </div>
    <button type="button" className="rna-top-base" aria-label="Cytosine — back to top" title="Back to top" onClick={() => {
      window.scrollTo({top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    }}>
      <svg className="cytosine-icon" viewBox="0 0 76 86" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M40 24 L61 36 L61 59 L46 68 M34 68 L19 59 L19 43 M25 33 L40 24 M40 24 V14"/>
          <path d="M55 39 V55 M27 38 L40 30 M18 56 L7 62 M21 61 L10 67"/>
        </g>
        <g fill="currentColor" fontFamily="Arial,sans-serif" fontSize="12" textAnchor="middle">
          <text x="40" y="11">NH<tspan baselineShift="sub" fontSize="8">2</tspan></text>
          <text x="19" y="41">N</text><text x="40" y="76">N</text><text x="40" y="85" fontSize="9">H</text><text x="6" y="72">O</text>
        </g>
      </svg>
    </button>
  </aside>;
}
