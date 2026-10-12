# Workflow model service deployment

The Work interface ranks PUF candidates locally with a passive numeric export of the supplied module 2 checkpoint. LaMAR uses same-origin `/api/workflow/*` endpoints: the Worker transports requests to a separately deployed service configured by the site administrator. The gateway does not run LaMAR or infer service readiness from the presence of a checkpoint.

The browser ranker needs no server or GPU. No LaMAR backend has been implemented, deployed, or configured by this change; its large checkpoints are not included in the web bundle. Remote health flags describe the separate service only, and do not control the built-in PUF ranker.

## Administrator configuration

Configure these bindings in the deployed Worker's environment:

| Binding | Purpose |
| --- | --- |
| `WORKFLOW_MODEL_URL` | Trusted HTTPS service base URL, optionally including a base path. No username, password, query, or fragment. |
| `WORKFLOW_MODEL_TOKEN` | Optional secret sent as `Authorization: Bearer …` to that service. Store as a platform secret, never in public frontend variables or Git. |

The browser neither chooses nor displays the upstream destination. Without a service URL, health returns HTTP 200 with `available: false`, both models false, and reason `Model service is not configured.` Inference endpoints return 503. Invalid administrator configuration also leaves readiness false.

Requests retain the existing Vinext application and image routes. All gateway responses use `Cache-Control: no-store`. Upstream redirects are rejected. Browser cookies, browser authorization, and arbitrary request headers are not forwarded; response cookies and internal headers are not returned. POST requires an `Origin` header exactly matching the application's origin. This origin check complements deployment access controls; it is not user authentication.

## HTTP contract

| Browser endpoint | Upstream endpoint | Request / response |
| --- | --- | --- |
| `GET /api/workflow/health` | `GET /health` | Strict health JSON described below. |
| `POST /api/workflow/rank` | `POST /rank` | JSON object containing the versioned design payload; model ranking JSON is validated by the client. |
| `POST /api/workflow/jobs` | `POST /jobs` | Multipart form with `metadata` JSON text and `fasta` File; return a job receipt promptly. |
| `GET /api/workflow/jobs/:id` | `GET /jobs/:id` | JSON job status for client polling. |
| `GET /api/workflow/jobs/:id/result` | `GET /jobs/:id/result` | Completed result JSON for validation and scientific CSV export. |

Job identifiers contain 1–128 ASCII letters, digits, underscores, or hyphens and start with a letter or digit. Query parameters and other paths or methods are rejected. Successful upstream responses must declare `application/json`. Error HTTP statuses are preserved with generic messages, without returning upstream error bodies, destinations, or tokens. POST is never retried automatically.

The health response is:

```json
{
  "available": false,
  "reason": "Required model assets have not been verified.",
  "models": { "esm2": false, "lamar": false }
}
```

`available`, `models.esm2`, and `models.lamar` must be actual booleans. `reason` is optional plain text of at most 500 characters. Unknown fields are discarded. The service owns the readiness decision and must report true only after verifying the appropriate implementation, model assets, input contract, and a bounded inference check. Invalid health data is returned as an unavailable 502 response.

JSON requests have a 2 MiB body cap. The browser permits a FASTA file of at most 100 MiB (104,857,600 bytes). The gateway's total multipart body cap is **100 MiB + 64 KiB** (104,923,136 bytes), allowing metadata, field headers, and boundaries in addition to the file. Both declared lengths and actual bytes are checked. Multipart bodies are streamed rather than collected into memory; overflow aborts the upstream request.

The upstream service **must separately enforce the 100 MiB FASTA-part limit**, verify its actual byte count against `reference.sizeBytes`, and limit the remaining metadata and multipart overhead to 64 KiB. The gateway does not parse individual multipart fields, so its total-body allowance is not permission to accept an oversized FASTA. Stage uploads and commit a job only after the complete multipart request has been validated, because an oversized or interrupted upload can be aborted after a prefix has arrived.

Health transport has a 15-second deadline; other requests have a 30-second deadline while sending the upload and awaiting response headers. Health parsing is included in its deadline. Computation runs as a service-side job, so polling requests do not hold a Worker connection open for the lifetime of an inference run. The service must also enforce its own upload validation, resource limits, job ownership, and retention policy.

## Built-in PUF ranking and result contract

`components/puf-ranking.tsx` runs `lib/puf-ranker-local.ts` in the browser using `data/puf-ranker-492.json`; it does not call the remote ranking endpoint. The optional gateway `POST /rank` route remains available for compatible services, using this payload:

```ts
type RankRequest = {
  schemaVersion: 1;
  modelId: "module2-fixed492";
  candidates: Array<{ id: string; protein: string }>;
};
```

Submit 1–50 unique protein sequences and unique IDs. IDs match `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$`. Each ranked protein must contain exactly 492 uppercase standard amino acids representing substitutions in the fixed web scaffold coordinate system. The queue can store other lengths for design review, but they cannot be ranked. Protein FASTA imports with exactly 493 residues and a terminal G are normalized to 492 residues with a notice; this is the only deletion performed. Other alignments or insertions/deletions are unsupported; equal length alone cannot establish biological alignment. Candidate display labels and the target RNA are not model features.

The JSON response and imported ranking result share this payload:

```ts
type RankResponse = {
  schemaVersion: 1;
  modelId: "module2-fixed492";
  modelVersion: string;
  referenceSha256: "2b981a33277b03de9a6542f27baf6c56626ec3f21c774f017cb5880ac05b32f9";
  sourceCheckpointSha256: "c0fb39463be5468a2a20739a1838f4ed1a4405003b8914e71eec82984739c34e";
  compatibilityVersion: "drop-fixed-terminal-g-v1";
  scoreDefinition: "C388_hat - (C295_hat + C871_hat)/2";
  scope: "fixed-assay-C295-C388-C871";
  rows: Array<{
    id: string;
    protein: string;
    C295_hat: number;
    C388_hat: number;
    C871_hat: number;
    S_hat: number;
    ESM2_score: number;
  }>;
};
```

`modelVersion` is nonempty text of at most 200 characters. Return exactly one row for every submitted candidate, with its exact ID and full protein sequence. Every score must be finite. The client verifies `S_hat = C388_hat − C295_hat / 2 − C871_hat / 2` with a relative tolerance of `1e-9 × max(1, |calculated score|, |received S_hat|)`. It then assigns ordinal ranks by descending `S_hat`, breaking exact ties by ascending candidate ID, as in the supplied predictor. A returned `rank` does not override this ordering; `source` is assigned locally as `bundled`, `service` or `imported`. Scores are not clipped or converted to probabilities. `ESM2_score` remains separate from `S_hat` and the three assay predictions.

Imported ranking files are limited to 200,000 bytes. Keep rank payloads within that limit. These outputs concern the fixed C295/C388/C871 assays, not the editing probability of the RNA currently entered in the Work interface.

## Transcript analysis request and job lifecycle

The current service contract is implemented by `components/offtarget-workspace.tsx` and `lib/offtarget-workflow.ts`. `POST /jobs` receives exactly the client form fields `metadata` (JSON text) and `fasta` (the selected uncompressed file). The metadata object is:

```ts
type WorkflowTarget = {
  id: string;
  sequence: string;
  position: number;
  motif: string;
  bindingStart: number;
};

type OffTargetRequest = {
  schemaVersion: 1;
  requestId: string;
  modelId: "module4-lamar-101";
  target: WorkflowTarget;
  reference: {
    name: string;
    species: string;
    kind: "transcript";
    sha256: string;
    sizeBytes: number;
  };
  scoreType: "raw_ranking_score";
};
```

The browser creates a fresh UUID `requestId` per submission. `reference.sha256` is the lowercase SHA-256 of the **exact uploaded file bytes**, before any sequence normalization; the service must recompute it. `species` is the user's trimmed label (at most 200 characters), not an inferred taxonomy. `target.sequence` and `target.motif` are RNA strings; `target.position` is the target C position and `bindingStart` the selected motif start, both 1-based in the target sequence. Preserve and echo all five target fields exactly. The service must validate the full FASTA, including unique transcript IDs and its documented sequence alphabet, before starting inference. The browser's initial header check is not a substitute for full validation.

The creation endpoint should return a job receipt promptly, normally HTTP 202. `GET /jobs/:id` returns the same receipt shape:

```ts
type JobReceipt = {
  id: string;
  requestId: string;
  referenceSha256: string;
  status: "queued" | "running" | "succeeded" | "failed";
  message?: string;
};
```

`id` must match `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`. Echo the submitted `requestId` and reference checksum; polling must retain the same job ID. Optional messages must be nonempty text of at most 1,000 characters. The UI refreshes on **Check status** and requests `/jobs/:id/result` only after status becomes `succeeded`. It does not automatically resubmit failed POSTs. A browser operation being cancelled does not imply cancellation of a service-side job; no job-cancellation endpoint is implemented.

The completed result payload is:

```ts
type OffTargetResult = {
  schemaVersion: 1;
  jobId: string;
  requestId: string;
  modelId: "module4-lamar-101";
  modelVersion: string;
  referenceSha256: string;
  species: string;
  referenceKind: "transcript";
  scope: "uploaded-transcript-fasta";
  scoreType: "raw_ranking_score";
  target: WorkflowTarget;
  sites: Array<{
    transcript: string;
    position: number;
    context: string | null;
    score: number | null;
    bindingStart?: number;
    mismatches?: number;
    status: "scored" | "unscored" | "insufficient_context";
  }>;
};
```

`modelVersion` is nonempty text of at most 300 characters. The result must match the active job, request ID, exact target fields, species label, and uploaded-file checksum. Return at most 100,000 site rows; larger results require a service-side export outside this UI contract. Imported result JSON has a 40 MiB file limit and must match the currently selected FASTA and target. Identifiers are opaque strings; transcript names must be nonempty and at most 300 characters.

Site `position` is a positive, safe integer using 1-based transcript-record coordinates. Optional `bindingStart` uses the same coordinate convention, and optional `mismatches` is an integer from zero through the target motif length. A non-null `context` is exactly 101 uppercase RNA bases from `ACGU`, with C at the 51st base. A `scored` row requires both context and a finite score. Other statuses require `score: null`; `insufficient_context` also requires `context: null`. Preserve missing values as null, never zero. The tuple `(transcript, position, bindingStart or null)` must be unique, and identical scored contexts cannot have different scores in one result.

`raw_ranking_score` preserves the model's finite scalar output, including negative values. There is no `[0,1]` restriction, normalization, clipping, or probability conversion. This result is RNA-context prioritization; the metadata does not include a protein candidate, and the model is not conditioned on the newly designed PUF.

## Scientist export and legacy preview scope

**Download total CSV / Download scientist CSV** uses `lib/scientist-csv.ts` to combine the selected design, received PUF ranking rows, locally computed binding matches, and all validated service site rows. Separate `record_type` values identify `target`, `binding_site`, `binding_hit_no_c`, `external_site`, and `protein_candidate`. Raw `S_hat`, `ESM2_score`, and LaMAR scores have separate columns with model versions, scope, reference checksums, and coordinate conventions. Missing measurements remain empty; zero and negative scores remain numeric. The displayed site table shows at most 100 rows, while the CSV includes every received site row within the client contract.

The local sequence-match preview and its existing HTML/JSON/TSV reports concern the local reference subset. They do not prove that uploaded species-wide model inference ran and are not substitutes for the total CSV. The older **Data & models → LAMAR ranking evidence** import uses `PredictionSet` with `scoreType: "ranking_score"` and values in `[0,1]`; it is a distinct legacy interface. Do not put raw service scores into that older schema or reinterpret them as its bounded ranking score. The total CSV preserves `lamar_score_type` to distinguish the sources.

## Bringing a separate service online

1. Supply and review the missing LaMAR implementation and reproducible environment.
2. Deploy a separate HTTPS service implementing these endpoints, byte limits, strict provenance fields, and service-side job ownership. No such deployment is created by this repository change.
3. Verify health and one bounded, known input through that service, including exact input hashes and result schemas. Set each model readiness flag independently from those observed checks; absent or failing models remain false.
4. Configure `WORKFLOW_MODEL_URL` and optional secret `WORKFLOW_MODEL_TOKEN` on the website's Worker through its hosting administrator. Do not put either binding into client code. If the hosting environment cannot provide these bindings, leave the gateway unavailable.
5. Use the website's model-status refresh, submit the bounded fixture, retrieve its matching result, and inspect the scientist CSV. This verifies transport and export; it does not establish experimental performance or cross-species validity.

## Supplied asset gaps

The supplied module 4 package includes approximately 346 MB safetensors checkpoints and evaluation scripts, but no `LAMAR.sequence_classification_patch` implementation or reproducible dependency lock. Evaluator paths point at `output/` directories that do not match the supplied checkpoint layout. The existing evaluators consume labeled CSV or JSON fixtures; they do not provide a FASTA-serving API or the combined job contract above. The web gateway does not fill in or replace these missing scientific implementations.

The supplied LaMAR documents describe human transcript adaptation and PUF12-associated editing evidence. They do not establish cross-species validity or prediction conditioned on a newly designed PUF. A species FASTA should contain transcript-oriented sequences under the model owner's documented input contract; genomic FASTA is not interchangeable with transcript FASTA. Report resulting sites as candidates for experimental assessment and preserve model provenance and coordinate conventions. Ranking scores are not calibrated probabilities of off-target editing.

## Approved 492-aa normalization

Module 2's original reference has 493 aa (SHA-256 `62851bee43beb3484bec54ab7b5d0e78f2aea96cf6dd452d6f2ee65eec843142`). Its first 492 residues exactly match the web PUF12 scaffold (SHA-256 `2b981a33277b03de9a6542f27baf6c56626ec3f21c774f017cb5880ac05b32f9`); the extra final residue is G. The user approved removing that extra residue to unify the input representation.

`scripts/export-puf-ranker.py` checks the source checkpoint SHA-256 before parsing its numeric data with a restricted, passive pickle-opcode interpreter. It never unpickles objects or executes archived Python, sklearn, joblib or NumPy constructors. It removes the final 20 one-hot columns and the final cached score row. All 60 removed Ridge coefficients are exactly zero. All other coefficients, standardization parameters, intercepts and cached log probabilities remain frozen.

The adapter uses the first 492 rows of the original 493-aa ESM-2 cache. It does not recompute ESM-2 for a deleted-residue protein, retrain a model or establish new experimental validity. For 492-aa substitution variants, its predictions reproduce the original predictor evaluated on the same variant with the fixed terminal G appended. The three supplied example predictions reproduce with zero absolute error in the passive Python audit; JavaScript golden checks cover the same examples and fixed-coordinate boundary mutations. The model is a cached ESM-2 + one-hot Ridge specificity ranker for C295/C388/C871, not a live general RNA editing predictor.

Source checkpoint: `PUF_ESM_Specificity_Ranker.joblib`, SHA-256 `c0fb39463be5468a2a20739a1838f4ed1a4405003b8914e71eec82984739c34e`. Export compatibility version: `drop-fixed-terminal-g-v1`. Original archives and model files remain unchanged; the CSV records the checkpoint and compatibility version.


## Validation performed in this repository

The 108 focused checks listed in the README passed, including core design invariants, archived PUF golden predictions, result/reference binding, project restoration, raw-score CSV export and gateway transport. The final production build passed (with the existing large-chunk warning). Scoped ESLint passed for the new modules and modified intro component; `app/page.tsx` retains existing navigation/static-component lint findings. Full TypeScript checking remains blocked by the repository's missing Cloudflare ambient types (`cloudflare:workers`, `Fetcher`, `D1Database`); the previous intro timer error was fixed.

Browser checks verified local 492-aa scoring, candidate persistence across workflow tabs, the report counts, and absence of the opening overlay/inert gate after reload. The synthetic FASTA upload and subset preview passed. The CSV serializer is covered by tests, but the in-app browser did not expose a download event for its Blob export, so actual browser file delivery remains unconfirmed. No LaMAR inference, public deployment, commit or push was performed.

`node --test tests/workflow-service.test.mjs` exercises the transport in isolation with injected service responses: unavailable state, strict health parsing, origin checks, URL restrictions, credential isolation, endpoint mapping, request byte limits, streaming multipart forwarding, timeout cancellation, and generic errors. These tests do not load a checkpoint or validate any biological predictions. Real model deployment and a bounded end-to-end inference check remain separate prerequisites for a ready service.

### Interrupted submissions

The service must implement `requestId` idempotency: a repeat submission with the same request ID and exact payload returns the original job; conflicting reuse returns an error. After an interrupted submission, the client retains the request and exposes **Resume submission** with that same ID. Selecting the same FASTA checksum preserves matching saved receipts/results. Starting a new completed or failed job creates a fresh request ID.

Returned locus rows are also checked in the browser against the streamed uploaded FASTA: every transcript must exist, coordinates must identify C, 101-nt contexts must match exactly, and supplied binding intervals/mismatch counts must agree. A project restores saved evidence and provenance but contains no live File. Saved site scores remain inactive until the original FASTA is reselected and every saved site is verified against it. Opening another project cancels pending UI operations, even when its RNA target is identical.
