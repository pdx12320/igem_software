# Methods & Evidence source audit

Checked September 24, 2026. This is a documentation audit, not new experimental validation.

## Source checks

- Han et al. (2025): publisher article and Crossref metadata checked for authors, title, volume, article number and DOI. The editing-window statements correspond to the article's editing-window results and Figure 4. The publisher links an author correction, DOI `10.1038/s41467-026-76669-z`; its authors, year, volume and article number were checked against Crossref. The correction's full text was not retrievable in this session, so no claim is made about its effect on the results.
- Zhou et al. (2021): publisher article and Crossref metadata checked. Residues 12, 13 and 16 and the native-repeat matrix are the relevant evidence. Publisher correction `10.1038/s41467-022-31463-5` is included; correction metadata were checked against Crossref, without asserting a full-text assessment of that notice.
- Wang et al. (2002): article metadata checked against Crossref and RCSB. The RCSB 1M8Y entry API confirms the four deposit authors. Dataset and article retain separate APA year suffixes, ordered by title.
- Rego and Koes (2015): 3Dmol.js's own documentation requests this paper as the software citation. It replaces an undated homepage citation.
- GENCODE: the official human release page identifies release 50 and GRCh38.p14. The citation points to the release-specific page, rather than the changing latest-release landing page. No reference transcriptome was changed or added to the software.
- AlphaFold Server: retained the official guides link as documentation, separate from the team's parsing and inference implementation.
- Team structural models: GitHub confirms pinned commit `70385e9b8cf7e4a01d261312c638ba39d413d5dc` dated September 8, 2026. Existing model provenance and integration documentation were inspected. No weights, thresholds, labels, cohorts or metrics changed.
- LAMAR integration: the project's README confirms 101-nt, transcript-oriented, sequence-only inputs centered on C. The citation identifies a software repository, not an installed or independently validated hosted service.

## Editorial conventions

Use author–date in-text citations, alphabetical references, sentence-case article titles, italic journal titles and volumes, and DOI URLs. Identify software and datasets explicitly. Distinguish team-reported transfer evidence from published native-repeat results. The website does not supply linked validation data for every repeat permutation.

PUF = Pumilio and FBF family RNA-binding domain; P = physical protein position; R = native repeat source; TRM = tripartite recognition motif; WT = wild type. Existing assay summaries use the sample SD and imported record counts, without statistical significance testing.

## Navigation and scope

Methods and engineering tools share one page. The Examples navigation and route are removed; underlying scientific archives remain preserved. The tutorial is explicitly pending because no video was supplied. Project save/open controls remain available on the merged page.
