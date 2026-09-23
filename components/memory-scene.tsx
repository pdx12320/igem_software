export default function MemoryScene() {
  return <svg className="memory-scene" viewBox="0 0 960 540" role="img" aria-labelledby="memory-scene-title">
    <title id="memory-scene-title">An older man sits on a park bench, looking uncertain. His family approaches, familiar memories appear, and he smiles. A symbolic RNA strand connects the scene.</title>
    <defs>
      <radialGradient id="scene-halo"><stop stopColor="#a79be4" stopOpacity=".35"/><stop offset="1" stopColor="#a79be4" stopOpacity="0"/></radialGradient>
      <linearGradient id="scene-sky" x2="0" y2="1"><stop stopColor="#51426c" stopOpacity=".1"/><stop offset="1" stopColor="#7e6494" stopOpacity=".3"/></linearGradient>
    </defs>
    <ellipse className="scene-warmth" cx="480" cy="275" rx="460" ry="260" fill="url(#scene-halo)"/>
    <path d="M65 460 V256 Q70 87 275 88 H685 Q890 88 895 256 V460Z" fill="url(#scene-sky)"/>
    <g className="scene-sun"><circle cx="725" cy="126" r="45" fill="#f7d4b4" opacity=".17"/><circle cx="725" cy="126" r="29" fill="#f7d4b4" opacity=".45"/></g>
    <g stroke="#9e8cbb" strokeWidth="1" opacity=".3" fill="none"><path d="M71 460 H892 M98 481 H864 M258 500 H715"/><path d="M123 148 Q190 125 237 148 M734 216 Q800 190 852 216"/></g>
    <g className="scene-tree"><path d="M127 455 Q152 350 131 220 M143 357 L94 305 M146 320 L188 270" stroke="#85749c" strokeWidth="9" fill="none" strokeLinecap="round"/><ellipse cx="129" cy="223" rx="70" ry="105" fill="#393855"/><ellipse cx="174" cy="257" rx="45" ry="68" fill="#45435f"/><ellipse cx="95" cy="286" rx="40" ry="55" fill="#514b6c"/></g>
    <g className="scene-leaf" fill="#a99bca"><path d="M107 205 Q128 195 121 225 Q111 223 107 205"/><path d="M163 248 Q182 241 181 265 Q169 267 163 248"/><path d="M87 298 Q102 282 113 304 Q97 316 87 298"/></g>
    <g className="scene-flowers" stroke="#7d8091" strokeWidth="3"><path d="M796 459 V400 M823 459 V423 M851 459 V398"/><path d="M796 444 Q780 420 776 436 M823 451 Q840 425 841 444" fill="none"/><g fill="#ddabc5" stroke="none"><circle cx="796" cy="396" r="10"/><circle cx="823" cy="420" r="8"/><circle cx="851" cy="394" r="10"/></g><g fill="#f4d7ae" stroke="none"><circle cx="796" cy="396" r="3"/><circle cx="823" cy="420" r="3"/><circle cx="851" cy="394" r="3"/></g></g>
    <ellipse cx="470" cy="472" rx="258" ry="20" fill="#100d2b" opacity=".45"/>
    <g className="scene-bench"><path d="M240 328 H620 M240 350 H620" stroke="#63577d" strokeWidth="17" strokeLinecap="round"/><path d="M236 390 H629" stroke="#817099" strokeWidth="18" strokeLinecap="round"/><path d="M255 396 L247 461 M608 396 L618 461 M257 312 V386 M605 312 V386" stroke="#3f365d" strokeWidth="10" strokeLinecap="round"/></g>
    <g className="scene-elder">
      <path d="M290 371 Q286 414 282 457 M355 371 Q359 414 369 457" stroke="#514868" strokeWidth="30" fill="none" strokeLinecap="round"/>
      <path d="M263 461 Q268 445 290 450 L299 472 H256 Q251 465 263 461 M355 452 Q374 443 386 460 L404 468 Q407 474 389 474 H357Z" fill="#262139"/>
      <g transform="translate(-5 58) scale(.83)">
            <g className="elder-body"><path d="M285 376 L297 301 Q311 266 368 265 H432 Q489 266 503 301 L515 376Z" fill="#9692ca"/><path d="M365 265 L400 307 435 265 424 244 H376Z" fill="#edbea4"/><path d="M361 265 L400 307 373 334 341 275 M439 265 L400 307 427 334 459 275" fill="#c6c4ff"/><path d="M400 308 V376" stroke="#69648f" strokeWidth="2"/><circle cx="410" cy="341" r="3" fill="#ece9ff"/><circle cx="410" cy="363" r="3" fill="#ece9ff"/></g>
            <g className="elder-head">
              <ellipse cx="333" cy="194" rx="13" ry="23" fill="#edbea4"/><ellipse cx="467" cy="194" rx="13" ry="23" fill="#edbea4"/>
              <path d="M335 149 Q335 95 400 95 Q465 95 465 149 V209 Q462 264 400 278 Q338 264 335 209Z" fill="#f5d3ba"/>
              <path d="M335 179 Q306 118 350 100 Q373 69 418 91 Q482 84 469 176 L454 156 448 120 Q427 144 365 125 L346 156 344 181Z" fill="#e4dff0"/>
              <path d="M361 149 Q375 144 385 149 M415 149 Q430 144 440 149" stroke="#aa8178" strokeWidth="2" fill="none"/>
              <g fill="none" stroke="#42375e" strokeWidth="3"><rect x="348" y="169" width="43" height="33" rx="13"/><rect x="409" y="169" width="43" height="33" rx="13"/><path d="M391 180 Q400 175 409 180 M334 178 H348 M452 178 H466"/></g>
              <g fill="#42375e"><circle cx="373" cy="186" r="3.5"/><circle cx="428" cy="186" r="3.5"/></g>
              <path d="M398 190 L392 218 Q400 223 408 218" stroke="#c39783" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
              <g className="elder-worried" stroke="#846759" strokeWidth="3" fill="none" strokeLinecap="round"><path d="M360 161 L382 156 M417 156 L439 161 M384 243 Q400 231 417 243"/></g>
              <g className="elder-smile"><path d="M381 237 Q400 259 421 237" stroke="#9f665d" strokeWidth="3" fill="none" strokeLinecap="round"/><ellipse cx="359" cy="219" rx="12" ry="6" fill="#e9a396" opacity=".5"/><ellipse cx="442" cy="219" rx="12" ry="6" fill="#e9a396" opacity=".5"/></g>
            </g>
      </g>
      <path d="M257 306 Q242 354 289 364" stroke="#9692ca" strokeWidth="25" fill="none" strokeLinecap="round"/>
      <ellipse cx="295" cy="364" rx="15" ry="9" fill="#f5d3ba"/>
      <g className="scene-reaching"><path d="M402 306 Q433 347 478 337" stroke="#9692ca" strokeWidth="23" fill="none" strokeLinecap="round"/><ellipse cx="479" cy="337" rx="15" ry="9" fill="#f5d3ba"/></g>
      <g className="scene-confusion" fill="#b6acd2" fontSize="30" fontFamily="Georgia,serif"><text x="245" y="156">?</text><text x="406" y="182">?</text></g>
    </g>
    <g className="scene-family">
      <g className="scene-parent">
        <path d="M628 364 L614 458 M663 365 L677 458" stroke="#52445f" strokeWidth="22" strokeLinecap="round"/>
        <path d="M601 456 H623 L630 473 H594 Q585 467 601 456 M665 455 H685 L699 467 Q702 473 691 473 H665Z" fill="#262139"/>
        <path d="M603 241 Q640 213 678 241 L694 363 Q641 383 591 363Z" fill="#b47e99"/>
        <path d="M628 218 V240 Q641 257 655 240 V218" fill="#e0ad94"/>
        <ellipse cx="641" cy="182" rx="38" ry="49" fill="#efc5aa"/>
        <path d="M605 190 Q584 129 627 125 Q678 112 682 169 L676 213 666 197 663 156 Q637 179 611 165Z" fill="#4d3753"/>
        <g fill="#4d3753"><circle cx="626" cy="187" r="3"/><circle cx="651" cy="187" r="3"/></g>
        <path d="M628 206 Q639 216 650 205" stroke="#a1656d" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <path d="M607 259 Q580 287 572 320 M674 262 Q707 310 686 331" stroke="#b47e99" strokeWidth="22" fill="none" strokeLinecap="round"/>
        <circle cx="573" cy="326" r="11" fill="#efc5aa"/><circle cx="682" cy="336" r="11" fill="#efc5aa"/>
      </g>
      <g className="scene-child">
        <path d="M511 397 L504 458 M541 397 L552 458" stroke="#717c95" strokeWidth="18" strokeLinecap="round"/>
        <path d="M493 455 H513 V472 H481 Q478 465 493 455 M544 455 H561 L575 466 Q581 474 567 474 H544Z" fill="#e1c6c6"/>
        <path d="M497 312 Q526 295 552 316 L558 401 H488Z" fill="#d6bfa3"/>
        <path d="M517 298 V313 Q527 324 537 313 V298" fill="#efc5aa"/>
        <ellipse cx="526" cy="273" rx="29" ry="36" fill="#f4cfb1"/>
        <path d="M497 280 Q479 239 519 231 Q557 225 556 272 L545 260 542 246 Q521 264 503 255Z" fill="#584252"/>
        <g fill="#4d3753"><circle cx="516" cy="275" r="2.5"/><circle cx="537" cy="275" r="2.5"/></g>
        <path d="M518 290 Q526 298 536 289" stroke="#b27a77" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d="M498 329 L482 339 M550 329 L572 327" stroke="#d6bfa3" strokeWidth="17" fill="none" strokeLinecap="round"/>
        <ellipse cx="479" cy="339" rx="10" ry="7" fill="#f4cfb1"/>
      </g>
    </g>
    <g className="scene-memory-cards">
      <g className="scene-photo photo-home" transform="translate(240 47) rotate(-9)"><rect width="98" height="91" rx="9" fill="#eee4ec"/><rect x="8" y="8" width="82" height="61" rx="4" fill="#6d648f"/><path d="M23 36 L49 18 75 36 V59 H23Z" fill="#d2bedc"/><path d="M43 59 V42 H56 V59" fill="#81729f"/><path d="M23 79 H64" stroke="#b6a7c5" strokeWidth="3" strokeLinecap="round"/></g>
      <g className="scene-photo photo-family" transform="translate(445 24) rotate(7)"><rect width="98" height="91" rx="9" fill="#eee4ec"/><rect x="8" y="8" width="82" height="61" rx="4" fill="#b493ac"/><circle cx="34" cy="29" r="10" fill="#f5d3ba"/><circle cx="65" cy="31" r="9" fill="#f5d3ba"/><path d="M17 64 V53 Q32 32 49 53 V64 M50 64 V51 Q64 37 80 52 V64" fill="#d4c5ea"/><path d="M23 79 H70" stroke="#b6a7c5" strokeWidth="3" strokeLinecap="round"/></g>
      <g className="scene-photo photo-heart" transform="translate(607 49) rotate(-5)"><rect width="72" height="72" rx="16" fill="#514368" stroke="#be9ec7"/><path d="M36 53 C5 33 23 16 36 29 C49 16 67 33 36 53Z" fill="#e5b0c2"/></g>
    </g>
    <path className="scene-memory-thread" d="M288 149 Q356 24 456 115 T627 137 Q701 208 575 239" fill="none" stroke="#d4b9ee" strokeWidth="2" strokeDasharray="5 7"/>
    <g className="scene-rna" fill="none" strokeLinecap="round">
      <path className="scene-rna-path" d="M167 185 C220 97 270 237 324 157 S426 93 480 154 S587 224 638 146 S739 101 793 160" stroke="#b7a3ec" strokeWidth="4"/>
      {[[207,148,'A'],[315,168,'U'],[426,112,'G'],[535,194,'C'],[657,124,'A'],[761,120,'U']].map(([x,y,base],index) => <g key={base+String(index)} transform={`translate(${x} ${y})`}>
        <path d="M0 0 V-24" stroke="#c7b5ed" strokeWidth="2"/><circle cy="-36" r="13" fill={base==='C'?'#f1b9c3':'#514370'} stroke="#c7b5ed"/><text y="-31" textAnchor="middle" fill={base==='C'?'#33284e':'#f3ecff'} stroke="none" fontSize="14" fontFamily="Arial,sans-serif">{base}</text>
      </g>)}
    </g>
  </svg>;
}
