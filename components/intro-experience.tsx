'use client';

import {createContext, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import './intro-experience.css';
import MemoryScene from './memory-scene';
import RnaScrollGuide from './rna-scroll-guide';

const INTRO_PLAYBACK_RATE = 1.5;
const IntroContext = createContext({ready: true});
const TITLES = ['Design RNA editors.', 'Explore RNA targets.', 'Build with precision.', "Let's go"];
const TITLE_COLORS = ['#eee9f7', '#e1efe4', '#f6e1d6', '#dfeaf7', '#f5edcc', '#e1f0ed', '#f2e0eb', '#e7e4f8'];

export default function IntroExperience({children}: {children: ReactNode}) {
  const [playing, setPlaying] = useState(true);
  const content = useRef<HTMLDivElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!playing) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => setPlaying(false);
    if (motion.matches) { finish(); return; }
    const timer = window.setTimeout(finish, 11400 / INTRO_PLAYBACK_RATE);
    const onPreference = () => { if (motion.matches) finish(); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { returnFocus.current = true; finish(); }
    };
    motion.addEventListener('change', onPreference);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      motion.removeEventListener('change', onPreference);
      window.removeEventListener('keydown', onKey);
    };
  }, [playing]);

  useEffect(() => {
    if (playing && returnFocus.current) skip.current?.focus();
    if (!playing && (returnFocus.current || document.activeElement === document.body)) {
      content.current?.querySelector<HTMLElement>('h1')?.focus({preventScroll: true});
      returnFocus.current = false;
    }
  }, [playing]);

  return <IntroContext.Provider value={{ready: !playing}}>
    {playing && <section className="memory-intro" aria-label="An illustrated vision of memory and connection">
      <div className="intro-top"><span>SUSTech</span><button ref={skip} className="intro-skip" aria-label="Skip intro" onClick={() => {returnFocus.current = true; setPlaying(false);}}>Skip</button></div>
      <div className="intro-story">
        <p className="intro-kicker">EVERY MEMORY IS A CONNECTION</p>
        <div className="memory-art">
          <MemoryScene/>
        </div>
        <div className="intro-captions"><p className="intro-caption-before">When familiar moments feel far away.</p><p className="intro-caption-middle">A familiar face. A moment of connection.</p><p className="intro-caption-after">Small connections. New possibilities.</p></div>
      </div>
    </section>}
    <div ref={content} className={`experience-content ${playing ? 'intro-pending' : 'intro-ready'}`} inert={playing}>{children}</div>
    {!playing && <RnaScrollGuide/>}
  </IntroContext.Provider>;
}

export function AnimatedHeading() {
  const {ready} = useContext(IntroContext);
  const [frame, setFrame] = useState({phrase: 0, count: 0, color: 0});
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!ready || reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    let phrase = 0, count = 0, color = 0;
    let deleting = false;
    const tick = () => {
      setFrame({phrase, count, color});
      let delay = deleting ? 35 : 85;
      if (count === TITLES[phrase].length && !deleting) {
        deleting = true;
        delay = 2300;
      } else if (count === 0 && deleting) {
        deleting = false;
        phrase = (phrase + 1) % TITLES.length;
        color = (color + 1) % TITLE_COLORS.length;
        delay = 650;
      }
      count += deleting ? -1 : 1;
      timer = window.setTimeout(tick, delay);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [ready, reduced]);
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--orca-scene-bg');
    root.style.setProperty('--orca-scene-bg', TITLE_COLORS[frame.color]);
    return () => {
      if (previous) root.style.setProperty('--orca-scene-bg', previous);
      else root.style.removeProperty('--orca-scene-bg');
    };
  }, [ready, frame.color]);
  const title = reduced ? TITLES[0] : TITLES[frame.phrase].slice(0, frame.count);
  return <h1 className="typewriter-title" tabIndex={-1}>
    <span className="intro-sr-only">ORCA — Design RNA editors.</span>
    <span aria-hidden="true" className="typewriter-line"><span className="typewriter-letters">{title}</span>{!reduced && <i className="typing-caret"/>}</span>
  </h1>;
}

export function ScrollReveal({children, className = ''}: {children: ReactNode; className?: string}) {
  const {ready} = useContext(IntroContext);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const show = () => { if (media.matches) setVisible(true); };
    show();
    media.addEventListener('change', show);
    const observer = new IntersectionObserver(entries => {
      setVisible(media.matches || entries.some(entry => entry.isIntersecting) || !!ref.current?.contains(document.activeElement));
    }, {threshold: 0, rootMargin: '0px 0px -64px 0px'});
    if (ref.current) observer.observe(ref.current);
    return () => { observer.disconnect(); media.removeEventListener('change', show); };
  }, [ready]);
  return <div ref={ref} className={`scroll-reveal ${className}`} data-revealed={visible} onFocusCapture={() => setVisible(true)}><div className="reveal-content">{children}</div></div>;
}
