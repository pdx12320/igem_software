# LAMAR service adapter v1

PUF Studio accepts a team-owned HTTPS base URL. Requests originate in the user's browser and use no cookies or embedded credentials. Configure CORS for the deployed PUF Studio origin. Do not put secrets in the URL. An authentication gateway can be added when the production service is supplied.

GET /references -> {"references":[{"id":"versioned-reference-id","name":"Human transcriptome release ..."}]}

POST /jobs -> request:
{"referenceId":"versioned-reference-id","target":{"id":"transcript-id","sequence":"FULL_RNA_SEQUENCE","position":123,"motif":"RECOGNITION_MOTIF"},"scope":"whole-transcriptome","scoreType":"ranking_score"}

Response / GET /jobs/{id}:
{"id":"opaque-job-id","status":"queued","referenceId":"versioned-reference-id","message":"optional"}
Status values: queued, running, succeeded, failed. The UI displays actual states and supports manual refresh and resuming by ID. The server is responsible for durable jobs and reference validation. Validate the target coordinate, C identity, transcript mapping and reference release; do not infer full-transcriptome results from a uploaded short fragment.

GET /jobs/{id}/result -> existing PredictionSet:
{"modelVersion":"frozen-model-version","referenceSet":"fixed-ranking-population","scoreType":"ranking_score","predictions":[{"context":"101_NT_RNA_CENTERED_ON_C","score":0.5}]}

Example strings above are placeholders, not model results. Validate context length 101, center C and score 0–1. The server must use a fixed ranking population and record its version. These scores do not represent calibrated editing efficiency.

No LAMAR weights, reference transcriptome or inference server are bundled with the website. The adapter cannot perform full-transcriptome inference until a compatible service is connected.
