# PUF Studio — iGEM RNA editing design software

PUF Studio designs PUF recognition modules upstream of a selected RNA C→U editing site. The interface keeps one recognition window fixed through TRM design, off-target review and report export.

[Open PUF Studio](https://puf-studio-igem.pdx12320.chatgpt.site)

## Workflow

1. **Choose a window:** paste RNA/DNA or one FASTA record, enter a 1-based target C coordinate, and choose an 8–12 nt recognition window. The target lies at binding end +2–5 nt.
2. **Design TRMs:** select one TRM per repeat. R1 recognizes the RNA motif’s 3′ base. A single ★ marks native-matrix support for that repeat and RNA base. Other published codes remain selectable.
3. **LAMAR off-targets:** inspect similar sequences and all downstream C sites at +2–5. Import actual LAMAR ranking scores for their 101-nt C-centered RNA contexts.
4. **Review & export:** download a standalone **Design Report.html**, print it to PDF, or export complete JSON, PUF FASTA and hit TSV.

The readable report contains the target/window diagram, selected TRMs with preference stars, full PUF protein when available, similar binding windows, local bystanders and scored background C sites. JSON retains the full analyzed data. Report HTML escapes user-supplied text and works offline.

## Implemented and pending

- Local reference search: ≤2 substitutions, RNA orientation, up to 25,000 nt of supplied reference and a bounded hit count.
- Built-in native 8R matrix and shared candidate codes for 8–12R. The project team confirmed experimental feasibility of this transfer scheme.
- 8R PUM1 reference scaffold: 349 aa. User-provided 12R scaffold: 492 aa; caps and all non-TRM residues are preserved.
- 9–11R TRM plans are available. Full protein assembly and repeat-specific stars require their matching scaffold/mapping.
- **LAMAR weights, GPU inference and the indexed whole-transcriptome backend are not connected yet.** The current integration imports model scores; no model results or binding/editing probabilities are fabricated.
- Example data are explicitly synthetic. Missing scores stay unavailable.

Scientific details, assumptions, matrix provenance and references are collected under **Methods & evidence** in the app and [implementation-handoff.md](public/implementation-handoff.md).

## Run locally

Use Node.js 22.13 or newer. The supplied build helper targets Linux; macOS users can run Vite/Vinext directly or use a Linux container.

```bash
npm ci
npm run dev
```

Build and serve:

```bash
npm run build
npm run start
```

Domain and report checks:

```bash
node --experimental-strip-types --test tests/design.test.mjs tests/report.test.mjs
```

Regenerate the bundled matrix/scaffold data from the included FASTA:

```bash
python3 scripts/build-puf-library.py
```

The application uses React, TypeScript, Vinext/Vite, Cloudflare Workers and vendored Shadcn UI components. `package-lock.json` fixes dependencies. The existing `.openai/hosting.json` identifies the deployed Sites project; local development needs no LAMAR credentials. Keep environment values outside version control.

## Source layout

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Four-step workbench and data import |
| `app/globals.css` | Workbench styles and responsive layout |
| `lib/design.ts` | Coordinates, sequence search, module plans and input validation |
| `lib/report.ts` | Standalone printable Design Report |
| `data/` | Extracted TRM matrix, reusable library and scaffold audit |
| `scripts/build-puf-library.py` | Reproducible data generation |
| `public/` | Downloadable evidence and integration handoff |
| `tests/design.test.mjs` | Scientific coordinate, scaffold and preference checks |
| `tests/report.test.mjs` | Report consistency, missing values and HTML escaping |

## LAMAR integration

Import JSON containing `modelVersion`, `referenceSet`, `scoreType: "ranking_score"` and `predictions: [{context, score}]`. Each context must be exactly 101 nt with C at index 50; scores must lie in [0,1]. Use a fixed ranking population across PUF designs. RNA-only model scores are independent of TRM choice.

A future backend should install a versioned full-transcript FASTA, including UTRs, with matching GTF/GFF3 annotation; normal users then select a reference. The planned API is documented in the handoff. Do not treat the browser subset screen as a whole-transcriptome result.

## References

- Zhou et al., 2021: [Native PUM1 TRM matrix, Figure 4](https://www.nature.com/articles/s41467-021-25433-6).
- Han et al., 2025: [CU-REWIRE editing window](https://www.nature.com/articles/s41467-025-64748-6).
- [PDB 1M8Y PUM1 sequence](https://www.rcsb.org/fasta/entry/1M8Y/display).
- [LAMAR fine-tuning repository](https://github.com/pdx12320/PUF_fine_tuning_version1).
