# Test Design & Algorithms Plan

Goal: add deterministic (non-AI) test-design algorithms to TestAuthoring Studio, surface them in a new **Test Design** page and in the Gherkin editor, and let every algorithm be switched on or off in **Settings → Algorithms** (each row has a tooltip explaining it).

Libraries researched (2026-10): **covertable** (TypeScript pairwise generator, Apache-2.0) is used as an extra generator. **graphology/graphlib** (graphs), **talisman/natural** (string metrics, phonetics, stemming) and **pict-node** (needs the PICT binary) were considered; the studio keeps small hand-written, unit-tested implementations instead so every algorithm runs in the browser with no native binary and can be switched off individually. Research references: IPOG (Lei, Kacker, Kuhn et al., NIST), AETG (Cohen et al.), test-suite minimization with greedy set cover / HGS, prioritization (Rothermel et al. additional greedy; Jiang et al. ART; APFD), flaky-test flip rate & entropy (Kowalczyk et al.), BDD duplicate-step detection (cukereuse, 2026; Binamungu et al.), prime-path coverage (Ammann & Offutt).

Architecture:
- `src/algorithms/*.ts` — pure, unit-tested TypeScript modules (no React).
- `src/algorithms/registry.ts` — one entry per algorithm: `id`, `name`, `category`, `tooltip`, `defaultEnabled`.
- `prefs.algorithms` — `Record<id, boolean>` overrides, read with `useAlgorithm(id)` / `isAlgorithmEnabled(id)`.
- `src/TestDesign.tsx` — the Test Design page (tools: Examples generator, Flow generator, Step library, Suite optimizer, Duplicates & smells, Flaky analysis, Plans & filters, Living docs, Text lab).
- `GET /api/design/corpus` — all features (with steps/tags) and bindings for the client-side tools.

Legend: `[x]` done · `[ ]` to do. Each feature group is committed and pushed when finished.

## Features

- [x] F1 Algorithm registry, `prefs.algorithms`, Settings → Algorithms section with switch + tooltip per algorithm, enable/disable all, per category
- [x] F2 Test Design page (Advanced ⋯ menu + command palette + deep link `#/test-design`)
- [x] F3 Combinatorial Examples generator (IPOG etc.) → Scenario Outline Examples table
- [x] F4 Step library: reusable steps with parameters, usage counts, rename-everywhere refactor preview
- [x] F5 Editor: trie autocomplete from the feature corpus, duplicate-step and smell lint
- [x] F6 Suite optimizer (greedy set cover over tags/requirements) and prioritization
- [x] F7 FSM flow → scenarios generator
- [x] F8 Tags, saved filters (tag expressions), test plans / cycles
- [x] F9 Living documentation export (HTML/Markdown) with pass/fail status from imported results
- [x] F10 Flaky analysis from imported JUnit / Cucumber JSON history

## Algorithms (94)

### A. Combinatorial design (16)
- [x] A1 `ipog` IPOG (t-way)
- [x] A2 `aetg` AETG
- [x] A3 `covertable` covertable (PICT-style)
- [x] A4 `cartesian` All combinations
- [x] A5 `each-choice` Each-choice
- [x] A6 `base-choice` Base-choice
- [x] A7 `random-sample` Seeded random sampling
- [x] A8 `bva` Boundary value analysis
- [x] A9 `equivalence` Equivalence partitioning
- [x] A10 `constraints` Constraint rules
- [x] A11 `seeds` Seed rows
- [x] A12 `tway-coverage` t-way coverage meter
- [x] A13 `orthogonal` Orthogonal arrays
- [x] A14 `decision-table` Decision tables
- [x] A15 `quine-mccluskey` Quine–McCluskey minimization
- [x] A16 `weighted-values` Weighted values

### B. String similarity (14)
- [x] B1 `levenshtein` Levenshtein ratio
- [x] B2 `damerau` Damerau–Levenshtein
- [x] B3 `jaro-winkler` Jaro–Winkler
- [x] B4 `lcs` Longest common subsequence
- [x] B5 `jaccard` Token Jaccard
- [x] B6 `dice` Sørensen–Dice
- [x] B7 `tfidf-cosine` TF-IDF cosine
- [x] B8 `ncd` Compression distance (NCD)
- [x] B9 `simhash` SimHash
- [x] B10 `minhash` MinHash + LSH
- [x] B11 `soundex` Soundex
- [x] B12 `metaphone` Metaphone
- [x] B13 `porter` Porter stemmer
- [x] B14 `ngram` Character n-grams

### C. Search & autocomplete (9)
- [x] C1 `trie` Prefix trie autocomplete
- [x] C2 `fuzzy` Fuzzy subsequence scoring
- [x] C3 `bm25` BM25 ranking
- [x] C4 `bktree` BK-tree "did you mean"
- [x] C5 `inverted-index` Inverted index
- [x] C6 `stopwords` Stop-word removal
- [x] C7 `synonyms` Synonym expansion
- [x] C8 `frecency` Frecency ranking
- [x] C9 `aho-corasick` Aho–Corasick highlighting

### D. Step library (9)
- [x] D1 `template-inference` Step template inference
- [x] D2 `param-types` Parameter type inference
- [x] D3 `union-find` Union-find clustering
- [x] D4 `hac` Hierarchical clustering
- [x] D5 `dbscan` DBSCAN
- [x] D6 `rename-refactor` Rename everywhere
- [x] D7 `cucumber-to-regex` Cucumber → regex
- [x] D8 `regex-to-cucumber` Regex → Cucumber
- [x] D9 `keyword-resolution` And/But resolution

### E. Model-based testing (14)
- [x] E1 `fsm-parse` State-machine model
- [x] E2 `bfs` BFS shortest path
- [x] E3 `simple-paths` All simple paths
- [x] E4 `state-coverage` State coverage
- [x] E5 `transition-coverage` Transition coverage
- [x] E6 `n-switch` N-switch coverage
- [x] E7 `prime-paths` Prime path coverage
- [x] E8 `chinese-postman` Chinese postman tour
- [x] E9 `hierholzer` Hierholzer Euler circuit
- [x] E10 `dijkstra` Dijkstra weighted path
- [x] E11 `tarjan` Tarjan SCC
- [x] E12 `kahn` Kahn topological sort
- [x] E13 `reachability` Reachability / dead states
- [x] E14 `random-walk` Random walks

### F. Suite optimization (10)
- [x] F1 `greedy-set-cover` Greedy set cover
- [x] F2 `weighted-set-cover` Weighted set cover
- [x] F3 `hgs` Harrold–Gupta–Soffa
- [x] F4 `exact-cover` Exact minimum (branch and bound)
- [x] F5 `simulated-annealing` Simulated annealing
- [x] F6 `genetic` Genetic algorithm
- [x] F7 `total-greedy` Total-greedy prioritization
- [x] F8 `additional-greedy` Additional-greedy prioritization
- [x] F9 `art` Adaptive random prioritization
- [x] F10 `apfd` APFD metric

### G. Results & flakiness (8)
- [x] G1 `junit-parse` JUnit XML import
- [x] G2 `cucumber-json` Cucumber JSON import
- [x] G3 `flip-rate` Flip rate
- [x] G4 `entropy` Outcome entropy
- [x] G5 `flaky-score` Flakiness score
- [x] G6 `wilson` Wilson interval
- [x] G7 `ewma` EWMA trend
- [x] G8 `beta-posterior` Bayesian failure rate

### H. Gherkin quality (10)
- [x] H1 `smell-missing-then` Scenario without Then
- [x] H2 `smell-long` Long scenario
- [x] H3 `smell-conjunction` Conjunction step
- [x] H4 `smell-imperative` Imperative UI detail
- [x] H5 `smell-order` Keyword order
- [x] H6 `smell-outline` Outline/Examples mismatch
- [x] H7 `scenario-fingerprint` Duplicate scenarios
- [x] H8 `smell-dup-names` Duplicate scenario names
- [x] H9 `flesch` Flesch reading ease
- [x] H10 `duplicate-step-lint` Near-duplicate step lint

### I. Tags, plans & docs (4)
- [x] I1 `tag-expression` Tag expressions
- [x] I2 `tag-cooccurrence` Tag co-occurrence
- [x] I3 `status-rollup` Status roll-up
- [x] I4 `living-docs` Living documentation

## Quality-of-life improvements (25)
- [x] Q1 Enable all / disable all / reset algorithms to defaults
- [x] Q2 Per-category toggle in Settings → Algorithms
- [x] Q3 "N of M algorithms on" count in settings
- [x] Q4 Tooltip (ⓘ) on every algorithm row
- [x] Q5 Disabled tools show an explanation and a "Turn on" button
- [x] Q6 Test Design remembers the last tool tab
- [x] Q7 Test Design tools in the command palette
- [x] Q8 Generator inputs persisted as a draft
- [x] Q9 Load sample data button in each tool
- [x] Q10 Copy result as Gherkin / Markdown
- [x] Q11 Download results (.feature, .csv, .html, .md)
- [x] Q12 Import parameters from CSV
- [x] Q13 Reproducible seed input for random algorithms
- [x] Q14 Row-count explosion warning before Cartesian product
- [x] Q15 Coverage meter for generated tables
- [x] Q16 Open the generated scenario in the feature editor
- [x] Q17 Drag-and-drop result files
- [x] Q18 Saved filters & plans persisted per browser
- [x] Q19 Empty states that explain what to do next
- [x] Q20 Similarity threshold slider for duplicate detection
- [x] Q21 Click a finding to open the file at the line
- [x] Q22 Rename refactor shows a preview diff before writing
- [x] Q23 Algorithm picker remembers its choice
- [x] Q24 Print-friendly living docs
- [x] Q25 Keyboard shortcut for Test Design (Alt+5 in Advanced mode)
