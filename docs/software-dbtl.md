# Software Design–Build–Test–Learn

ORCA turns the team's RNA-editing design workflow and supplied model outputs into an accessible, traceable workbench. It supports the team's Best Model work by helping users prepare designs, inspect scores and export evidence for further analysis.

This record describes **software engineering iterations**, separate from the model-training cycles. It covers the implementation in [commit a6d82f9](https://github.com/pdx12320/igem_software/commit/a6d82f9793284b1dace25bf3ef15c0dcf38ce84f), subsequently merged into `main`. Validation and development feedback were recorded on **12 October 2026**. Planned activities are identified separately below.

## Cycle 1 — Connect design steps in one workbench

### Design

Users needed to move from a target RNA to a PUF design and a usable result file without manually transferring sequences between separate tools. The workflow also needed to preserve the relationship between the target, recognition window and assembled protein.

### Build

We organized Work into four steps: **RNA → PUF → Off-targets → Export**. The interface accepts a target sequence and coordinate, supports recognition-window selection and repeat/TRM assignment, and stores candidate protein snapshots. Applying edited inputs updates the design; draft changes cannot silently become the basis for downstream saved results.

The workbench retains the existing coordinate conventions and scaffold constraints. Choosing a recognition length does not imply that a compatible full scaffold or scoring model exists for that length.

### Test

[Design checks](../tests/design.test.mjs) cover editing offsets, antiparallel repeat mapping, invalid inputs and unsupported scaffold availability. [Project checks](../tests/project.test.mjs) verify the supplied C388 example's local coordinates and reject invalid coordinates or TRMs during restoration.

### Learn

A sequence design and its supporting evidence must remain linked throughout the workflow. This led to stricter candidate, reference and result contracts in the following iterations. Passing a coordinate or assembly check establishes implementation consistency; it does not establish editing activity.

## Cycle 2 — Make PUF ranking runnable and preserve its scope

### Design

The web workbench used a 492-aa scaffold, while the supplied ranking model used a 493-aa representation containing a fixed terminal G. Users also needed to rank compatible candidates without installing a Python environment or providing a model-server address.

### Build

We exported the supplied trained predictor into [passive numeric model data](../data/puf-ranker-492.json) and implemented a [browser scorer](../lib/puf-ranker-local.ts). The conversion retains the frozen coefficients, calibration and cached ESM-2 reference features. It neither retrains the model nor recomputes ESM-2 embeddings.

The compatibility rule is explicit: a 493-aa imported protein ending in G can be normalized to 492 aa, with its original sequence and normalization provenance retained. Other lengths or insertion/deletion mappings are not accepted by this ranker. Equal length alone cannot establish biological alignment to the reference scaffold.

### Test

[Numerical regression tests](../tests/puf-ranker-local.test.mjs) reproduce all five score fields and the rankings of three archived prediction examples: `10_p1_gvd`, `11_p1_sne` and `12_p1_sre`. The absolute score tolerance is `1e-12`. WT, boundary-position and multiple-substitution arithmetic cases are also compared with the original full-coordinate formula.

[Ranking-contract tests](../tests/puf-ranking.test.mjs) reject mismatched sequences, provenance and nonfinite scores, and check the restricted terminal-G normalization. The [golden fixture](../tests/fixtures/puf-ranker-golden.json) records the expected values and source hashes.

### Learn

The browser implementation can reproduce the supplied predictor within its documented coordinate system. This is **numerical compatibility**, not experimental validation of a residue deletion or evidence of generalization to new RNA targets. Ranking remains specific to the fixed C295/C388/C871 assay system; the RNA entered in Work is not a feature of this predictor.

## Cycle 3 — Separate LaMAR inference from local sequence screening

### Design

Users wanted to upload a species transcript FASTA and inspect possible off-target sites. A local similarity search, an imported score and an actual model inference run needed distinct meanings. Results also had to remain attached to the exact target and reference that produced them.

### Build

We added the [LaMAR workspace](../components/offtarget-workspace.tsx), a same-origin [service gateway](../lib/workflow-service.ts), job/result contracts and [reference-site verification](../lib/reference-sites.ts). Results are checked against the target RNA, species, reference checksum, request and job. Reported transcript IDs, C coordinates and supplied contexts are verified against the selected FASTA.

The service route accepts transcript FASTA uploads up to its documented limit. A separate local preview remains limited to 25,000 nt. An unconfigured service reports unavailable; it does not fabricate model scores.

### Test

[Workflow tests](../tests/offtarget-workflow.test.mjs) reject mismatched or stale results and keep missing scores distinct from zero. [FASTA tests](../tests/reference-sites.test.mjs) cover duplicate IDs, invalid bases, incorrect coordinates, invented context flanks, chunk boundaries and cancellation. [Gateway tests](../tests/workflow-service.test.mjs) exercise upload limits, timeouts, route validation and unavailable-service behavior using simulated upstream responses.

### Learn

Checkpoint files alone do not provide a working inference service. The supplied LaMAR assets still lack a required implementation component and a reproducible inference environment. **The interface and contracts are implemented; a real LaMAR inference run has not been demonstrated by this integration.** Remaining requirements are documented in the [deployment guide](model-service-deployment.md).

LaMAR's RNA-context score is independent of PUF identity. It must not be described as a calibrated off-target probability for a newly designed PUF. Reference verification also cannot establish that every possible off-target site was returned.

## Cycle 4 — Export evidence without losing its meaning

### Design

A scientist needs more than a ranked table: each result must retain its input, coordinate convention, model scope and source. Missing values must not become zeros, and scores from different models must not be combined into an unsupported probability.

### Build

We implemented a [combined CSV exporter](../lib/scientist-csv.ts) and [workflow persistence](../lib/workflow-project.ts). The CSV retains candidate proteins, target and site coordinates, separate PUF/ESM-2/LaMAR outputs, reference and model provenance, and missing-score status. Project files preserve design state and normalization provenance. Restored site evidence remains inactive until the original FASTA is reselected and verified.

### Test

[CSV tests](../tests/scientist-csv.test.mjs) cover true zeros, missing values, unrounded raw scores, exact-locus matching, stale evidence, quoting and spreadsheet formula protection. [Persistence tests](../tests/workflow-project.test.mjs) check round-trips, reject inconsistent metadata and ensure that a saved project cannot restore a live file handle or silently reactivate stale site evidence.

### Learn

Traceability is part of the result, not an optional report decoration. Raw model values, local sequence matches and imported evidence now remain distinguishable in the handoff. These checks validate data handling and serialization; they do not establish prediction accuracy or probability calibration.

## Cycle 5 — Refine the interface from development feedback

### Design

Development feedback requested an English-only interface, fewer explanatory sentences, immediate access without an opening overlay, and preservation of the original Overview content. Work needed to emphasize inputs, actions and results while keeping methods accessible.

### Build

We shortened Work and Methods labels, removed repeated copy and moved detailed methods, provenance and secondary export options into expandable sections. The opening overlay was removed while the original Overview title treatment and workflow cards were retained.

Restoring Overview exposed a navigation regression: labels changed when moving between pages. We fixed the shared navigation to **Overview / Work / Methods** and applied consistent navigation styles across all three views.

### Test

Manual browser checks covered Overview, Work and Methods, the restored Overview content, compact workflow tabs and expandable sections. After the navigation fix, the sequence **Work → Methods → Overview → Work** retained the same navigation labels. A component-render check also verified those labels and exactly one active navigation item for each view. The production build passed.

### Learn

An overview page and a working interface can have different information density while sharing stable navigation. Development feedback improved the presentation, but these checks are **not a formal usability study**; independent user testing remains planned.

## Verification record

The implementation checkpoint above passed **108 focused automated tests** and the production build with Node.js **24.19.0**. The test set includes the existing design/project/report/architecture checks and the new workflow checks. It is not a claim that every legacy starter check or full TypeScript check is clean; the known Cloudflare ambient-type limitations are recorded in the [README](../README.md#local-development).

Run the same checks from the repository root after installing the locked dependencies:

```bash
node --test \
  tests/design.test.mjs \
  tests/project.test.mjs \
  tests/report.test.mjs \
  tests/architecture-models.test.mjs \
  tests/puf-ranking.test.mjs \
  tests/puf-ranker-local.test.mjs \
  tests/scientist-csv.test.mjs \
  tests/offtarget-workflow.test.mjs \
  tests/reference-sites.test.mjs \
  tests/workflow-project.test.mjs \
  tests/workflow-service.test.mjs

node scripts/run-bounded.mjs node_modules/.bin/vinext build
```

The archived prediction fixtures are regression references, not a newly collected independent biological validation set. Software correctness and reproducibility support the model's use; claims about predictive performance require separate model-validation evidence.

## Next iteration — planned, not completed

The next iteration focuses on reproducible use and community contribution rather than additional website features.

| Deliverable | Planned work | Completion evidence |
| --- | --- | --- |
| Tutorial video | Demonstrate a real example from input through score interpretation and export. | A new user can follow the video and reproduce the supplied example output. |
| Wiki documentation and data contribution | Explain the purpose, workflow and scope; publish a data template and submission channel. | Clear fields for sequences, experimental conditions, measurements, replicates and provenance, with a review and reuse-permission process. New submissions remain separate from frozen evaluation data. |
| Local LaMAR package | Resolve missing components, pin the environment/model versions and provide a small example with expected output and resource requirements. | Someone outside development runs the package in a clean documented environment and reproduces the example. |

The package's input must be explicit. A transcript-FASTA-to-LaMAR workflow predicts candidate-site scores. Processing raw RNA-seq FASTQ and detecting observed editing events is a separate, currently unimplemented workflow requiring its own analysis and validation. Neither the tutorial nor the package should present predicted candidates as experimentally confirmed off-target events.

The [current implementation guide](../public/implementation-handoff.md), [model-service contract](model-service-deployment.md) and [historical development notes](development-history.md) provide supporting detail. Model training and biological validation should remain documented separately from this software DBTL record.
