# PUF Studio implementation guide

## Workflow and coordinates

1. Choose a target cytidine using a 1-based transcript coordinate p, recognition length L (8–12 nt), and an eligible interval.
2. For downstream offset d in {2, 3, 4, 5}, start = p − d − L + 1 and end = p − d. The first base after the binding interval is +1.
3. Assign a native source repeat R1–R8 to each physical position P, then select its TRM. P1 pairs with the 3′ end of the recognition window.
4. Assess matching structural evidence and screen similar transcript windows. Export the design and evidence together.

All C sites at binding end +2–5 are retained. Changing repeat sources or TRMs does not change the selected RNA window.

## Sequence assembly and preferences

The native 8R matrix uses repeat residues 12, 13 and 16. Every TRM in the selected source-repeat/base cell receives one preference star. Empty cells contain no reported highly base-specific code; stars do not quantify affinity. The team reports validation of matrix transfer to 8–12R constructs.

The supplied WT12 source order is [1, 2, 3, 5, 6, 7, 5, 6, 7, 6, 7, 8]. Assembly preserves caps, position-specific cores and the seven-residue insertion after the penultimate repeat. Built-in complete scaffolds cover 8R and 12R. Other lengths need a compatible custom scaffold for full protein export.

## Structural classifiers

See [Model integration methods](structural-models-methods.md) for frozen weights, feature definitions, input identity checks and validation. The website pins PUF_alphafold commit 70385e9b8cf7e4a01d261312c638ba39d413d5dc.

The classifiers require the exact tagged 519-aa construct and a 15-nt RNA. Analysis removes the first seven protein tokens. A 492-aa structure cannot be padded into this input. New sequence designs need matching AF3 evidence; source-repeat permutations fall outside the fixed-backbone classifiers. Structural confidence is not a stability or functional-success measurement.

## Reference and LAMAR contract

Local reference FASTA is limited to 25,000 nt. Similar windows are ungapped matches with at most two mismatches. Only the exact target locus is excluded; other loci remain distinct.

Whole-transcriptome analysis requires a versioned full-transcript FASTA including UTRs, matching annotation, an assembly and release identifier, and reference checksum. A server can provide standard references once, with custom uploads optional.

LAMAR consumes 101-nt transcript-oriented RNA contexts centered on C at index 50. Insufficient flanks remain missing. The inference service must use the tokenizer convention and context domain of its training pipeline. The website includes an HTTPS job adapter; the hosted model service remains pending.

Prediction import uses:

```json
{
  "modelVersion": "your-frozen-version",
  "referenceSet": "your-fixed-ranking-population",
  "scoreType": "ranking_score",
  "predictions": []
}
```

Each prediction is `{ "context": "101-nt RNA centered on C", "score": 0.5 }`, where the score must be an actual model output in [0, 1]. Duplicate RNA contexts can share scores while retaining every locus mapping. Keep the ranking population fixed across design comparisons. Missing values remain unavailable; actual zero values remain zero.

PUF sequence and TRMs are not LAMAR inputs. Identical RNA contexts retain identical model scores after protein changes. Rank scores are not calibrated editing or binding fractions.

## Reproducible exports

The offline HTML Design Report includes coordinates, P/R/TRM assignments, protein sequence when complete, matching structural evidence, bystanders and off-target rankings. Raw JSON preserves complete data; TSV exports similar-site mappings. Project files retain the library, repeat order, TRMs, references, model results, AF3 evidence and experimental records. Restoring a project validates its content.

## References

Han, W., Yuan, B., Fan, X., Li, W., Yuan, Y., Zhang, Y., Wang, S., Shan, S., Hafner, M., Wang, Z., & Qiu, Z. (2025). Effective in vivo RNA base editing via engineered cytidine deaminase APOBECs fused with PUF proteins. *Nature Communications, 16*, Article 9727. https://doi.org/10.1038/s41467-025-64748-6

pdx12320. (2026). *PUF AlphaFold CP analysis: Three-site dynamic-threshold classification* (Commit 70385e9) [Computer software and data]. GitHub. https://github.com/pdx12320/PUF_alphafold/tree/70385e9b8cf7e4a01d261312c638ba39d413d5dc/dynamic_classification

Wang, X., McLachlan, J., Zamore, P. D., & Hall, T. M. T. (2002). Modular recognition of RNA by a human Pumilio-homology domain. *Cell, 110*(4), 501–512. https://doi.org/10.1016/S0092-8674(02)00873-5

Zhou, W., Melamed, D., Banyai, G., Meyer, C., Tuschl, T., Wickens, M., Cao, J., & Fields, S. (2021). Expanding the binding specificity for RNA recognition by a PUF domain. *Nature Communications, 12*, Article 5107. https://doi.org/10.1038/s41467-021-25433-6
