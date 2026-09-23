<div align="center">

# ORCA · SUSTech

### Programmable RNA editing.

Design PUF recognition modules, inspect sequence-bound evidence, and export a traceable RNA-editing design.

**[Open ORCA →](https://puf-studio-igem.pdx12320.chatgpt.site)**

[Quick start](#quick-start) · [Workflow](#workflow) · [Documentation](#documentation) · [Local development](#local-development)

</div>

---

## Quick start

1. **[Open the website](https://puf-studio-igem.pdx12320.chatgpt.site).** Watch the short introduction or choose **Skip intro**.
2. Scroll down on **Overview** and select the circular **Start** button.
3. In **Design workbench**, choose a target window, build PUF repeats, inspect off-target evidence, and export a report.

The website retains its existing access settings. GitHub access and website access are managed separately.

## Explore the application

| Page | What you can do |
| --- | --- |
| **Overview** | Enter through Start, or jump to a workflow stage. Rotating titles, changing colors and repeatable scroll reveals introduce the project. |
| **Design workbench** | Work through the four design stages; save and reopen projects. |
| **Examples** | Explore supplied C388, C295 and C871 cases and archived repeat architectures. |
| **Evidence & engineering** | Compare constructs and imported assay results; prepare fusion sequences and connect a LAMAR service. |
| **Methods & evidence** | Read coordinate rules, model scope, evidence and references. Page entry starts at the top. |

The RNA guide tracks page position; select the small cytosine structure below it to return to the top. Reduced-motion preferences are supported.

## Workflow

1. **Choose a window** — supply RNA/DNA or a FASTA record, a 1-based target C coordinate and an 8–12 nt recognition length.
2. **Build PUF** — assign source repeats and TRMs in Beginner or Advanced mode. Full protein assembly requires a matching scaffold.
3. **LAMAR off-targets** — inspect similar binding windows and downstream cytidines; import real ranking scores or connect a compatible service.
4. **Review & export** — export the standalone Design Report, project JSON, protein FASTA and hit TSV.

## Capabilities and scope

- Local reference-subset screening and versioned TRM/scaffold data are included.
- Supplied examples, archived experimental measurements and imported results are distinguished in the application. The default workbench demonstration uses synthetic data.
- Structure assessment requires matching protein/RNA evidence. Site-specific classifiers retain their documented training scope and frozen thresholds.
- **A hosted whole-transcriptome LAMAR backend and its weights are not bundled.** Missing scores remain unavailable; no editing probability is fabricated.
- The opening illustration is a project narrative, not experimental evidence. Scientific methods, provenance and limitations are available in the application.

## Documentation

| Resource | Contents |
| --- | --- |
| [Implementation guide](public/implementation-handoff.md) | Coordinates, data contracts, reports and integration details |
| [Structural-model methods](public/structural-models-methods.md) | Model features, scope, validation and references |
| [LAMAR service contract](public/lamar-service-contract.md) | API contract for an external ranking service |
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

The latest UI update passed the production build and 34 core checks. Full TypeScript checking still requires the existing Cloudflare ambient types (`cloudflare:workers`, `Fetcher`, `D1Database`). Legacy starter checks are separate from the core suite above.

## Source map

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Page navigation, workflow, imports and exports |
| `components/intro-experience.tsx` | Intro timing, rotating titles and scroll reveals |
| `components/memory-scene.tsx` | SVG opening scene |
| `components/rna-scroll-guide.tsx` | RNA progress and cytosine return-to-top control |
| `components/intro-experience.css` | Landing animation and responsive styles |
| `lib/` | Sequence design, reports, project validation and model inference |
| `data/` | Versioned matrices, scaffolds, examples and model provenance |
| `public/` | Evidence files and integration documentation |
| `tests/` | Scientific and application checks |

React · TypeScript · Vinext/Vite · Cloudflare Workers
