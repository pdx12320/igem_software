import type {ReactNode} from 'react';
import './methods-evidence.css';
import matrix from '@/data/trm-matrix.json';
import references from '@/data/references.json';

const sections = [
 ['workflow','Terms'], ['window','RNA window'], ['repeats','Repeats & TRMs'],
 ['structure','Structure'], ['models','Classifiers'], ['lamar','Off-targets'],
 ['engineering','Engineering'], ['report','Exports'], ['evidence','Evidence'],
 ['references','References'],
] as const;
function Cite({id,children}:{id:string;children:ReactNode}){
 return <a className="methods-citation" href={'#ref-'+id}>{children}</a>;
}
function MethodDetail({id,title,children}:{id:string;title:string;children:ReactNode}){
 return <section id={'method-'+id} className="method-detail-section"><details className="method-detail"><summary>{title}</summary><div className="method-detail-content">{children}</div></details></section>;
}
export default function MethodsEvidence({engineering}:{engineering:ReactNode}){
 return <article className="method-document">
  <header className="method-hero"><h2>Methods</h2><div className="method-hero-links"><a href="#method-engineering">Engineering tools</a><a href="#method-references">References & downloads</a></div></header>
  <div className="method-layout">
   <nav className="method-toc" aria-label="Methods contents">{sections.map(([id,label])=><a key={id} href={'#method-'+id}>{label}</a>)}</nav>
   <div className="method-body">
    <section id="method-workflow"><h3>Terms</h3><dl className="method-glossary">
     <div><dt>PUF</dt><dd>Pumilio and FBF RNA-binding domain.</dd></div>
     <div><dt>P / R</dt><dd>Physical protein position / native repeat source.</dd></div>
     <div><dt>TRM</dt><dd>Tripartite recognition motif: residues 12, 13 and 16.</dd></div>
     <div><dt>WT</dt><dd>Wild-type baseline.</dd></div>
    </dl></section>

    <MethodDetail id="window" title="RNA window">
     <p>For target C at 1-based position <i>p</i>, recognition length <i>L</i> = 8–12 nt and downstream offset <i>d</i> ∈ {'{2, 3, 4, 5}'}:</p>
     <div className="method-formula">start = p − d − L + 1<br/>end = p − d</div>
     <p>Offset +1 is the first base after binding. All C sites at +2–5 are retained, including bystanders. This prior follows CU5.1/CU5.17 ePUF10 preferences; CU5.15 has a reported +2–4 window. Other architectures require experimental confirmation. <Cite id="han2025">Han et al. (2025)</Cite>; <Cite id="han2026">author correction (2026)</Cite>.</p>
    </MethodDetail>

    <MethodDetail id="repeats" title="Repeats & TRMs">
     <p>Protein positions P run N→C; source repeats R run R1–R8. The register is antiparallel: P1 recognizes the RNA’s 3′ end. Advanced mode assigns R and TRM at each P without changing the RNA window. <Cite id="wang2002">Wang et al. (2002b)</Cite>.</p>
     <p>The native 8R matrix is from Figure 4 of <Cite id="zhou2021">Zhou et al. (2021)</Cite> (<Cite id="zhou2022">publisher correction, 2022</Cite>). Every supported code receives one ★: qualitative specificity support, not affinity ranking. Empty cells have no reported highly base-specific TRM.</p>
     <div className="method-table-wrap"><table><caption>Native repeat-specific TRMs</caption><thead><tr><th scope="col">Source</th>{['A','C','G','U'].map(base=><th scope="col" key={base}>{base}</th>)}</tr></thead><tbody>{matrix.rows.map((row,index)=><tr key={index}><th scope="row">R{index+1}</th>{(['A','C','G','U'] as const).map(base=><td key={base}>{row[base].join(' · ')||'—'}</td>)}</tr>)}</tbody></table></div>
     <p>Transfer to 8–12R designs is team-reported. Not every repeat order has linked validation. The native RNA-bound structure does not validate engineered 12R constructs. <Cite id="pdb1m8y">Wang et al. (2002a)</Cite>.</p>
     <p>WT12 source order: <code>R1–R2–R3–R5–R6–R7–R5–R6–R7–R6–R7–R8</code>. Assembly preserves caps, position-specific core residues and the seven-residue insertion after the penultimate repeat. TRM changes replace three recognition residues; changing R replaces that position’s source core. Built-in full scaffolds cover 8R and 12R; 9–11R requires a compatible scaffold.</p>
    </MethodDetail>

    <MethodDetail id="structure" title="Structural assessment">
     <p>AF3 uploads must match the protein and RNA in the request, CIF and full-data matrices. Sequence changes invalidate previous assessments. <Cite id="afserver">Google DeepMind</Cite>; <Cite id="puf-architecture">architecture methods</Cite>.</p>
     <div className="method-table-wrap"><table><caption>Structural outputs</caption><thead><tr><th>Output</th><th>Definition</th></tr></thead><tbody>
      <tr><td>pLDDT</td><td>Residue confidence summarized from CIF atom values; not editing activity.</td></tr>
      <tr><td>CP / PAE</td><td>Contact probability / predicted aligned error across repeat interfaces.</td></tr>
      <tr><td>S4 / S12 / S24</td><td>Upper-triangle protein pairs with CP &gt; 0.5 and sequence separation ≥ 4, 12 or 24, divided by analyzed protein length.</td></tr>
      <tr><td>Multiple predictions</td><td>Average models within each seed, then weight seeds equally. Models within one seed are not biological replicates.</td></tr>
     </tbody></table></div>
     <p>The supplied WT12–C388 complex has a 492-aa protein and 15-nt RNA, without APOBEC; it is displayed with <Cite id="3dmol">3Dmol.js</Cite>. Structural outputs do not establish thermodynamic stability or activity.</p>
    </MethodDetail>

    <MethodDetail id="models" title="Classifier validation">
     <p>Frozen version <code>70385e9</code>: C388 uses eight-feature Interface_CP logistic regression with WT-relative features and standard scaling. C295/C871 use ContactSeek CCR random forests: 100 trees, maximum depth 2, minimum leaf size 3. Features describe RNA contacts and WT differences. <Cite id="puf-trm-models">Model source</Cite>.</p>
     <p>Input: 519 aa = 16-aa N-terminal tag + 492-aa PUF core + 11-aa C-terminal tag. Removing the first seven protein tokens yields a 512 × 15 contact matrix. A 492-aa structure cannot be padded. Average contacts within seeds, calculate features per seed, then average seed features.</p>
     <p>Archived constructs use saved features; new TRM designs require matching AF3 evidence. Changed repeat-source architectures are outside these fixed-backbone classifiers. The cohort comprises WT and 30 mutants; fitting excludes WT. Mutation groups: P4, P5, P6, P7, P8 and P4+P7.</p>
     <div className="method-table-wrap"><table><caption>Frozen classes · balanced accuracy</caption><thead><tr><th>Site</th><th>High-class threshold</th><th>Construct-out</th><th>Position-group-out</th></tr></thead><tbody>
      <tr><td>C388</td><td>≥ 30% measured editing</td><td>0.760</td><td>0.780</td></tr>
      <tr><td>C295</td><td>≥ 12.83675% measured editing</td><td>0.825</td><td>0.525</td></tr>
      <tr><td>C871</td><td>≥ 45% measured editing</td><td>0.785</td><td>0.794</td></tr>
     </tbody></table></div>
     <p>Position-group-out holds out combinations; groups can share individual positions. Out-of-fold records use fold-specific decision thresholds; full-refit scores are separate. Scores are uncalibrated, not editing percentages, binding fractions or success probabilities.</p>
     <p>C295 position-group AUC is 0.4725. Model and activity-threshold selection used the same small cohort, with possible selection bias and no independent cohort. Some source zeros represent missing C→T records retained without exclusion sensitivity analysis.</p>
    </MethodDetail>

    <MethodDetail id="lamar" title="Off-target screening">
     <p>Local matching uses ungapped transcript windows with ≤2 mismatches. Only the exact target locus is excluded. Each hit retains all C sites at binding end +2–5; the background C screen is PUF-independent.</p>
     <p>LAMAR uses 101-nt transcript-oriented RNA with C at index 50 (zero-based). Sites missing 50 bases on either side remain unscored. Results match exact contexts, model version and fixed ranking population. PUF sequence and TRMs are not model inputs. <Cite id="lamar">LAMAR source</Cite>.</p>
     <p>Local reference limit: 25,000 nt. Whole-transcriptome analysis requires a versioned transcript FASTA, matching annotation and an inference service. Retain UTRs and record release, assembly, biotypes and checksum. The HTTPS job adapter and score import are available; hosted LAMAR inference remains pending. <Cite id="gencode">GENCODE</Cite>.</p>
     <p>The archived C388/C295/C871 RNAs are 15 nt: evidence for site-specific editing and structural classification, not full 101-nt LAMAR contexts.</p>
    </MethodDetail>

    <section id="method-engineering"><h3>Engineering tools</h3>
     <p>Compare imported measurements under matched construct, site, cell type, dose, time and batch. Keep replicate IDs distinct.</p>
     <details className="method-detail method-detail-small"><summary>Measurement definitions</summary><p>Display mean, sample SD (denominator <i>n</i> − 1) and imported-record count. One record has no SD. WT differences are percentage points. Users establish replicate independence; no significance test is performed. Saved assay records, notes and fusion inputs do not validate activity.</p></details>
     <div className="method-engineering-tools">{engineering}</div>
    </section>

    <MethodDetail id="report" title="Exports">
     <p>Design reports retain target coordinates, RNA intervals, P/R/TRM assignments, complete proteins, structural evidence, bystanders, similar sites, model version and reference scope. Missing scores stay unavailable; zero stays zero.</p>
     <p>Project JSON saves the library, repeat order, TRMs, reference, model results, AF3 evidence and experiments. FASTA, raw JSON and similar-site TSV are also available. Binding and editing fractions remain unestimated without suitable calibration.</p>
    </MethodDetail>

    <MethodDetail id="evidence" title="Evidence scope">
     <p>Published recognition and TRM findings apply to their reported constructs and conditions. Team-reported 8–12R transfer does not establish every permutation. AF3 describes exact input sequences; classifiers use a fixed backbone and small-cohort validation; LAMAR ranks contexts within a fixed reference population.</p>
     <p>The 24 repeat-order constructs provide structural comparisons without functional labels. The 31-sequence scaffold audit and the 31-construct classifier dataset are separate collections.</p>
    </MethodDetail>

    <section id="method-references"><h3>References</h3>
     <ol className="method-references">{references.map(ref=><li key={ref.id} id={'ref-'+ref.id}>{ref.authors} ({ref.year}). {ref.type==='article'?<>{ref.title}. <em>{ref.journal}, {ref.volume}</em>{ref.issue&&'('+ref.issue+')'}, {ref.locator}. </>:<><em>{ref.title}</em>{ref.descriptor&&' '+ref.descriptor}. {ref.publisher&&ref.publisher+'. '}{ref.retrieval&&ref.retrieval+' '}</>}<a href={ref.url} target="_blank" rel="noreferrer">{ref.url}</a>{ref.note&&<span className="method-reference-note">{ref.note}</span>}</li>)}</ol>
     <div className="method-downloads"><h4>Downloads</h4><a href="/trm-matrix.json" download>TRM matrix · JSON</a><a href="/puf12-audit.json" download>PUF12 audit · JSON</a><a href="/puf12-input.fasta" download>Original scaffolds · FASTA</a><a href="/puf-library.json" download>Module library · JSON</a><a href="/implementation-handoff.md" download>Implementation guide</a><a href="/structural-models-methods.md" download>Model methods</a></div>
    </section>
   </div>
  </div>
 </article>;
}
