# PUF Studio — iGEM RNA editing design software

PUF Studio designs PUF recognition modules upstream of a selected RNA C→U editing site. The interface keeps one recognition window fixed through TRM design, off-target review and report export.

[Open PUF Studio](https://puf-studio-igem.pdx12320.chatgpt.site)

## iGEM showcase

The Overview opens with a live RNA-to-TRM mapping and links to every workflow stage. Run example loads the synthetic 12R example and resets the module library and imported scores. The workbench includes transcript-ID search, exact-match / downstream-C filters, and export-readiness indicators. TSV export always contains all matches, independent of on-screen filters.

## Workflow

1. **Choose a window:** paste RNA/DNA or one FASTA record, enter a 1-based target C coordinate, and choose an 8–12 nt recognition window. The target lies at binding end +2–5 nt.
2. **Design TRMs:** select one TRM per repeat. R1 recognizes the RNA motif’s 3′ base. Gold ★ preference chips are visible in each repeat row and can be selected directly. They mark native-matrix support for that repeat and RNA base. The selector retains all published candidates.
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

## References (APA 7)

GENCODE. (n.d.). *Human release 50 (GRCh38.p14)*. Retrieved September 2, 2026, from [https://www.gencodegenes.org/human/](https://www.gencodegenes.org/human/)

Han, W., Yuan, B., Fan, X., Li, W., Yuan, Y., Zhang, Y., Wang, S., Shan, S., Hafner, M., Wang, Z., & Qiu, Z. (2025). Effective in vivo RNA base editing via engineered cytidine deaminase APOBECs fused with PUF proteins. *Nature Communications, 16*, Article 9727. [https://doi.org/10.1038/s41467-025-64748-6](https://doi.org/10.1038/s41467-025-64748-6)

pdx12320. (n.d.). *PUF_fine_tuning_version1* [Computer software]. GitHub. [https://github.com/pdx12320/PUF_fine_tuning_version1](https://github.com/pdx12320/PUF_fine_tuning_version1)

Wang, X., McLachlan, J., Zamore, P. D., & Hall, T. M. T. (2002a). *Crystal structure of the Pumilio-homology domain from human Pumilio1 in complex with NRE2-10 RNA* [Data set]. RCSB Protein Data Bank. [https://doi.org/10.2210/pdb1M8Y/pdb](https://doi.org/10.2210/pdb1M8Y/pdb)

Wang, X., McLachlan, J., Zamore, P. D., & Hall, T. M. T. (2002b). Modular recognition of RNA by a human Pumilio-homology domain. *Cell, 110*(4), 501–512. [https://doi.org/10.1016/S0092-8674(02)00873-5](https://doi.org/10.1016/S0092-8674(02)00873-5)

Zhou, W., Melamed, D., Banyai, G., Meyer, C., Tuschl, T., Wickens, M., Cao, J., & Fields, S. (2021). Expanding the binding specificity for RNA recognition by a PUF domain. *Nature Communications, 12*, Article 5107. [https://doi.org/10.1038/s41467-021-25433-6](https://doi.org/10.1038/s41467-021-25433-6)
