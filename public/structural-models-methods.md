# PUF_alphafold model integration handoff

Pinned repository commit: `70385e9b8cf7e4a01d261312c638ba39d413d5dc` (2026-09-08 dynamic three-site classification archive). All passive data came through the GitHub connector at this commit.

## Deliverables

- `trm-models.json`: Exact saved C388 LR coefficients/scaler and C871/C295 RF trees, WT protein–RNA CP references, endpoints/thresholds, validation. 148 KB.
- `trm-inference.ts`: Dependency-free browser TypeScript feature extraction, scope checking and inference. Requires JSON bundle passed as `PortableModels` (cast imported JSON because literal discriminants widen).
- `three-site-examples.json`: WT plus all 30 training mutants; full 519-aa sequence, 492-aa core, three exact RNA inputs, measured editing means, two source experimental rows where present, WT differences, both LOOCV and position-group-out scores/decisions, frozen model refit scores/features and structure descriptors.
- `trm-golden-inputs.json`: Real sparse 512×15 CP input matrices for WT, P8-R6-GVE and P6-R7-MHQ, each at C388/C871/C295, with Python/sklearn expected scores/features.
- `architecture-examples.json`: 24 actual PUF12 architectures with source-repeat sequence order, per-position internal CP, 66 position-pair CP/PAE entries, and global CP/structure descriptors. Work labels and classifiers intentionally excluded.
- `source-provenance.json`, `source/`, `export_portable.py`: Provenance and reproducibility. Source joblib is only an intermediate; browser needs passive JSON and TS. `export_portable.py` uses a restricted unpickler permitting only the exact NumPy/joblib/sklearn estimator globals encountered, with no general pickle execution.

## Exact scope and model outputs

Training protein is 519 aa = `SGSETPGTSESATPES` + existing PUF Studio 492-aa WT core + `GSRDYKDDDDK`. Analysis removes the first 7 protein tokens only; it retains 512 protein tokens. Existing 492-aa AF3 structures cannot be padded or treated as compatible. Export/fold the exact tagged 519-aa sequence, then upload its original full_data JSON with CP matrix, alongside matching request/CIF to verify identities.

The 30 mutants include P4, P5, P6, P7, P8 and P4+P7 mutation groups. All actual sequence changes occur in original TRM residues 12,13,16. `checkModelScope` accepts the identical tagged backbone with TRM substitutions; changes outside TRM positions are rejected. Its return reports `mutatedRepeatPositions`, `observedPositionGroup`, and a scope description. New combinations at other TRM positions remain explicit extrapolation. Presence within a training mutation group does not validate a new sequence. A changed repeat-source architecture stays structural-analysis-only for these models.

Three 15-nt RNAs:

| Site | Exact RNA | High-activity label | Frozen model score threshold |
|---|---|---:|---:|
| C388 | ACAUGGAGGACGUGC | editing ≥30% | ≥0.4682696089565967 |
| C871 | UGGUGGAAGACAUGC | editing ≥45% | ≥0.5556631220530238 |
| C295 | CGGAACUGGAGGAAC | editing ≥12.83675% | ≥0.626326878495358 |

These are uncalibrated high-activity classifier scores, not predicted editing percentages or binding probabilities. The frozen score thresholds were selected from full-cohort OOF scores. The saved `heldOut` records use the separately selected training-fold threshold for each held-out construct; use each record's `prediction` or compare `score >= score_threshold`, never apply the deployment threshold to those validation records.

## Inference

`predictPR(bundle, site, seedPR)` accepts a list of independent seed-level 512×15 PR matrices. Source CP matrices were identical across the five models within each seed; count each seed once. Source features were computed per seed then averaged equally before predicting. Averaging all seeds into one matrix first changes nonlinear Top20, maxima, coverage and Top3 features.

`extractAF3PR(bundle, fullData, protein, rna)` validates exact chain/token dimensions (A519+B15), values in [0,1], and optional consecutive token IDs. It extracts protein tokens 8–519 and all RNA tokens. The caller must independently validate that the paired request/CIF actually contains the supplied protein and RNA. Do not allow callers to claim the WT sequence for arbitrary uploaded matrices. Uploads without sequence provenance should be clearly separate unverified feature imports and must not be represented as current-design predictions.

C388 `Interface_CP_LR`:

1. For each seed PR matrix calculate: total CP, total/15, mean largest 20 individual cells, mean per-RNA maximum, minimum per-RNA maximum, fraction RNA positions whose maximum >0.5, fraction protein residues whose maximum >0.5, count cells >0.5 divided by15.
2. Average each feature over independent seeds, subtract matching WT feature (stored).
3. Standardize with exported mean/scale, calculate intercept + coefficient dot product, apply logistic sigmoid.

C871/C295 `ContactSeek_CCR_RF`:

1. RNA regions are 1–5,6–10,11–15 (Python slices0:5,5:10,10:15).
2. Per protein residue, take the top three individual contact probabilities in descending order for each RNA region, rounded to4decimals. This yields9 values.
3. For each RNA region, take max(mutant)-max(WT), with maxima rounded to4decimals before subtraction and the difference also rounded to4decimals. This adds3 values, yielding12 per residue.
4. Average these arrays equally over seeds. For each exported CCR, average over its residue indices. Concatenate12 features per CCR in stored order. CCR indices are 0-based after trimming7 protein tokens.
5. Each RF tree branches on float32-cast features (`Math.fround(x) <= threshold`), yields its stored high-class leaf proportion, and trees are averaged. Trees are100, maximumdepth2, minimumleaf3.

The TS port matches original sklearn for all93 saved feature vectors and9 real CP cases. Maximum score error3.33e-16; maximum feature error2.13e-14. Scope rejection tested for492-aa input, changed flanks and wrongRNA.

## Example display recommendations

Show measured editing % with the two source rows and WT delta, next to the selected held-out score/class. Default to position-group-out because it addresses repeat-position transfer. A model's current full-training refit score is available for a reproducibility demo, but label it as training refit and never use it to claim validation.

WT was excluded from TRM model training and has no held-out score. Its measured rates are C38872.561%, C87167.5015%, C29532.958%. WT model scores are reference extrapolation only.

P8-R6-GVE illustrates both biological improvement and model error: measured C38865.8565%, C87110.2275%, C29525.223%. C871 held-out score≈0.691 classifies high activity despite the low experimental rate. Display that disagreement; do not cherry-pick only correct examples.

Validation (training-only score thresholds, with exploratory endpoint/model selection bias):

| Site | LOOCV BA | Position-group-out BA | Position-group-out AUC |
|---|---:|---:|---:|
| C388 |0.760|0.780|0.744|
| C871 |0.7851|0.7941|0.8145|
| C295 |0.825|0.525|0.4725|

C295 weak cross-position transfer needs visible evidence context. The cohort-selected class cutoffs are exploratory cohort cutoffs, not precise biological boundaries. Some source zero edits denote missing C-to-T records; source reports retain them, with no exclusion sensitivity analysis. Retain this note in Methods.

## Architecture descriptors

No structure-stability model exists in the repository. Its historical architecture RF predicts construct success/failure; do not display or relabel those scores.

Repository-supported structural descriptors can be computed from actual AF3 CP/PAE/confidence without running the success classifier. S4/S12/S24 count upper-triangular protein pairs with sequence separation≥4/12/24 and CP>0.5, divided by analyzed protein length. Internal repeat CP sums upper-triangular within-repeat contacts with separation≥4 then divides by36. Position-pair mean CP and mean symmetrized PAE exclude sequence separation<4. Compare whole structures using consistent protein analysis scope; all24 reference constructs share leading R123, so source-repeat effects are confounded by architecture.

## APA citations for Methods

pdx12320. (2026). *PUF AlphaFold CP analysis: Three-site dynamic-threshold classification* (Commit70385e9) [Computer software and data]. GitHub. https://github.com/pdx12320/PUF_alphafold/tree/70385e9b8cf7e4a01d261312c638ba39d413d5dc/dynamic_classification

pdx12320. (2026). *PUF architecture validation* (Commit70385e9) [Computer software and data]. GitHub. https://github.com/pdx12320/PUF_alphafold/tree/70385e9b8cf7e4a01d261312c638ba39d413d5dc/architecture_validation

ContactSeek source attribution should use repository-preserved provenance (`dynamic_classification/source_provenance.json`); add the paper only after verifying its bibliographic metadata. Do not fabricate author/date for the external source.
