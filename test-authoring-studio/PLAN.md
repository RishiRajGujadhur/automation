# Test Design & Algorithms Plan

Goal: add deterministic (non-AI) test-design algorithms to TestAuthoring Studio, surface them in a new **Test Design** page and in the Gherkin editor, and let every algorithm be switched on or off in **Settings → Algorithms** (each row has a tooltip explaining it).

Architecture:
- `src/algorithms/*.ts` — pure, unit-tested TypeScript modules (no React).
- `src/algorithms/registry.ts` — one entry per algorithm: `id`, `name`, `category`, `tooltip`, `defaultEnabled`.
- `prefs.algorithms` — `Record<id, boolean>` overrides, read with `useAlgorithm(id)` / `isAlgorithmEnabled(id)`.
- `src/TestDesign.tsx` — the Test Design page (tools: Examples generator, Flow generator, Step library, Suite optimizer, Duplicates & smells, Flaky analysis, Plans & filters, Living docs, Text lab).
- `GET /api/design/corpus` — all features (with steps/tags) and bindings for the client-side tools.

Legend: `[x]` done · `[ ]` to do. Each feature group is committed and pushed when finished.

## Features

- [ ] F1 Algorithm registry, `prefs.algorithms`, Settings → Algorithms section with switch + tooltip per algorithm, enable/disable all, per category
- [ ] F2 Test Design page (Advanced ⋯ menu + command palette + deep link `#/test-design`)
- [ ] F3 Combinatorial Examples generator (IPOG etc.) → Scenario Outline Examples table
- [ ] F4 Step library: reusable steps with parameters, usage counts, rename-everywhere refactor preview
- [ ] F5 Editor: trie autocomplete from the feature corpus, duplicate-step and smell lint
- [ ] F6 Suite optimizer (greedy set cover over tags/requirements) and prioritization
- [ ] F7 FSM flow → scenarios generator
- [ ] F8 Tags, saved filters (tag expressions), test plans / cycles
- [ ] F9 Living documentation export (HTML/Markdown) with pass/fail status from imported results
- [ ] F10 Flaky analysis from imported JUnit / Cucumber JSON history

## Algorithms (92)

### A. Combinatorial test design (15)
- [ ] A1 `ipog` IPOG t-way covering arrays (pairwise, 3-way…)
- [ ] A2 `aetg` AETG greedy randomized covering arrays
- [ ] A3 `cartesian` All combinations (Cartesian product)
- [ ] A4 `each-choice` Each-choice (every value at least once)
- [ ] A5 `base-choice` Base-choice coverage
- [ ] A6 `random-sample` Seeded random sampling (Mulberry32 PRNG)
- [ ] A7 `bva` Boundary value analysis
- [ ] A8 `equivalence` Equivalence partitioning
- [ ] A9 `constraints` Constraint filtering (forbidden combinations / if-then rules)
- [ ] A10 `seeds` Seeded rows (keep existing Examples rows)
- [ ] A11 `tway-coverage` t-way coverage measurement
- [ ] A12 `orthogonal` Orthogonal arrays from Latin squares
- [ ] A13 `decision-table` Decision table generation
- [ ] A14 `quine-mccluskey` Quine–McCluskey rule minimization
- [ ] A15 `weighted-values` Weighted value selection

### B. String similarity & normalization (14)
- [ ] B1 `levenshtein` Levenshtein distance / ratio
- [ ] B2 `damerau` Damerau–Levenshtein (transpositions)
- [ ] B3 `jaro-winkler` Jaro–Winkler similarity
- [ ] B4 `lcs` Longest common subsequence ratio
- [ ] B5 `jaccard` Token Jaccard similarity
- [ ] B6 `dice` Sørensen–Dice bigram coefficient
- [ ] B7 `tfidf-cosine` TF-IDF cosine similarity
- [ ] B8 `ncd` Normalized compression distance (LZW)
- [ ] B9 `simhash` SimHash near-duplicate fingerprints
- [ ] B10 `minhash` MinHash + LSH banding
- [ ] B11 `soundex` Soundex phonetic codes
- [ ] B12 `metaphone` Metaphone phonetic codes
- [ ] B13 `porter` Porter stemmer
- [ ] B14 `ngram` Character n-gram profiles

### C. Search & autocomplete (9)
- [ ] C1 `trie` Prefix trie autocomplete
- [ ] C2 `fuzzy` Fuzzy subsequence scoring (fzf-style)
- [ ] C3 `bm25` BM25 ranking
- [ ] C4 `bktree` BK-tree typo-tolerant lookup
- [ ] C5 `inverted-index` Inverted index
- [ ] C6 `stopwords` Stop-word removal
- [ ] C7 `synonyms` Synonym / verb alias expansion
- [ ] C8 `frecency` Frecency ranking (frequency × recency)
- [ ] C9 `aho-corasick` Aho–Corasick multi-pattern highlighting

### D. Step library & refactoring (9)
- [ ] D1 `template-inference` Step template inference (parameter extraction by token alignment)
- [ ] D2 `param-types` Parameter type inference (int, float, date, email, url, bool, string)
- [ ] D3 `union-find` Union-find clustering of similar steps
- [ ] D4 `hac` Hierarchical agglomerative clustering
- [ ] D5 `dbscan` DBSCAN density clustering
- [ ] D6 `rename-refactor` Rename-everywhere step refactor
- [ ] D7 `cucumber-to-regex` Cucumber expression → regex
- [ ] D8 `regex-to-cucumber` Regex → Cucumber expression
- [ ] D9 `keyword-resolution` And/But keyword resolution

### E. Graph / model-based testing (14)
- [ ] E1 `fsm-parse` FSM text model parser
- [ ] E2 `bfs` BFS shortest paths
- [ ] E3 `simple-paths` All simple paths (bounded DFS)
- [ ] E4 `state-coverage` State coverage path set
- [ ] E5 `transition-coverage` Transition (edge) coverage path set
- [ ] E6 `n-switch` N-switch (transition-pair) coverage
- [ ] E7 `prime-paths` Prime path coverage
- [ ] E8 `chinese-postman` Chinese postman tour (minimum edge repetition)
- [ ] E9 `hierholzer` Hierholzer Eulerian circuit
- [ ] E10 `dijkstra` Dijkstra weighted shortest path
- [ ] E11 `tarjan` Tarjan strongly connected components
- [ ] E12 `kahn` Kahn topological sort
- [ ] E13 `reachability` Reachability / dead-state detection
- [ ] E14 `random-walk` Seeded random-walk scenarios

### F. Suite optimization & prioritization (10)
- [ ] F1 `greedy-set-cover` Greedy set cover minimization
- [ ] F2 `weighted-set-cover` Cost-weighted greedy set cover
- [ ] F3 `hgs` Harrold–Gupta–Soffa reduction
- [ ] F4 `exact-cover` Branch-and-bound exact minimum cover
- [ ] F5 `total-greedy` Total-coverage prioritization
- [ ] F6 `additional-greedy` Additional-coverage prioritization
- [ ] F7 `art` Adaptive random prioritization
- [ ] F8 `apfd` APFD metric
- [ ] F9 `simulated-annealing` Simulated annealing minimization
- [ ] F10 `genetic` Genetic algorithm minimization

### G. Flaky & results analysis (8)
- [ ] G1 `junit-parse` JUnit XML results parser
- [ ] G2 `cucumber-json` Cucumber JSON results parser
- [ ] G3 `flip-rate` Flip rate
- [ ] G4 `entropy` Outcome entropy
- [ ] G5 `flaky-score` Combined flakiness score (transition × balance)
- [ ] G6 `wilson` Wilson score interval
- [ ] G7 `ewma` Exponentially weighted moving average trend
- [ ] G8 `beta-posterior` Bayesian Beta posterior failure rate

### H. Gherkin quality & smells (9)
- [ ] H1 `smell-missing-then` Scenario without Then
- [ ] H2 `smell-long` Too many steps
- [ ] H3 `smell-conjunction` Conjunction steps ("and" inside a step)
- [ ] H4 `smell-imperative` Imperative UI detail (click/type/field)
- [ ] H5 `smell-order` Given after When / When after Then
- [ ] H6 `smell-outline` Outline placeholder ↔ Examples column mismatch
- [ ] H7 `scenario-fingerprint` Duplicate scenario fingerprints
- [ ] H8 `smell-dup-names` Duplicate scenario names
- [ ] H9 `flesch` Flesch reading ease

### I. Tags, plans & docs (4)
- [ ] I1 `tag-expression` Tag expression parser (shunting-yard)
- [ ] I2 `tag-cooccurrence` Tag co-occurrence matrix
- [ ] I3 `status-rollup` Status roll-up (scenario → feature → folder)
- [ ] I4 `living-docs` Living documentation generator

## Quality-of-life improvements (25)
- [ ] Q1 Enable all / disable all / reset algorithms to defaults
- [ ] Q2 Per-category toggle in Settings → Algorithms
- [ ] Q3 "N of M algorithms on" count in settings
- [ ] Q4 Tooltip (ⓘ) on every algorithm row
- [ ] Q5 Disabled tools show an explanation and a "Turn on" button
- [ ] Q6 Test Design remembers the last tool tab
- [ ] Q7 Test Design tools in the command palette
- [ ] Q8 Generator inputs persisted as a draft
- [ ] Q9 Load sample data button in each tool
- [ ] Q10 Copy result as Gherkin / Markdown
- [ ] Q11 Download results (.feature, .csv, .html, .md)
- [ ] Q12 Import parameters from CSV
- [ ] Q13 Reproducible seed input for random algorithms
- [ ] Q14 Row-count explosion warning before Cartesian product
- [ ] Q15 Coverage meter for generated tables
- [ ] Q16 Open the generated scenario in the feature editor
- [ ] Q17 Drag-and-drop result files
- [ ] Q18 Saved filters & plans persisted per browser
- [ ] Q19 Empty states that explain what to do next
- [ ] Q20 Similarity threshold slider for duplicate detection
- [ ] Q21 Click a finding to open the file at the line
- [ ] Q22 Rename refactor shows a preview diff before writing
- [ ] Q23 Algorithm picker remembers its choice
- [ ] Q24 Print-friendly living docs
- [ ] Q25 Keyboard shortcut for Test Design (Alt+5 in Advanced mode)
