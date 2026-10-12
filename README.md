<div align="center">

# ORCA · SUSTech

### Programmable RNA editing.

Design PUF recognition modules, inspect sequence-bound evidence, and export a traceable RNA-editing design.

**[Open ORCA →](https://sustech-bio2026-software.pdx12320.chatgpt.site)**

[Quick start](#quick-start) · [Workflow](#workflow) · [Software DBTL](docs/software-dbtl.md) · [Documentation](#documentation) · [Local development](#local-development)

</div>

---

ORCA is a reproducible demonstration and usage tool for the team's **Best Model** work, with explicit input, model and result provenance.

## Quick start

1. **[Open the website](https://sustech-bio2026-software.pdx12320.chatgpt.site).** The main interface opens immediately, without an opening animation.
2. Select **Start** on Overview, or **Work** in the navigation.
3. Enter target RNA, build and save PUF candidates, upload species transcript FASTA, and export a scientist CSV. The supplied PUF ranker runs in the browser. LaMAR analysis requires a compatible service configured by the administrator.

The website is public and does not require a ChatGPT login. GitHub repository access is managed separately.

## Explore the application

| Page | What you can do |
| --- | --- |
| **Overview** | Rotating titles, a Start button and workflow cards. |
| **Work** | RNA, PUF, Off-targets and Export; save and reopen projects. |
| **Methods** | Expand methods and references, compare constructs, import assay results and prepare fusions. |

The RNA guide tracks page position; select the small cytosine structure below it to return to the top. Reduced-motion preferences are supported.

## Workflow

1. **Choose a window** — supply RNA/DNA or a FASTA record, a 1-based target C coordinate and an 8–12 nt recognition length.
2. **Build & rank PUF** — assign repeats and TRMs, save protein snapshots, and rank 492-aa candidates directly in the browser using the supplied module 2 model. The fixed extra terminal G has been removed from its input representation; frozen coefficients and cached ESM-2 features are preserved. Imported 493-aa proteins ending in G are normalized with an explicit notice. Its specificity score describes the fixed C295/C388/C871 assays, not arbitrary target RNA.
3. **Species & off-targets** — upload an uncompressed transcript FASTA (up to 100 MiB), identify its species and run a configured LaMAR job or import results. FASTA records, file checksum, RNA input, result coordinates and exact contexts are verified. A separate local preview remains limited to 25,000 nt.
4. **Scientist CSV** — export the target, candidate proteins, separate model outputs, site coordinates, reference/model provenance and missing-score status in one UTF-8 CSV. Project JSON preserves the workflow; reselect the original FASTA to reverify saved site evidence before exporting its scores or resuming analysis. The existing HTML report continues to describe the local preview.

## Capabilities and scope

- Local reference-subset screening and versioned TRM/scaffold data are included.
- Supplied examples, archived experimental measurements and imported results are distinguished in the application. The default workbench demonstration uses synthetic data.
- Structure assessment requires matching protein/RNA evidence. Site-specific classifiers retain their documented training scope and frozen thresholds.
- The PUF ranker bundles a passive numeric export of the supplied trained checkpoint; it needs no new runtime dependency or user service configuration. It supports substitutions in the fixed 492-aa coordinate system, retains the original cached ESM-2 reference context, and does not recompute ESM-2 embeddings or validate deletions experimentally.
- **No LaMAR backend has been deployed by this change.** A same-origin gateway is included, with administrator-only upstream configuration. The supplied module 4 archives have checkpoints but lack `LAMAR.sequence_classification_patch` and a reproducible inference environment. Missing scores remain unavailable; no editing probability is fabricated.
- Module 4 results retain their raw scalar ranking values; they are distinct from the legacy 0–1 context-import format. Cross-species validity and prediction conditioned on a new PUF have not been established.
- Uploading a file checks it locally. Explicitly selecting **Run LAMAR** sends the target, species and FASTA to the administrator-configured service. No user-facing API URL or credential field is required.
- Scientific methods, provenance and limitations are available in the application.

## Planned

These deliverables are **not yet complete**:

- A tutorial video.
- A Wiki guide to the tool's purpose and workflow logic, with a data-collection template and submission entry point.
- A one-click local LaMAR package.

The local LaMAR inference environment and missing components remain unfinished. Detection of actual off-target editing from raw FASTQ is not implemented.

## Documentation

| Resource | Contents |
| --- | --- |
| [Software DBTL](docs/software-dbtl.md) | Five software engineering iterations, verification evidence and planned follow-up work |
| [Implementation guide](public/implementation-handoff.md) | Coordinates, data contracts, reports and integration details |
| [Structural-model methods](public/structural-models-methods.md) | Model features, scope, validation and references |
| [Workflow model deployment](docs/model-service-deployment.md) | Administrator configuration, exact payloads and unresolved model prerequisites |
| [Legacy LAMAR service contract](public/lamar-service-contract.md) | Earlier context-only import adapter |
| [Technical notes & development history](docs/development-history.md) | Detailed earlier release notes, scaffold information and references |
| [Visual system](docs/orca-style.md) | Typography, palette and design provenance |
| [License](LICENSE) | MIT code license; separately licensed assets retain their notices |

## Local development

Requires **Node.js 22.13 or newer** and npm. Dependencies are fixed in `package-lock.json`.

```bash
git clone https://github.com/pdx12320/igem_software.git
cd igem_software
npm ci
npm run dev
```

Open the local URL printed by Vite. No LAMAR credentials are needed to use the local workbench.

Build and serve on macOS or Linux:

```bash
npm run build
npm run start
```

The build helper uses GNU `timeout` when available and a Node.js fallback otherwise; both enforce a three-minute default limit.

Run the core checks:

```bash
node --test tests/design.test.mjs tests/project.test.mjs tests/report.test.mjs tests/architecture-models.test.mjs
```

The Work workflow is covered by the original core checks and new inference-gateway, candidate, FASTA, result-binding, persistence and CSV checks. Run all focused checks with `node --test tests/design.test.mjs tests/project.test.mjs tests/report.test.mjs tests/architecture-models.test.mjs tests/puf-ranking.test.mjs tests/puf-ranker-local.test.mjs tests/scientist-csv.test.mjs tests/offtarget-workflow.test.mjs tests/reference-sites.test.mjs tests/workflow-project.test.mjs tests/workflow-service.test.mjs`. Full TypeScript checking retains missing Cloudflare ambient types (`cloudflare:workers`, `Fetcher`, `D1Database`). Legacy starter checks are separate from the core suite above.

## Source map

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Page navigation, workflow, imports and exports |
| `components/intro-experience.tsx` | Immediate page content; Overview titles and scroll reveals |
| `components/memory-scene.tsx` | Archived SVG illustration (not mounted) |
| `components/rna-scroll-guide.tsx` | RNA progress and cytosine return-to-top control |
| `components/intro-experience.css` | Landing and responsive styles |
| `app/work-flow.css` | Minimal workflow layout and model panels |
| `lib/` | Sequence design, reports, project validation and model inference |
| `data/` | Versioned matrices, scaffolds, examples and model provenance |
| `public/` | Evidence files and integration documentation |
| `tests/` | Scientific and application checks |

React · TypeScript · Vinext/Vite · Cloudflare Workers
