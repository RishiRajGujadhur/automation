/* Every algorithm the studio uses, with the text shown in Settings → Algorithms. */
export type AlgorithmCategory = 'Combinatorial design' | 'String similarity' | 'Search & autocomplete' | 'Step library' | 'Model-based testing' | 'Suite optimization' | 'Results & flakiness' | 'Gherkin quality' | 'Tags, plans & docs' | 'Logic & specification' | 'Impact & risk' | 'Text & sequences';
export type Algorithm = { id: string; name: string; category: AlgorithmCategory; tooltip: string; usedIn: string; defaultEnabled?: boolean };

const a = (category: AlgorithmCategory, usedIn: string, list: [string, string, string, boolean?][]): Algorithm[] => list.map(([id, name, tooltip, on]) => ({ id, name, category, tooltip, usedIn, defaultEnabled: on ?? true }));

export const algorithms: Algorithm[] = [
  ...a('Combinatorial design', 'Test Design → Examples generator', [
    ['ipog', 'IPOG (t-way)', 'In-Parameter-Order-General (Lei, Kacker, Kuhn et al., NIST). Builds a small table in which every pair (or every t-way combination) of parameter values appears at least once, growing one parameter at a time.'],
    ['aetg', 'AETG', 'Automatic Efficient Test Generator (Cohen et al.). Each new row is the best of several greedy, randomized candidates seeded from a combination that is not yet covered.'],
    ['covertable', 'covertable (PICT-style)', 'Uses the open-source covertable library (TypeScript, Apache-2.0) to build a pairwise covering array. Useful as a second opinion against IPOG and AETG.'],
    ['cartesian', 'All combinations', 'The full Cartesian product: every value of every parameter combined with every other. Exhaustive but grows multiplicatively.'],
    ['each-choice', 'Each-choice', 'The weakest criterion: every value of every parameter appears in at least one row. Rows = size of the largest parameter.'],
    ['base-choice', 'Base-choice', 'Starts from one "happy path" row (the first value of each parameter) and varies one parameter at a time from it.'],
    ['random-sample', 'Seeded random sampling', 'Picks N distinct rows at random using the Mulberry32 PRNG, so the same seed always gives the same rows.'],
    ['bva', 'Boundary value analysis', 'Writing a range such as 18..65 expands to the values at and around its edges (17, 18, 19, nominal, 64, 65, 66), where off-by-one bugs live.'],
    ['equivalence', 'Equivalence partitioning', 'Writing [0..17|18..64|65..120] expands to one representative per class plus one invalid value below and above all classes.'],
    ['constraints', 'Constraint rules', 'Lines like "os = iOS & browser = Edge" (forbidden) or "if plan = Free then seats = 1" remove impossible rows during generation, not afterwards.'],
    ['seeds', 'Seed rows', 'Rows already in the Examples box are kept and the generator only adds what they do not cover yet.'],
    ['tway-coverage', 't-way coverage meter', 'Counts how many of the valid t-way value combinations the current table covers, shown as a percentage.'],
    ['orthogonal', 'Orthogonal arrays', 'Builds an L(p²) orthogonal array from mutually orthogonal Latin squares (p prime). Every pair appears equally often — balanced, good for experiments.'],
    ['decision-table', 'Decision tables', 'Lists every true/false combination of the conditions you enter and evaluates an outcome expression for each.'],
    ['quine-mccluskey', 'Quine–McCluskey minimization', 'Merges decision-table rows that differ in one condition into "don\'t care" (-) rules, giving the smallest set of rules with the same outcome.'],
    ['weighted-values', 'Weighted values', 'Writing value*3 makes that value three times as likely to be chosen by AETG and random sampling.'],
  ]),
  ...a('String similarity', 'Duplicates, step library and editor lint', [
    ['levenshtein', 'Levenshtein ratio', 'Edit distance: the fewest single-character insertions, deletions or substitutions to turn one step into another, as a 0–1 similarity.'],
    ['damerau', 'Damerau–Levenshtein', 'Levenshtein plus swaps of adjacent characters, so typos like "teh" count as one edit.'],
    ['jaro-winkler', 'Jaro–Winkler', 'Similarity that rewards matching characters close together and a shared prefix. Good for short names.'],
    ['lcs', 'Longest common subsequence', 'Similarity from the longest run of characters both strings contain in the same order (not necessarily adjacent).'],
    ['jaccard', 'Token Jaccard', 'Shared words ÷ all distinct words. Ignores word order.'],
    ['dice', 'Sørensen–Dice', 'Similarity from shared character pairs (bigrams). Robust to small spelling differences.'],
    ['tfidf-cosine', 'TF-IDF cosine', 'Weights rare words more than common ones (term frequency × inverse document frequency) and compares steps as vectors.'],
    ['ncd', 'Compression distance (NCD)', 'Normalized compression distance with LZW: two steps are similar if compressing them together costs little more than compressing one.'],
    ['simhash', 'SimHash', 'A 32-bit fingerprint where similar steps differ in few bits (Charikar). Finds near-duplicates without comparing every pair.'],
    ['minhash', 'MinHash + LSH', 'Estimates Jaccard similarity from signatures and buckets them with locality-sensitive hashing so only likely duplicates are compared.'],
    ['soundex', 'Soundex', 'Phonetic code: words that sound alike ("Smith", "Smyth") get the same code. Used for typo-tolerant matching.'],
    ['metaphone', 'Metaphone', 'A more accurate phonetic code than Soundex for English words.'],
    ['porter', 'Porter stemmer', 'Reduces words to stems ("clicked", "clicking" → "click") so different word forms match.'],
    ['ngram', 'Character n-grams', 'Compares overlapping 3-character slices of each step; tolerant of word splits and typos.'],
  ]),
  ...a('Search & autocomplete', 'Feature editor autocomplete and Test Design search', [
    ['trie', 'Prefix trie autocomplete', 'Every step already written in your feature files is stored in a prefix tree, so the editor suggests them as you type (alongside bindings).'],
    ['fuzzy', 'Fuzzy subsequence scoring', 'fzf-style matching: "lgnusr" finds "login user". Rewards consecutive letters and word starts.'],
    ['bm25', 'BM25 ranking', 'Okapi BM25, the classic search-engine relevance formula, ranks steps by how well their words match the query.'],
    ['bktree', 'BK-tree "did you mean"', 'A Burkhard–Keller tree finds steps within a couple of edits of what you typed, for typo suggestions.'],
    ['inverted-index', 'Inverted index', 'Maps each word to the steps that contain it, making word lookups instant.'],
    ['stopwords', 'Stop-word removal', 'Ignores filler words (the, a, to, is…) when comparing steps.'],
    ['synonyms', 'Synonym expansion', 'Treats verb aliases as one word (press/tap → click, type/fill → enter) when comparing steps.'],
    ['frecency', 'Frecency ranking', 'Ranks suggestions you used often and recently higher (Mozilla-style decay, 7-day half-life).'],
    ['aho-corasick', 'Aho–Corasick highlighting', 'Finds every search term in a result in one pass and highlights them.'],
  ]),
  ...a('Step library', 'Test Design → Step library', [
    ['template-inference', 'Step template inference', 'Finds steps that differ only in a few words or values and proposes one parameterized step for them.'],
    ['param-types', 'Parameter type inference', 'Looks at the values in a parameter and picks {int}, {float}, {word} or {string}, and spots dates, emails and URLs.'],
    ['union-find', 'Union-find clustering', 'Groups steps transitively: if A≈B and B≈C they land in one cluster (disjoint-set with path compression).'],
    ['hac', 'Hierarchical clustering', 'Agglomerative clustering with average linkage: repeatedly merges the two most similar groups until the threshold.'],
    ['dbscan', 'DBSCAN', 'Density-based clustering: groups dense neighbourhoods of similar steps and leaves one-offs as noise.'],
    ['rename-refactor', 'Rename everywhere', 'Rewrites every step matching an expression to new wording across all feature files, keeping argument values. Preview first.'],
    ['cucumber-to-regex', 'Cucumber → regex', 'Turns a Cucumber expression ({int}, {string}, optional (s), a/b alternatives) into the equivalent regular expression.'],
    ['regex-to-cucumber', 'Regex → Cucumber', 'Turns a regex binding into a Cucumber expression when its groups map onto built-in parameter types.'],
    ['keyword-resolution', 'And/But resolution', 'And, But and * take the meaning of the previous Given/When/Then, so steps are grouped by what they really are.'],
  ]),
  ...a('Model-based testing', 'Test Design → Flow generator', [
    ['fsm-parse', 'State-machine model', 'Reads "From -> To : action" lines into a finite-state machine you can generate scenarios from.'],
    ['bfs', 'BFS shortest path', 'Breadth-first search: the fewest transitions between two states. Used to reach each target and get back to an end state.'],
    ['simple-paths', 'All simple paths', 'Every start-to-end path that visits no state twice (bounded depth-first search).'],
    ['state-coverage', 'State coverage', 'The fewest scenarios that, together, visit every reachable state.'],
    ['transition-coverage', 'Transition coverage', 'Scenarios that, together, take every transition at least once (edge coverage).'],
    ['n-switch', 'N-switch coverage', 'Covers every sequence of N+1 consecutive transitions (1-switch = every pair), catching bugs that depend on what happened just before.'],
    ['prime-paths', 'Prime path coverage', 'Covers every maximal simple path (Ammann & Offutt), the strongest practical path criterion; includes loops.'],
    ['chinese-postman', 'Chinese postman tour', 'One shortest tour that takes every transition, repeating as few as possible (balances degrees with shortest paths, then walks an Euler circuit).'],
    ['hierholzer', 'Hierholzer Euler circuit', 'Walks a route using every transition exactly once; the last step of the Chinese postman tour.'],
    ['dijkstra', 'Dijkstra weighted path', 'Cheapest path when transitions have costs, written as [cost] at the end of a line.'],
    ['tarjan', 'Tarjan SCC', 'Finds strongly connected groups of states; states outside the main group often mean one-way traps.'],
    ['kahn', 'Kahn topological sort', 'Orders feature dependencies (A before B) and reports cycles.'],
    ['reachability', 'Reachability / dead states', 'Flags states you can never reach from the start and states from which no end state can be reached.'],
    ['random-walk', 'Random walks', 'Seeded random journeys through the model for exploratory scenarios.'],
  ]),
  ...a('Suite optimization', 'Test Design → Suite optimizer', [
    ['greedy-set-cover', 'Greedy set cover', 'Repeatedly picks the scenario that covers the most still-uncovered tags/requirements: a small suite with the same coverage.'],
    ['weighted-set-cover', 'Weighted set cover', 'Like greedy set cover but divides by cost (step count), preferring cheap scenarios.'],
    ['hgs', 'Harrold–Gupta–Soffa', 'Classic reduction heuristic: satisfies requirements covered by the fewest scenarios first.'],
    ['exact-cover', 'Exact minimum (branch and bound)', 'Finds the provably smallest covering suite for up to 24 scenarios; larger suites fall back to greedy.'],
    ['simulated-annealing', 'Simulated annealing', 'Randomly flips scenarios in and out, sometimes accepting worse suites early on, to escape local minima.'],
    ['genetic', 'Genetic algorithm', 'Evolves a population of candidate suites with selection, crossover and mutation.'],
    ['total-greedy', 'Total-greedy prioritization', 'Runs scenarios covering the most requirements first.'],
    ['additional-greedy', 'Additional-greedy prioritization', 'Runs next whichever scenario adds the most not-yet-covered requirements (Rothermel et al.). A strong baseline in studies.'],
    ['art', 'Adaptive random prioritization', 'Picks next the candidate most different from those already chosen (Jiang et al.), spreading diversity early.'],
    ['apfd', 'APFD metric', 'Average Percentage of Faults Detected: how early an order covers requirements (1.0 is ideal).'],
  ]),
  ...a('Results & flakiness', 'Test Design → Results & flakiness, living docs', [
    ['junit-parse', 'JUnit XML import', 'Reads results from JUnit/NUnit-style XML (testcase, failure, skipped).'],
    ['cucumber-json', 'Cucumber JSON import', 'Reads results from the Cucumber/SpecFlow JSON report format.'],
    ['flip-rate', 'Flip rate', 'How often a scenario switches between pass and fail across runs (Kowalczyk et al.).'],
    ['entropy', 'Outcome entropy', 'Shannon entropy of pass/fail outcomes: 0 when always the same, 1 when it is a coin toss.'],
    ['flaky-score', 'Flakiness score', '0.6 × flip rate + 0.4 × balance. Also labels tests broken (always failing) or with too few runs.'],
    ['wilson', 'Wilson interval', 'A 95% confidence interval for the pass rate that stays sensible with few runs.'],
    ['ewma', 'EWMA trend', 'Exponentially weighted failure rate, so recent runs count more than old ones.'],
    ['beta-posterior', 'Bayesian failure rate', 'Beta posterior of the failure probability with a 90% credible interval.'],
  ]),
  ...a('Gherkin quality', 'Test Design → Duplicates & smells, feature editor lint', [
    ['smell-missing-then', 'Scenario without Then', 'Flags scenarios that never verify anything.'],
    ['smell-long', 'Long scenario', 'Flags scenarios with more steps than the threshold (default 10).'],
    ['smell-conjunction', 'Conjunction step', 'Flags steps that contain "and"/"then" inside the text, which usually means two steps in one.'],
    ['smell-imperative', 'Imperative UI detail', 'Flags steps that mention clicks, buttons, fields or selectors instead of behaviour.'],
    ['smell-order', 'Keyword order', 'Flags a Given after a When, or a When/Given after a Then.'],
    ['smell-outline', 'Outline/Examples mismatch', 'Flags <placeholders> with no Examples column and columns no step uses.'],
    ['scenario-fingerprint', 'Duplicate scenarios', 'Hashes each scenario\'s normalized step sequence; equal hashes are duplicates.'],
    ['smell-dup-names', 'Duplicate scenario names', 'Flags two scenarios with the same name in one feature.'],
    ['flesch', 'Flesch reading ease', 'Readability score of each scenario (higher is easier). Long words and long steps lower it.'],
    ['duplicate-step-lint', 'Near-duplicate step lint', 'In the feature editor, warns when a step is almost identical to a different existing step, suggesting reuse.'],
  ]),
  // ---- Batch 2 ----
  ...a('Logic & specification', 'Test Design → Logic & techniques', [
    ['mcdc', 'MC/DC', 'Modified condition/decision coverage (aviation DO-178C): for every condition, two tests that differ only in that condition and change the outcome. Usually needs only n+1 tests.'],
    ['condition-coverage', 'Condition coverage', 'Every condition is true in some test and false in another. Cheap, but does not guarantee each decision outcome.'],
    ['decision-coverage', 'Decision coverage', 'Branch coverage: one test where the whole rule is true and one where it is false.'],
    ['multiple-condition', 'Multiple-condition coverage', 'Every combination of condition values (the full truth table, 2ⁿ rows).'],
    ['cause-effect', 'Cause–effect graphing', 'Causes are conditions, effects are rules over them. Builds the decision table for all effects at once and merges rows that differ in one cause into "don\'t care".'],
    ['classification-tree', 'Classification tree method', 'Describe each input aspect (classification) and its classes as an outline; the tool combines classes minimally (each class once) or pairwise.'],
    ['domain-testing', 'Domain testing (ON/OFF points)', 'For a boundary like "age >= 18": the ON point on the boundary, the OFF point just across it, plus one point inside and one outside.'],
    ['value-catalog', 'Heuristic value catalogue', 'Error-guessing values per type: empty strings, Unicode, SQL/HTML injection, max/min integers, leap days, malformed emails and URLs.'],
    ['sa-covering', 'Simulated-annealing covering arrays', 'Cohen et al.: anneal a random table until every t-way combination is covered, shrinking the row count while it still succeeds. Often smaller than greedy methods.'],
    ['table-reducer', 'Examples table reducer', 'Removes rows from an existing Examples table while keeping its t-way coverage.'],
    ['missing-pairs', 'Uncovered combinations', 'Lists the value combinations an existing Examples table does not cover yet.'],
    ['sneak-paths', 'Sneak-path (invalid transition) tests', 'For every reachable state, the actions the model does not allow there. Each should be rejected — negative tests.'],
  ]),
  ...a('Model-based testing', 'Test Design → Flow generator', [
    ['floyd-warshall', 'Floyd–Warshall all-pairs paths', 'Shortest cost between every pair of states, as a distance matrix (∞ = unreachable).'],
    ['cyclomatic', 'Cyclomatic complexity', 'McCabe: edges − states + 2 × components. The number of independent paths through the flow.'],
    ['basis-paths', 'Basis path coverage', 'A set of linearly independent start-to-end paths (spanning tree plus one path per extra transition). Size ≈ cyclomatic complexity.'],
    ['yen-k-shortest', "Yen's k shortest paths", 'The k cheapest distinct routes between two states, not just the single shortest one.'],
    ['markov-usage', 'Markov usage model', 'Reads [n] on transitions as relative usage. Generates the most probable journeys and the long-run share of time in each state (statistical usage testing).'],
    ['pagerank', 'PageRank of states', 'Ranks states by how often journeys pass through them: hub screens deserve the most tests.'],
  ]),
  ...a('Impact & risk', 'Test Design → Impact & risk', [
    ['test-impact', 'Test impact analysis', 'Change-based selection: give changed files (or read them from git); scenarios whose .feature changed, or whose steps bind to a changed C# step file, are selected with the reason.'],
    ['rtm', 'Traceability matrix', 'Requirements (tags like @REQ-12, @JIRA-345) × scenarios, with uncovered requirements and untraced scenarios.'],
    ['risk-score', 'Risk-based prioritization', 'Risk = likelihood × impact. Likelihood from imported failure history (smoothed), impact from tag weights you set (e.g. @payments=5).'],
    ['quarantine', 'Quarantine policy', 'Recommends quarantining tests that fail in 1–50 % of recent runs and flip often, and releasing them after a run of passes. Always-failing tests are flagged as regressions.'],
    ['knapsack', 'Time-budget selection', '0/1 knapsack (dynamic programming): the most valuable scenarios that fit in a time budget, using imported durations or step counts.'],
    ['pareto', 'Pareto front', 'Suite sizes where nothing smaller covers as much: shows the trade-off between run time and coverage.'],
    ['logistic-regression', 'Failure prediction (logistic regression)', 'Learns from imported history which scenario features (steps, past failures, flips, tags) predict a failure in the next run.'],
    ['naive-bayes', 'Failure prediction (naive Bayes)', 'Gaussian naive Bayes on the same features: a second, simpler opinion.'],
    ['kmeans', 'k-means scenario themes', 'Groups scenarios into k themes by their wording (TF-IDF vectors, cosine distance, k-means++ seeding).'],
    ['silhouette', 'Silhouette score', 'Measures how well-separated the k-means themes are and suggests the best k.'],
  ]),
  ...a('Results & flakiness', 'Test Design → Results & flakiness', [
    ['cusum', 'CUSUM change point', 'Cumulative-sum control chart: finds the run where a scenario started failing more often than its baseline.'],
    ['sprt', 'SPRT rerun decision', "Wald's sequential probability ratio test: decides flaky vs. stable as early as possible and estimates how many reruns are still needed."],
    ['mann-kendall', 'Mann–Kendall trend', 'Non-parametric trend test on durations: is a scenario getting slower over time?'],
    ['mad-outliers', 'Slow-test outliers (MAD)', 'Robust z-score using the median absolute deviation; flags unusually slow scenarios without being skewed by them.'],
    ['percentiles', 'Duration percentiles', 'p50, p90 and p95 durations per scenario.'],
    ['mtbf', 'Mean runs between failures', 'How many runs pass, on average, between two failures.'],
    ['co-failure', 'Co-failure clusters', 'Scenarios that fail in the same runs (Jaccard ≥ 0.6): likely one shared root cause.'],
  ]),
  ...a('Text & sequences', 'Duplicates & smells, Step library, Plans, Similarity lab', [
    ['gunning-fog', 'Gunning fog index', 'Readability as years of schooling: 0.4 × (words per step + % words with 3+ syllables).'],
    ['lexical-diversity', 'Lexical diversity', 'Distinct words ÷ all words. Very low means repetitive wording; very high may mean inconsistent vocabulary.'],
    ['passive-voice', 'Passive voice', 'Flags steps like "the order is placed by the user": active voice makes the actor clear.'],
    ['vague-words', 'Vague wording', 'Requirements smells (Femmer et al.): "properly", "quickly", "as expected", "etc." cannot be verified.'],
    ['rake', 'RAKE keywords', 'Rapid Automatic Keyword Extraction: the key phrases of each feature, for summaries and tags.'],
    ['next-step', 'Next-step suggestions', 'A bigram Markov model of your step sequences: given a step, what usually comes next.'],
    ['sequence-mining', 'Frequent step sequences', 'Runs of steps that repeat across scenarios; runs at the start of many scenarios are Background candidates.'],
    ['needleman-wunsch', 'Scenario alignment', 'Needleman–Wunsch global alignment of two scenarios step by step, matching similar steps and showing gaps.'],
    ['apriori', 'Tag association rules', 'Apriori: rules like "@checkout ⇒ @payments" with support, confidence and lift.'],
    ['hamming-steps', 'Step Hamming distance', 'For scenarios of equal length: how many step positions differ.'],
    ['entropy-tags', 'Tag entropy', 'How evenly tags are spread (1 = even, 0 = one tag dominates).'],
  ]),
  ...a('Tags, plans & docs', 'Test Design → Plans & filters, Living docs', [
    ['tag-expression', 'Tag expressions', 'Parses Cucumber tag expressions like "@smoke and not (@slow or @wip)" with the shunting-yard algorithm.'],
    ['tag-cooccurrence', 'Tag co-occurrence', 'A matrix of how often tags appear together; reveals redundant or always-paired tags.'],
    ['status-rollup', 'Status roll-up', 'Worst status wins when scenario results are summarized per feature and folder.'],
    ['living-docs', 'Living documentation', 'Builds a browsable HTML or Markdown specification from your features with the latest pass/fail status.'],
  ]),
];

export const algorithmById = new Map(algorithms.map((x) => [x.id, x]));
export const categories = [...new Set(algorithms.map((x) => x.category))];

/* ------------------------------------------------------------------ presets */
const byCategory = (...cs: AlgorithmCategory[]) => algorithms.filter((a) => cs.includes(a.category)).map((a) => a.id);
/** The everyday set: one good algorithm per job, so tools stay simple. */
const essentials = [
  'ipog', 'bva', 'equivalence', 'constraints', 'seeds', 'tway-coverage', 'decision-table', 'quine-mccluskey',
  'levenshtein', 'jaccard', 'stopwords', 'synonyms',
  'trie', 'fuzzy', 'bm25', 'aho-corasick', 'frecency',
  'template-inference', 'param-types', 'union-find', 'rename-refactor', 'cucumber-to-regex', 'regex-to-cucumber', 'keyword-resolution',
  'fsm-parse', 'bfs', 'transition-coverage', 'state-coverage', 'reachability', 'dijkstra', 'kahn',
  'greedy-set-cover', 'additional-greedy', 'apfd',
  'junit-parse', 'cucumber-json', 'flaky-score', 'flip-rate', 'wilson',
  'smell-missing-then', 'smell-long', 'smell-order', 'smell-outline', 'smell-dup-names', 'scenario-fingerprint', 'duplicate-step-lint',
  'tag-expression', 'status-rollup', 'living-docs',
  'mcdc', 'test-impact', 'rtm', 'quarantine',
];
const parsers = ['fsm-parse', 'junit-parse', 'cucumber-json', 'tag-expression', 'keyword-resolution', 'cucumber-to-regex'];
export type Preset = { id: string; label: string; description: string; ids?: string[] };
export const presets: Preset[] = [
  { id: 'essentials', label: 'Essentials', description: 'One proven algorithm per task: pairwise Examples, step search and reuse, transition coverage, minimal suites, flakiness, core smells, living docs.', ids: essentials },
  { id: 'bdd-authoring', label: 'BDD authoring', description: 'Essentials plus every similarity measure, step-library clustering, Gherkin quality checks and wording/sequence analysis.', ids: [...essentials, ...byCategory('String similarity', 'Search & autocomplete', 'Step library', 'Gherkin quality', 'Text & sequences')] },
  { id: 'combinatorial', label: 'Combinatorial & logic', description: 'Essentials plus every covering-array generator and the logic techniques (MC/DC, cause–effect, classification trees, domain testing).', ids: [...essentials, ...byCategory('Combinatorial design', 'Logic & specification')] },
  { id: 'model-based', label: 'Model-based', description: 'Essentials plus all state-machine coverage criteria, path algorithms and usage models.', ids: [...essentials, ...byCategory('Model-based testing')] },
  { id: 'regression', label: 'Regression & CI', description: 'Essentials plus suite optimization, run-history statistics, test impact, risk and prediction.', ids: [...essentials, ...byCategory('Suite optimization', 'Results & flakiness', 'Impact & risk')] },
  { id: 'minimal', label: 'Minimal', description: 'Only the parsers the tools need to read your input. Everything else is off.', ids: parsers },
  { id: 'everything', label: 'Everything', description: `All ${algorithms.length} algorithms.`, ids: algorithms.map((a) => a.id) },
  { id: 'custom', label: 'Custom', description: 'Choose each algorithm yourself. Starts from the preset you had selected.' },
];
export const presetById = new Map(presets.map((p) => [p.id, p]));
export const DEFAULT_PRESET = 'essentials';
const presetSets = new Map(presets.filter((p) => p.ids).map((p) => [p.id, new Set(p.ids)]));
/** Effective state: a preset decides, except under Custom where the explicit map decides (unset → Essentials). */
export function isEnabled(state: { preset?: string; overrides?: Record<string, boolean> } | undefined, id: string) {
  const preset = state?.preset && presetById.has(state.preset) ? state.preset : DEFAULT_PRESET;
  if (preset === 'custom') { const v = state?.overrides?.[id]; return v === undefined ? presetSets.get(DEFAULT_PRESET)!.has(id) : v; }
  return presetSets.get(preset)!.has(id);
}
/** The explicit map that reproduces a preset (used when switching to Custom). */
export const snapshot = (state: { preset?: string; overrides?: Record<string, boolean> }) => Object.fromEntries(algorithms.map((a) => [a.id, isEnabled(state, a.id)]));
export const enabledCount = (state: { preset?: string; overrides?: Record<string, boolean> }) => algorithms.filter((a) => isEnabled(state, a.id)).length;
