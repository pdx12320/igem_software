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
3. Enter target RNA, build and save PUF candidates, and download CSV from **03 Export**. Download the Windows or macOS local installer on that page; its first launch installs the models. Enter the exported CSV and species FASTA paths in the local application.

The website is public and does not require a ChatGPT login. GitHub repository access is managed separately.

## Explore the application

| Page | What you can do |
| --- | --- |
| **Overview** | Rotating titles, a Start button and workflow cards. |
| **Work** | 01 RNA, 02 PUF and 03 Export; save and reopen projects. |
| **Methods** | Expand methods and references, compare constructs, import assay results and prepare fusions. |

The RNA guide tracks page position; select the small cytosine structure below it to return to the top. Reduced-motion preferences are supported.

## Workflow

1. **Choose a window** — supply RNA/DNA or a FASTA record, a 1-based target C coordinate and an 8–12 nt recognition length.
2. **Build PUF** — assign repeats and TRMs, and save protein candidates. The editor has one view for sequence selection.
3. **Export** — download the target and unscored candidate proteins as UTF-8 CSV. Project JSON preserves the saved project.
4. **Run locally** — install ORCA on your computer, enter the website CSV and species FASTA paths, and run the pinned ESM-2 and LaMAR models. Download ranking, site and combined CSV files.

## Capabilities and scope

- Versioned TRM/scaffold definitions and coordinate conventions are unchanged.
- The website prepares inputs. Model inference runs in the downloaded local application.
- The local ESM-2 model recomputes the original masked-reference features and uses the supplied frozen Ridge coefficients for the fixed C295/C388/C871 assays. The ranker supports its fixed 492/493-aa scaffold; incompatible proteins remain unscored.
- LaMAR retains separate raw RNA-context scores and every C in the supplied FASTA. These scores are independent of the selected PUF and are not editing probabilities.
- The default demonstration uses synthetic input. Methods retains scientific provenance and archived evidence.
- Input and output checks establish software behavior, not biological validity.

## Planned

These deliverables are **not yet complete**:

- A tutorial video.
- A Wiki guide to the tool's purpose and workflow logic, with a data-collection template and submission entry point.
- Windows and Intel Mac acceptance testing for the local application preview.

The public website's hosted LaMAR service remains unconfigured. The local application preview provides a pinned 101-nt CPU runner. Detection of actual off-target editing from raw FASTQ is not implemented.

## Local application downloads

Open **Work → 03 Export** for Windows and macOS installer cards. Both entries contain the same lightweight ZIP and platform launchers. On first launch, the installer downloads an isolated Python runtime, pinned dependencies, ESM-2 and the supplied ORCA LaMAR checkpoint, verifying model checksums. Installation and inference stay inside the extraction directory. No system-wide dependency is installed.

The current installer lives at `/downloads/v0.2.0-preview/windows.zip` and `/downloads/v0.2.0-preview/macos.zip`. Its version, size and SHA256 are recorded in `data/local-installer-release.json`. Setup details and platform validation limits are in `public/orca-local-v0.2-guide.txt` and inside the ZIP.

Keep the immutable `/downloads/v0.1.0-preview/windows.zip` R2 download route: the v0.2 installer extracts the supplied LaMAR model from it. The old manifest `data/local-download-release.json`, byte ranges and storage implementation remain intact. Do not replace that archive or remove the route while installers rely on it.

Windows x64 and Intel Mac remain preview platforms. Apple Silicon checks cover a real small model fixture and software tests; full species-scale performance and clean-machine compatibility are not claimed.

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
