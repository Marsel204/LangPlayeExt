# Performance and regression test proposal — Sonnet 5.5

- **Repository / baseline:** `/home/marsel/.t3/worktrees/LangPlayext/t3-1a9e7cd4`, branch `t3/review-performance-fixes`, production baseline `3187787fd723fa20686cb97523d3b5ab1ccaffab`
- **Date:** 2026-10-28
- **Stage:** 1 of the performance sequence (proposal only). Next stage: Sol High implements and runs this plan against the **unchanged** baseline. A new Sonnet review then judges the results and proposes fixes; Sol Max implements and verifies them.
- **Inputs:** `aggregate-review.md`, `sonnet-code-review.md`, `sol-ultra-code-review.md`, the shipped `content.js`, `js/youtube-bridge.js`, `background.js`, `manifest.json`, and the existing harnesses (`tests/test_review_regressions.js`, `tests/test_youtube_bridge_toggle.js`, `tests/content_subtitle_helpers.js`, `tests/browser_*.mjs`).
- **Constraints honoured:** no production or test file was changed. Only this Markdown file was written. Scratch probes lived in `/tmp/lpproposal/` and are not part of the repository.

Contents: 1 Principles · 2 Layout, commands, artifacts · 3 Shared harness · 4 Environment and statistics · 5 Performance suite (P1–P8) · 6 Regression suite (R-cases for A01–A12) · 7 Telling expected red from harness error · 8 Limits · 9 Runtime and implementation order · 10 Hand-off checklist for Sol High

---

## 0. Pre-proposal probe observations (scratch, to be re-measured)

These informed the workload sizes. They are **observations on this machine (8 cores, Node v26.8.1, Linux 7.2), not acceptance numbers, and Sol High must re-measure them**. None is a gate.

| Probe | Observation |
| --- | --- |
| `onTimeUpdate` source (`content.js:3542-3564`) | Linear scan from index 0 on every `timeupdate`, with `break` at the first match. Cost depends on where the cue is, so tail positions and gaps are the worst cases. |
| `generateSentenceRomaji`, parser offline, kanji/kana sentence | Roughly linear: ~4 ms (34 chars, warm) and ~28 ms (~1,200 chars). A cold first call was ~24 ms. Cold and warm must be recorded separately. |
| Long unspaced Latin run (`'a'×6400`) | ~311 ms. Roughly linear, and slow enough to be worth a budget. |
| **`getWordReading('あ'.repeat(n))`** | OK at n ≤ 4,000. **Throws `RangeError: Maximum call stack size exceeded` at n = 5,000.** The recursion is inside the bundled WanaKana romaji transform. Reachability: a single click on a very long token, or an uploaded line that the segmenter keeps as one token. This is a measured risk to be classified, not yet a proven user-reachable defect. Case **R-X01** below. |
| Subtitle parsers with `'<'.repeat(n)` in a cue (VTT, SRT, LRC share the tag stripper `replace(/<[^>]+>/g,'')`) | 5,000 → 12 ms, 20,000 → 183 ms, 40,000 → ~790 ms. That is quadratic: a 4× size gives ~4.3× time, after a 15× jump for the earlier 4× step. A user-loaded subtitle file can freeze the page. Case **R-X02**. |
| LRC fixture sanity | Cue counts above 1,980 collapsed to 2,000 because my fixture used `mm` > 99. **Every generated fixture must assert `cues.length === expected` before it is measured.** |
| `tokenize` | Constructs a new `Intl.Segmenter` on every call (`content.js:777`). Count it. |
| Observers / timers | Content script: one `MutationObserver` over the whole `#movie_player` subtree plus a 1 s interval. Bridge: a 1 s interval on every YouTube page. |

Nothing here shows that the fallback reading path is slow on realistic input. The plan therefore measures it, and expects the likely outcome "linear, acceptable, plus two robustness defects (R-X01, R-X02)", rather than presupposing an optimisation.

---

## 1. Principles

1. **Execute shipped code.** Every case loads `content.js`, `js/youtube-bridge.js`, `background.js` or `js/japanese-parser.js` from disk and calls the real functions. A fix must be able to turn a case green only by changing production behaviour. The harness is never allowed to contain a second copy of an algorithm. A guard (§3.2) fails the run if the instrumented text is anything other than the shipped file plus a read/drive-only tail.
2. **Deterministic budgets first, wall time second.** Primary gates are operation counts: reads of cue fields, `Intl.Segmenter` constructions, WanaKana calls, outbound messages/requests by category, DOM creates/writes, listeners and observers alive, cache entries and bytes. Wall-clock numbers are collected with proper statistics but gate only as *scaling ratios inside one run* (e.g. time(4n)/time(n)), never as absolute milliseconds. Absolute latencies are marked SOFT and reported for context.
3. **Three target classes.** Each metric is labelled:
   - **GATE:** pass/fail; either a correctness property or a deterministic count.
   - **SOFT:** reported against a bound; a miss needs a written explanation, not an automatic fail.
   - **OBSERVE:** recorded in the baseline only, no target. This avoids inventing budgets for something nobody has shown to hurt.
4. **Baseline observations and acceptance targets live in different columns and different files.** The baseline run writes numbers. The target file is separate, and fix stage results compare against it. A target is never back-fitted to baseline output without an explicit note, and Sonnet's post-results review may adjust SOFT/OBSERVE targets once real baseline data exist. GATE correctness items (no throw, no leak, no duplicate request) are firm.
5. **Do not turn a risk into a defect without evidence.** R01/R02 items (§5) stay "risk" until a measured case crosses its bound. Any measured-and-failing item is promoted to a new defect ID (`X01…`) in the results report.
6. **Proportional scope.** No new dependencies and no bundler. Use Node's built-in test runner, `perf_hooks`, `vm`, and the already-installed `/usr/bin/chromium` driven by raw CDP over `WebSocket`, exactly as `tests/browser_custom_ai.mjs` does. No `package.json`, no npm install.

---

## 2. Layout, commands and artifacts

New files only (nothing existing is edited). Names deliberately avoid the `test_*.js` pattern so the existing `node --test tests/test_*.js` glob (86 tests) and `node run_tests.js` are untouched and stay green.

```
tests/perf/
  lib/shipped.js          # loads shipped sources into vm with counters (§3)
  lib/fakes.js            # fake DOM / storage / clock / fetch (§3.3)
  lib/stats.js            # warmup, repetition, median/MAD/p90, slope (§4.2)
  lib/env.js              # environment metadata (§4.1)
  fixtures/               # local-only, generated deterministically (§3.5)
  perf_p1_timeline.js     # one script per area; each emits NDJSON
  perf_p2_fallback_reading.js
  perf_p3_render_mutation.js
  perf_p4_requests.js
  perf_p5_lifetimes.js
  perf_p6_caches.js
  perf_p7_parsers.js
  perf_p8_browser.mjs     # real Chromium (§5.8)
  run_perf.mjs            # orchestrator: profiles, repetitions, JSON merge
  targets.json            # acceptance targets (separate from baseline)
tests/review/
  *.review.js             # regression cases, one file per theme (§6)
  browser_boundary.review.mjs  # real Chromium boundary cases (§3.4)
  lib/                    # may import ../perf/lib
  expected-baseline.json  # per case: expected "red"/"green" at baseline + witness regex (§7)
  run_review_matrix.mjs   # runs everything, classifies results (§7)
```

### 2.1 Exact commands

Run from the repository root. Node needs `--expose-gc` for the heap sections. Chromium is `/usr/bin/chromium`; override with `CHROMIUM_PATH`.

```bash
# 0. Preflight (must be clean and green before anything else; abort otherwise)
git rev-parse HEAD                      # expect 3187787fd723fa20686cb97523d3b5ab1ccaffab
git status --porcelain -- . ':!docs/reviews'   # expect empty (only new tests/perf, tests/review allowed)
node --test tests/test_*.js             # expect 86 pass (existing guard; keep running unchanged)
node run_tests.js                       # expect 15 suites pass
node tests/perf/run_perf.mjs --self-check      # harness validity, no measurement (<10 s)

# 1. Baseline performance — deterministic counters + timing, node-only part
node --expose-gc tests/perf/run_perf.mjs --profile baseline \
  --repeat-processes 3 --out docs/reviews/2026-10-28/results/baseline/perf

# 2. Baseline performance — real Chromium part (separate process, own profile)
node tests/perf/perf_p8_browser.mjs --out docs/reviews/2026-10-28/results/baseline/perf

# 3. Baseline regression matrix (expected-red tests allowed)
node tests/review/run_review_matrix.mjs --mode baseline \
  --out docs/reviews/2026-10-28/results/baseline/review

# 4. Re-run after fixes (same commands, --profile after / --mode after, other out dir)
```

`--profile quick` is a smoke profile (≈ one-fifth of the repetitions and the 50k-cue size dropped) for iterating on the harness; only `baseline`/`after` results are reportable.

### 2.2 Artifact paths (all untracked; Sol High must not `git add` them)

```
docs/reviews/2026-10-28/results/baseline/
  env.json                       # §4.1 (one per phase)
  perf/perf.json                 # merged machine-readable result (§4.3)
  perf/raw/<area>.<proc>.ndjson  # one line per sample
  perf/p8-browser.json
  review/review-matrix.json      # per-case classification and witness
  review/junit-like.txt          # node --test --test-reporter=spec stdout
  logs/*.log
docs/reviews/2026-10-28/results/after/   # same tree after fixes
docs/reviews/2026-10-28/test-results-report.md   # human report by Sol High
```

Add nothing to `.gitignore`; leave the `results/` directory untracked and say so in the report. The user has not asked for a commit.

---

## 3. Shared harness design

### 3.1 What is loaded

| Subject | How it is loaded | Notes |
| --- | --- | --- |
| `content.js` | `fs.readFileSync` then `vm.runInNewContext` in a sandbox, same technique as `createContentHarness` in `tests/test_review_regressions.js:14-130` | Real code, real closures. |
| `js/youtube-bridge.js` | `vm.runInNewContext` as in `tests/test_youtube_bridge_toggle.js` | Plus counters on the player stub. |
| `js/japanese-parser.js` | Real module, with `transport` replaced by a test double (as the existing tests do) | The transport is a boundary, not the tested logic. |
| `background.js` | `new Function('chrome', code)` with a chrome double, as `tests/test_background_crash.js` | Used for card-persistence and permission cases (§6). |
| `lib/wanakana.min.js`, `lib/yomitan-deinflector.js` | Real | WanaKana is wrapped in a counting `Proxy` (a dependency spy, not a reimplementation). |

### 3.2 The instrumentation tail and its guard

`content.js` is one IIFE. The existing tests append a driver object by replacing the closing `})();`. The new `lib/shipped.js` does the same, with these safeguards that the old harness lacks:

1. The tail may **read** state and **call** shipped functions. It must not assign to production functions or constants. Allowed writes: the same fixture setters the old harness uses (`activeVideoEl`, `subtitleTimeline`, `currentSubIndex`) and nothing else.
2. A guard asserts `instrumented === shippedWithoutTrailer + tail` and that the tail text matches a small allow-list grammar (identifier reads, calls, `return`). It throws `HarnessError('TAIL_NOT_PURE')` otherwise.
3. Every identifier the tail references is checked with `typeof` so that a rename in production shows up as `HarnessError('MISSING_SYMBOL: name')` and **not** as a green test.
4. The tail exposes: `getWordReading, generateSentenceRomaji, tokenize, segmentJapaneseSentence, renderSentenceTokens, onTimeUpdate, checkAndInitVideo, handleTokenClick, injectUI, setupLiveCaptionHooking, parseLRC, parseVTT, parseSRT, parseSubtitleFile, fetchSentenceTranslation, identifySongWithSensei, getOnPageCaptionTracks`, plus a read-only `snapshot()` returning `{currentVideoId, subtitleTimeline.length, currentSubIndex, renderedSentence, activeLiveSentence, drawerContextVersion, subtitleRenderVersion, lastAiData, sentenceTranslationCacheSize}`. Names are the baseline names; if Sol Max renames them, the tail's symbol list in one file is updated, with the guard unchanged.
5. Prefer driving through real entry points over tail calls when a real one exists: click handlers via captured listeners (`lp-ai-btn`, `lp-quick-anki-btn`, `lp-ai-anki-btn`), `timeupdate` via the listener `checkAndInitVideo` registers on the fake `<video>`, and the production `setInterval` callback via the captured timer. Tail calls are for pure functions (`getWordReading`, parsers).

### 3.3 Fakes and their limits

| Fake | Provides | Cannot show |
| --- | --- | --- |
| Fake DOM (`fakes.js`; extends the pattern in the old harness) | Element tree, `classList`, listeners with add/remove counters, counted `createElement/appendChild/innerHTML/textContent/removeChild`, `querySelector(All)` counters | Layout, style recalculation, real HTML parsing. **Its `innerHTML` setter must not strip tags with a regex like the old one** (`test_review_regressions.js:44-52`). For markup cases the fake is not used; Chromium is. |
| Fake `MutationObserver` | `observe/disconnect` pairs and a manual `deliver(records)`; counts live observers | Real record batching and real cost. Real cost is P8. |
| Fake clock | `setInterval/setTimeout` captured; tests call callbacks explicitly; `Date.now()` injectable | No timer drift, no real latency, no interleaving with real I/O. Overlap is created *by the test* with deferred promises, so ordering is adversarial by design rather than naturally occurring. Say so in the report. |
| Fake `fetch` / `chrome.runtime.sendMessage` | Deferred promises, per-category counters (caption endpoints, `translate.googleapis.com`, lyrics message, cloud AI hosts, local AI, AnkiConnect) | Real CORS, CSP, network timing. |
| Fake `chrome.storage.local` | **Async** callbacks, snapshot-on-read semantics, JSON-byte accounting, optional 10,485,760-byte quota with `chrome.runtime.lastError` set on overflow, write log | Real quota accounting nuances; Chromium (P8/§6.3) calibrates it. The old harness' synchronous storage hid A07, so synchronous storage is **not** used for any persistence case. |
| Fake player (bridge) | Stub with `loadModule/getOption/setOption`, counted | YouTube's real captions module. |

### 3.4 Real Chromium boundary fixture (used only where a fake would be dishonest)

Required for: A01 (page can read the credential field), A02 (markup actually becomes elements), A05 (real MAIN-world bridge plus real content script together), A08 (leftover DOM actually visible), real MutationObserver cost, P8 heap/listener/node counts, and real quota behaviour.

Mechanism, with no live YouTube and no real provider:

1. Launch `chromium --headless=new --no-sandbox --disable-gpu --disable-background-networking --user-data-dir=<mkdtemp> --load-extension=<repo> --remote-debugging-port=0`, as `tests/browser_custom_ai.mjs` does. Disposable profile, removed in `finally`.
2. Attach to a page target. Enable `Fetch.enable` with pattern `*` on that target. Navigate to `https://www.youtube.com/watch?v=FIXTUREVID01`. The Fetch handler **fulfils** requests whose host is `www.youtube.com` from local fixture HTML/JSON, and **fails every other request** with `Fetch.failRequest(errorReason: 'BlockedByClient')`. Interception happens before the network, so no packet leaves the machine, and no certificate is needed.
3. Because the URL matches the manifest's `*://*.youtube.com/*` pattern, Chromium injects the **real** MAIN-world bridge (`document_start`) and the **real** isolated-world `content.js`, with the real manifest. The fixture HTML defines a minimal `#movie_player` stub in the page (MAIN world) exposing `getOption/setOption/loadModule` with counters and a `<video>`, plus `.ytp-chrome-bottom`/`.ytp-right-controls`/`.ytp-subtitles-button` and `.ytp-caption-window-container`.
4. Page-script view (hostile-page model): `Runtime.evaluate` in the **default (MAIN) context** reads the DOM and the player stub. The isolated-world state is read through a second `Runtime.evaluate` with `contextId` of the extension's isolated world (from `Runtime.executionContextCreated`, `auxData.type === 'isolated'`). Extension storage is set from an `options.html` extension-origin target, as the existing runner does.
5. **Feasibility gate (step 0 of Sol High's work):** a 20-line smoke script proves that (a) `#linguaplay-yt-controls` or another `linguaplay-*` node appears in the fulfilled page, and (b) the MAIN-world bridge registered its listeners (`window.dispatchEvent(new CustomEvent('LINGUAPLAY_SET_APP_STATE', …))` changes the stub's behaviour). If injection into a Fetch-fulfilled document does not work in this Chromium build, fall back to the **existing** pattern (extension-origin page + evaluate `content.js` text) *for the isolated-world part*, add the bridge with `Page.addScriptToEvaluateOnNewDocument`, and **state in the report that the two-world boundary was not exercised**. Record `fixtureMode: "fetch-intercept" | "extension-page"` in `env.json`.
6. Timeouts: browser start 15 s, every `waitFor` ≤ 5 s with explicit message, whole script ≤ 90 s with a kill-switch. A timeout is `HARNESS_ERROR`, never a pass.

### 3.5 Local-only fixtures

All generated by code under `tests/perf/fixtures/` with a seeded PRNG (`mulberry32(0x5eed)`). Nothing is downloaded, no real provider, no real song or caption text from third parties.

- `ja-corpus`: 1,000 distinct lines (10–60 chars) assembled from the phrase arrays already inside `run_tests.js` (`TEST_PHRASES`) and `data/kanji-dict.js` words (repo-owned text). The generator also builds mixed-script, numeric and punctuation lines.
- `timelines`: sorted, non-overlapping cue arrays of 500 / 5,000 / 50,000 cues (3 s spacing, 2 s duration, short and long texts), generated as VTT text and as objects. Use VTT or objects only; LRC `mm` is capped at 99 so large LRC needs `[mmm:ss]` support first, which it lacks (§0). Every generator returns its expected length and the run asserts it.
- `adversarial strings`: unspaced hiragana, `食べ`×n, `鬱`×n, Latin run, katakana with `ー`, `っ`/`ッ` runs, surrogate-pair emoji, markup-like text (`'<'×n`, `<img src=x onerror=…` without `>`, quotes, ampersands), digits, whitespace-only, zero-width characters, 1 MB single line.
- `caption-json`: embedded-script strings for `getOnPageCaptionTracks` (flat tracks, `name.runs` nested, escaped brackets/quotes inside strings, two videos' data).
- `mock AI/Anki servers`: tiny `http.createServer` on `127.0.0.1:0` inside the test, recording requests; AnkiConnect stub returns `{result:…,error:null}` and `{error:'deck was not found'}` on demand.

---

## 4. Environment, repetition and statistics

### 4.1 `env.json` (written by `lib/env.js`, once per phase)

```json
{
  "phase": "baseline|after", "startedAt": "ISO-8601", "gitHead": "3187787…",
  "gitDirty": false, "newFilesOnly": true,
  "sha256": {"content.js": "", "background.js": "", "js/youtube-bridge.js": "", "js/japanese-parser.js": "", "manifest.json": "", "build_content_js.py": ""},
  "node": "v26.8.1", "v8": "", "platform": "linux", "kernel": "", "arch": "",
  "cpuModel": "", "cpuCount": 8, "loadavg": {"before": [], "after": []},
  "memTotalMB": 0, "memAvailableMBBefore": 0,
  "cpuGovernor": "read from /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor or null",
  "chromiumPath": "/usr/bin/chromium", "chromiumVersion": "", "fixtureMode": "",
  "nodeFlags": ["--expose-gc"], "calibration": {"msBefore": 0, "msAfter": 0, "cvPct": 0},
  "commandLine": [], "seed": "0x5eed"
}
```

The **calibration loop** is a fixed pure-JS workload (e.g. 5 × 2 M iterations of integer mixing) timed 5 times before and 5 times after the run. It is recorded, never gated. It is used by the report to say "this machine was ~X% slower/noisier than the other run". `loadavg > cpuCount × 0.7` before start adds `"noisy": true` and the orchestrator waits up to 30 s for it to fall, then proceeds and flags it.

### 4.2 Repetition and statistics (`lib/stats.js`)

- **Warmup:** 5 untimed calls of the measured operation (cold first-call latency is *recorded separately* as sample 0, from a fresh `vm` context in a fresh child process).
- **Measured repetitions:** 15 per (workload × size) in profile `baseline`; 5 in `quick`. Each repetition uses a fresh, deterministic state where the case requires it (fresh sandbox for stateful cases) and `global.gc()` between repetitions when memory is recorded.
- **Process repetitions:** the whole node-only suite runs in 3 separate child processes (`--repeat-processes 3`), because JIT state and GC differ per process.
- **Reported per metric:** `n, min, median, mean, p90, max, mad, cvPct`. Use `process.hrtime.bigint()`, and sum per-call time for small ops (batch ≥ 1 ms per sample so the clock resolution is not the signal). Also record `process.cpuUsage()` deltas and `perf_hooks.monitorEventLoopDelay` (resolution 1 ms) for the longest synchronous block of a single call (`maxBlockMs`).
- **Scaling slope:** between consecutive sizes `n1 < n2`, `slope = log(median2/median1) / log(n2/n1)`. Linear → ~1, quadratic → ~2. A timing-slope gate fails only when `slope > bound` in **at least 2 of 3 processes** and the effect is larger than `3 × mad`. Otherwise it is reported as "noisy".
- **Heap:** `v8.getHeapStatistics().used_heap_size` after `gc()` before and after a block; report the delta and bytes per item. Never gate on a single heap number; gate on item counts (cache entries, listeners) instead, and on a heap delta only as SOFT.
- **Precision rule:** if the CV of a timing sample exceeds 25 %, the report must say the metric is noisy and must not draw a pass/fail conclusion from it. Deterministic counts have CV 0 by construction; a count that varies between repetitions is a harness defect and is `HARNESS_ERROR`.

### 4.3 Machine-readable output (`perf.json`)

```json
{
  "schema": 1, "phase": "baseline", "env": "<relative path to env.json>",
  "results": [
    {
      "id": "P1.play.tail.n50000", "area": "P1", "scenario": "monotone playback, tail region",
      "workload": {"cues": 50000, "updates": 1200, "seed": "0x5eed"},
      "counts": {"cueFieldReads": {"total": 0, "perUpdate": {"median": 0, "max": 0}}, "renderCalls": 0},
      "timeMs": {"n": 15, "min": 0, "median": 0, "p90": 0, "max": 0, "mad": 0, "cvPct": 0, "coldFirstCall": 0},
      "slope": {"from": "n5000", "value": 0.0, "noisy": false},
      "memory": {"heapDeltaBytes": 0},
      "class": "GATE|SOFT|OBSERVE",
      "target": {"ref": "targets.json#P1.play.tail.cueFieldReadsPerUpdate", "bound": null, "verdict": "n/a|pass|fail|noisy"}
    }
  ],
  "harnessErrors": [], "warnings": []
}
```

At baseline the `target.verdict` field is computed too (so the red/green state is visible), but the **baseline phase report must print "baseline observation" in a separate table from "target comparison"**.

---

## 5. Performance suite

Everything in §5.1–§5.7 runs in Node (fake DOM) and costs seconds; §5.8 uses Chromium. For each area: workload, what is counted, baseline observation to collect, then proposed targets with class and the fix-neutral reason.

### P1 — Long timelines, `timeupdate`, seek (`perf_p1_timeline.js`)

**Subject:** shipped `onTimeUpdate` (`content.js:3542-3564`), reached via the `timeupdate` listener that `checkAndInitVideo` attaches to the fake `<video>`, plus timeline install from the real cached-lyrics path (`parseLRC`) or the real subtitle-file path for ≤ 1,980 cues and objects via the existing `setPlayback`-style setter for larger ones.

**Instrumentation without rewriting the algorithm:** cue objects have accessor properties `start`/`end` that increment counters, so every comparison made by the shipped loop is counted. A second, separate run uses plain data properties to take timing (accessors distort timing; counters and timing are never taken in the same sample).

**Workload sizes:** N ∈ {500, 5,000, 50,000} cues.

| Scenario | Sequence |
| --- | --- |
| `play.head` | 1,200 monotone updates (300 s at 4 Hz) starting at cue 0 |
| `play.tail` | 1,200 monotone updates starting 1,200 cues before the end (worst case for a linear scan) |
| `seek.random` | 300 seeks, seeded uniform over [0, duration], mixed forward/backward |
| `seek.gap` | 300 updates landing in gaps (no cue), the full-scan case |
| `same.cue` | 1,200 updates inside one cue (guard: no re-render) |
| `replace.timeline` | install timeline B (same length, different text) then update at the same time (feeds R-A04) |

**Counts:** cue-field reads per update (median and max), `renderSentenceTokens` calls (observed via counted `innerHTML`/`createElement` on `linguaplay-yt-tokens` and via the `subtitleRenderVersion` delta), install cost (time and reads for `parseLRC` + assignment).

**Correctness oracle (GATE, independent of speed):** for sorted, non-overlapping fixtures, the cue chosen at each probe time must equal the oracle computed in the test (`first i with start <= t <= end`, i.e. the baseline semantics), observed as the rendered sentence. For overlapping or duplicated timestamps use a **characterisation fixture**: record baseline behaviour (first matching cue in array order) in `baseline-golden.json`; a changed result after fixes is flagged for review, not auto-failed.

**Baseline observations to collect:** reads/update by scenario and N, time/update by N, slope, `maxBlockMs`.

**Proposed targets (`targets.json`):**

| Id | Class | Bound | Rationale |
| --- | --- | --- | --- |
| `P1.same.renderCalls` | GATE | 0 extra renders over 1,200 same-cue updates | Already true; protects against a regression from an optimisation. |
| `P1.oracle` | GATE | 100 % match on sorted fixtures, all scenarios | Any lookup rewrite must preserve behaviour. |
| `P1.seek.cueFieldReadsPerUpdate.n50000` | GATE | ≤ 64 (median and max), i.e. ~4×log2(50,000), at least three orders of magnitude below the ~50,000 baseline expectation | Algorithm-neutral: binary search, cached index, or interval structure all satisfy it. Counted only on the lookup path; one-off install may use O(n). |
| `P1.play.cueFieldReadsPerUpdate.n50000` | GATE | ≤ 16 median, ≤ 64 max | Monotone playback is the hot path. |
| `P1.install.reads` | SOFT | ≤ 4 × N reads at install | Prevents an index build that is itself quadratic. |
| `P1.time.slope` | SOFT | ≤ 0.35 for per-update time vs N (O(log n) or better) | Timing corroboration only; a noisy verdict does not fail. |
| `P1.update.p90ms.n50000` | OBSERVE | none | Show absolute cost; do not gate on speed of machine. |

### P2 — Fallback Japanese readings and romaji when the parser is offline (`perf_p2_fallback_reading.js`)

**Subject:** shipped `getWordReading`, `generateSentenceRomaji`, `tokenize`, `segmentJapaneseSentence`, and `renderSentenceTokens` end to end, with `LinguaPlayParser` created with a transport that always rejects (offline) so `japaneseParser.cached()` returns nothing and `japaneseParser.romaji()` returns `null`. Also a second configuration with `LinguaPlayParser` undefined.

**Workloads:**

| Id | Input |
| --- | --- |
| `typical` | 1,000 distinct corpus lines of 10–60 chars; sentence romaji with and without a target word; `renderSentenceTokens` per line |
| `long` | single lines of 200, 1,000, 4,000, 16,000 chars of mixed kanji/kana/Latin/digits |
| `adv.hira` | `'あ'×n` unspaced, n ∈ {1,000, 4,000, 8,000, 16,000} through `getWordReading` (word click) and through `generateSentenceRomaji` (drawer) |
| `adv.verb` | `'食べ'×n`, n ∈ {100, 400, 1,600} (deinflection scan) |
| `adv.kanjiUnknown` | `'鬱'×n`, n ∈ {100, 400, 1,600} |
| `adv.latin` | `'a'×n`, n ∈ {400, 1,600, 6,400} |
| `adv.kata` | `'ア'×n` and `'ー'`-heavy runs |
| `adv.sokuon` | `'っ'`/`'ッ'` runs (exercises the merge loop at `content.js:690-697`) |
| `adv.target` | long text where the target word occurs at every token (highlight `replace`) |
| `adv.surrogate` | emoji and astral-plane characters mixed with kana |

**Counts (GATE-capable):** WanaKana calls (via counting Proxy), `Intl.Segmenter` constructions (sandbox `Intl` replaced by a counting subclass that delegates to the real implementation), exceptions thrown, output length / input length ratio, `maxBlockMs` of one call. Timing: warm median per size, cold first call, slope.

**Baseline observations to collect:** per-call time vs size, the exact size where `adv.hira` begins throwing (record the threshold with a bisection ≤ 10 steps), segmenters per 1,000 renders, WanaKana calls per sentence.

**Proposed targets:**

| Id | Class | Bound |
| --- | --- | --- |
| `P2.noThrow.allAdversarial` | GATE | 0 uncaught exceptions for every input in the table up to 16,000 chars, from every entry point used by UI handlers (`getWordReading`, `generateSentenceRomaji`, `tokenize`, `renderSentenceTokens`). A reading that cannot be computed returns a safe fallback (the surface itself), never `RangeError`. |
| `P2.correctness.sample` | GATE | For the 1,000-line `typical` corpus, output is **byte-identical** to the baseline run (`baseline-golden.json`), except where Sonnet's later review explicitly approves a change. Prevents "fast but different". |
| `P2.segmenterPer1000Renders` | GATE | ≤ 10 `Intl.Segmenter` constructions per 1,000 `renderSentenceTokens` calls. This is a deterministic proxy for a cached segmenter; the baseline is expected at 1,000. |
| `P2.wanakanaCallsPerChar` | SOFT | ≤ baseline; report ratio |
| `P2.slope.long` | SOFT | per-char time slope ≤ 1.25 over 1,000 → 16,000 chars (no quadratic behaviour) |
| `P2.typicalLine.p95ms` | SOFT | ≤ 16 ms warm on this machine (one frame). Reported with the calibration value; not portable and not a gate. |
| `P2.coldFirstCallMs` | OBSERVE | none |

### P3 — Unchanged-cue and mutation render work (`perf_p3_render_mutation.js`, plus P8 for real costs)

**Subject:** `renderSentenceTokens`, `onTimeUpdate`, `setupLiveCaptionHooking` (`content.js:2111-`) with the fake MutationObserver, `injectUI`/`ensurePlayerControls` called by the 1 s tick.

**Scenarios and counts:**

| Id | Scenario | Counted |
| --- | --- | --- |
| `P3.sameText` | `renderSentenceTokens(sameText)` ×1,000 (what a repeated live caption or a re-render request would do) | `createElement`, `appendChild`, `innerHTML` writes, `japaneseParser.request` calls |
| `P3.liveObserver.unrelated` | 2,000 fake mutation deliveries with no caption nodes changing, timeline empty | callback runs, `document.querySelector/All` calls, `renderSentenceTokens` calls |
| `P3.liveObserver.caption` | 50 genuine caption text changes interleaved with 1,000 unrelated deliveries | renders must equal 50 |
| `P3.idleTick` | 300 production interval ticks (`checkAndInitVideo`) on a stable page with a loaded video | DOM creates/appends/style writes per tick, `injectUI` work, `ensurePlayerControls` writes |
| `P3.hiddenOverlay` | same as idle with overlay hidden | same |
| `P3.reparseStorm` | parser offline, `retry()` repeatedly (as `startServerOnPlayback` does on `playing`) with unchanged sentence | re-render count |

**Baseline observations:** counts above; whether idle ticks write DOM when nothing changed; observer callback → query ratio.

**Proposed targets:**

| Id | Class | Bound |
| --- | --- | --- |
| `P3.sameText.domWrites` | SOFT | ≤ 1 rebuild for 1,000 identical renders when the parser state did not change. The baseline rebuilds each time. Skipping is optional; it must not break parser-upgrade re-render (guarded by the existing late-parser tests). |
| `P3.liveObserver.caption.renders` | GATE | exactly 50 (no lost, no extra) |
| `P3.liveObserver.unrelated.renders` | GATE | 0 |
| `P3.idleTick.domWrites` | GATE | 0 DOM creates/appends/`style`/`class` writes per tick after the first steady tick. Corroborated in P8 with real mutation records. |
| `P3.liveObserver.queriesPerUnrelated` | OBSERVE | none (narrowing the observer root is a design option, not a requirement) |

### P4 — Duplicate acquisition and stale analysis work (`perf_p4_requests.js`)

Operation-count tests: each outbound action in the fake `fetch`/`sendMessage` is classified. These double as the performance side of A03/A04/A10.

| Id | Scenario | Counted | Baseline expectation (to be confirmed) |
| --- | --- | --- | --- |
| `P4.overlapTicks` | `checkAndInitVideo` ×5 (as five 1 s ticks) with the caption request deferred | `FETCH_LRCLIB_LYRICS`, `identifySongWithSensei` provider calls, caption requests, translate calls | ≥ 1 lyrics message while captions pending |
| `P4.steadyNoCaptions` | 60 ticks (simulated minute) on a video with no captions and a failing lyrics provider | requests per class, per video | observe whether it stays bounded |
| `P4.captionFailureRetries` | caption fetch returning errors with deferred timeouts | retry count per class | observe |
| `P4.askSenseiRepeat` | `lp-ai-btn` clicked ×5 with the same context and a deferred provider | model requests | 5 expected |
| `P4.askSenseiSwitchContext` | click, select another word, resolve first late | model requests, `lastAiData` owner, saved card content | stale overwrite expected (feeds R-A03) |
| `P4.navStormPending` | 50 navigations with pending caption/lyrics/AI work | late-result writes to state after navigation (count) | observe |
| `P4.translationCache` | 200 unique clicks then 200 repeats | translate requests | repeat hits expected |

**Targets:**

| Id | Class | Bound |
| --- | --- | --- |
| `P4.overlapTicks.lyricsDuringCaptions` | GATE | 0 lyrics/AI-identification messages or requests while caption acquisition for the same video is pending |
| `P4.acquisition.perVideoPerSource` | GATE | ≤ 1 request per (video, source class) in 60 s with a stable page unless a retry is explicit and bounded (≤ 3) |
| `P4.askSenseiRepeat.modelRequests` | GATE | ≤ 1 in-flight request per (provider, word, sentence, context version) |
| `P4.staleWrites` | GATE | 0 writes of results from a superseded context to `lastAiData`, DOM, or card storage |
| `P4.translationCache.repeatRequests` | GATE | 0 translate requests for 200 repeats (already true; protects against a bounded-cache regression) |

### P5 — Watch-page and bridge lifetimes (`perf_p5_lifetimes.js` Node; counts re-verified in P8)

**Bridge (real `js/youtube-bridge.js`, fake player and `setInterval` capture):**

| Id | Scenario | Counted |
| --- | --- | --- |
| `P5.bridge.steady` | app enabled, track already Japanese, CC on; run the captured poll ×60 | `loadModule`, `getOption`, `setOption`, CC `click` calls |
| `P5.bridge.nonWatch` | no `#movie_player` (home page); poll ×60 | player lookups, calls |
| `P5.bridge.registered` | after load | number of intervals/timeouts and window listeners registered |

**Content script (real `content.js`, fake `<video>` with counted add/removeEventListener, fake MO, captured intervals):**

| Id | Scenario | Counted |
| --- | --- | --- |
| `P5.content.navigations` | 50 alternating `?v=A` / `?v=B` navigations through `checkAndInitVideo` with video element changes | net listeners on old and new `<video>` (adds − removes), live observers, live intervals |
| `P5.content.leaveWatch` | after video A with drawer open, set location to `/` and run the tick and `yt-navigate-finish` | listeners on A's `<video>`, observers connected, overlay/drawer class state, pending request count |
| `P5.content.nonWatchTicks` | 60 ticks on a non-watch URL | work done per tick |

**Targets:**

| Id | Class | Bound |
| --- | --- | --- |
| `P5.bridge.steady.mutations` | GATE | 0 `setOption` and 0 CC `click` per poll when the selected track and CC already match the desired state. (Already true. This protects A05.) |
| `P5.bridge.steady.loadModule` | SOFT | ≤ 1 per poll (baseline 1); fewer is welcome |
| `P5.content.navigations.listenerDelta` | GATE | 0 net growth after the 50th navigation compared with the 5th; at most 1 live `MutationObserver`; exactly the production number of intervals |
| `P5.content.leaveWatch.cleanup` | GATE | after leaving `/watch`: 0 listeners on the old `<video>` from this extension, 0 connected observers, overlay `active` removed, drawer hidden, `lastAiData` cleared. (Feeds A08.) |
| `P5.persistentTimers.nonWatch` | OBSERVE | record baseline: 2 intervals (bridge, content) kept on non-watch pages. Reducing it is a *design option* that must not break A08/A05. |

### P6 — Cache growth (`perf_p6_caches.js`; real quota in P8)

| Id | Scenario | Counted |
| --- | --- | --- |
| `P6.translationCache` | drive `fetchSentenceTranslation` through the production path for K ∈ {100, 1,000, 10,000} unique 120-char sentences (translate endpoint answered by the fake) | `sentenceTranslationCache` size (read-only accessor), heap bytes after `gc()` per entry |
| `P6.lyricsCache.count` | for M ∈ {50, 500} different `?v=` ids, run `checkAndInitVideo` with the lyrics message returning an 8 KB LRC | number and bytes of `lp_lyrics_cache_*` keys in the fake storage, write log |
| `P6.lyricsCache.pressure` | M = 500 with 200 KB LRC (stress) against the 10,485,760-byte quota double, with 200 pre-seeded saved cards (~100 KB) and settings keys | which writes fail with `lastError`; whether cards/settings survive; whether the UI shows failure |
| `P6.cards.perSaveBytes` | N ∈ {100, 500, 2,000} sequential Quick Add clicks | bytes written per save (whole-array rewrite cost) |
| `P6.offsetKeys` | 500 videos with timing offsets | keys written |

**Targets:**

| Id | Class | Bound |
| --- | --- | --- |
| `P6.translationCache.size` | GATE | after K = 10,000: ≤ 2,000 entries; and the most recent 50 sentences are still hits (no refetch). Any bounded recency policy satisfies it. |
| `P6.lyricsCache.bytes` | GATE | after M = 500 × 8 KB writes: total `lp_lyrics_cache_*` bytes ≤ 2.5 MB (25 % of quota) |
| `P6.lyricsCache.pressure.cards` | GATE | 0 saved cards lost, settings writes still succeed; cache is the thing that is evicted |
| `P6.writeFailureVisible` | GATE | a failed `storage.local.set` (lastError) is not reported to the user as success (links to A07/R01) |
| `P6.cards.perSaveBytes` | OBSERVE | record the O(n) cost; do not demand a storage redesign |
| `P6.offsetKeys` | OBSERVE | record |

Until `P6.lyricsCache.*` fails at baseline, R01 stays "risk"; a failure promotes it to defect `X-R01`.

### P7 — Subtitle parsers on large and adversarial files (`perf_p7_parsers.js`)

Shipped `parseVTT/SRT/LRC/parseSubtitleFile` through `tests/content_subtitle_helpers.js`'s technique (slice of `content.js`) **or** the tail, whichever Sol High prefers; the slice technique runs shipped text but cannot see later renames, so the tail with `MISSING_SYMBOL` guard is preferred.

| Id | Input |
| --- | --- |
| `P7.cues` | VTT and SRT of 1,000 / 10,000 / 50,000 cues (assert `cues.length` equals expected) |
| `P7.tagStrip` | one cue containing `'<'×n`, n ∈ {5,000, 20,000, 40,000, 160,000} in each format |
| `P7.longLine` | 1 MB single line without newline |
| `P7.manyBlankLines` | 200,000 blank lines |
| `P7.hugeLrcOffsets` | many multi-timestamp lines (`[00:01.00][00:02.00]…`) |

**Targets:**

| Id | Class | Bound |
| --- | --- | --- |
| `P7.tagStrip.slope` | GATE | per-character time slope ≤ 1.3 across 20,000 → 160,000 (baseline slope ~2). Alternative proof, preferred when timing is noisy: parse of `'<'×160,000` completes in ≤ 8× the time of `'<'×20,000`. |
| `P7.tagStrip.outputEquivalent` | GATE | for the existing parser tests' markup samples (`<i>…</i>`, `<c.colorFFFFFF>`), output is unchanged |
| `P7.cues.slope` | SOFT | ≤ 1.2 |
| `P7.cues.lengthAsserted` | GATE (harness) | every generated fixture parses to the expected cue count; otherwise `HARNESS_ERROR` |

### P8 — Real Chromium measurements (`perf_p8_browser.mjs`, ~60–90 s)

Uses §3.4 (preferably `fetch-intercept` mode; otherwise the extension-page mode with the stated limitation). Each metric is read via CDP `Performance.getMetrics` (`Nodes`, `JSEventListeners`, `JSHeapUsedSize`, `LayoutCount`, `RecalcStyleCount`, `TaskDuration`) after `HeapProfiler.collectGarbage`.

| Id | Scenario | Counted |
| --- | --- | --- |
| `P8.idle` | 10 s steady watch page, video loaded, overlay shown, no captions changing | extension-owned `MutationObserver` records (a second observer in the page world, filtered to `linguaplay-*` nodes and attributes), layout/style recalc counts, long tasks (> 50 ms) from `PerformanceObserver` in the isolated world |
| `P8.captionChurn` | 50 genuine caption changes plus 2,000 unrelated `#movie_player` subtree mutations in 10 s (progress bar, tooltips) | observer callback invocations (wrapper in the extension-page mode), renders, task duration, long tasks |
| `P8.navigations` | 30 SPA navigations (`history.pushState` + `yt-navigate-finish`) with a drawer opened on each | `Nodes`, `JSEventListeners`, `JSHeapUsedSize` at navigation 5 vs 30 after forced GC |
| `P8.quota` | fill `chrome.storage.local` with a filler key to within ~2 KB of `QUOTA_BYTES` (10,485,760), then Quick Add | storage write result vs UI text (feeds R-A07) |
| `P8.hostileRead` | reading `.value` of the credential field from MAIN world (A01) | boolean |

Targets: `P8.idle.ownRecords` GATE = 0 extension-owned mutation records per idle second after settle (detects self-feedback loops; the reviewers' suspected empty-`innerHTML` loop did not reproduce, so this should pass at baseline and guards optimisations). `P8.navigations`: `Nodes(30) − Nodes(5) ≤ 50` GATE; `JSEventListeners(30) − JSEventListeners(5) ≤ 5` GATE; heap delta after GC reported SOFT (≤ 2 MB). `P8.captionChurn.longTasks` SOFT = 0 tasks > 100 ms; reported with calibration. Everything else OBSERVE. A baseline pass is a legitimate finding: "no leak established, as the review said".

---

## 6. Targeted regression suite (separate from performance)

These are correctness/security cases. They assert the **desired** behaviour, so every case that reproduces a finding is **red at baseline** and must turn green when the defect is fixed. Each case id embeds the finding id (`R-A03-…`). Each also has a **control** case (same harness, benign input) that must be green at baseline, proving the harness can observe the thing.

Conventions:

- Files `tests/review/<theme>.review.js`, run by `node --test tests/review/*.review.js`; browser ones by `.mjs`.
- Each case records a `witness` object (observed values) into `review-matrix.json` through `t.diagnostic(JSON.stringify(...))` plus a side file, so a red result can be checked against the expected failure signature (§7).
- Where the desired behaviour can be satisfied by different implementations, the case asserts the **outcome** (e.g. final stored cards, outbound requests), not an internal function name. That keeps Sol Max free to choose a small fix.

### 6.1 Reuse of existing helpers and how their blind spots are avoided

| Existing helper | Reuse | Blind spot to avoid |
| --- | --- | --- |
| `createContentHarness` (`tests/test_review_regressions.js`) | Pattern for loading `content.js`, deferred fetch, handler capture | Its `Element.innerHTML` setter strips tags with a regex and fabricates children from `id="…"`, so it **cannot see markup injection**. All text-sink cases (A02) use real Chromium or a minimal real HTML parser in the page, not this fake. Its `chrome.storage` is synchronous: persistence cases use the async snapshot storage double (§3.3). `setInterval`/`setTimeout` are no-ops: use the captured-callback clock. |
| `tests/test_youtube_bridge_toggle.js` | Bridge loading pattern | It never covers the hidden-overlay state; add the event the fix will use **by outcome** (see A05). |
| `tests/content_subtitle_helpers.js` | Slice-based loading of parsers | Slice boundaries are string markers; a refactor silently breaks them. Use the tail guard. |
| `tests/browser_*.mjs` | Chromium launcher, CDP `evaluate` | Extension-origin fixture, not the two real worlds. Use §3.4 for boundary cases. |
| `run_tests.js` | Phrase corpora only | Its algorithms are a separate fork (A12). Do not call its functions. |

### 6.2 Case list

Format: **ID — finding — harness — action — desired assertion — baseline expectation (witness)**.

**A01 credential DOM (P1)** — *real Chromium boundary*
- `R-A01-1`: trigger a non-local provider failure with no key (cloud provider selected, no key). Assert the host-document DOM contains **no** `input[type=password]`, no element with id `lp-inline-api-key`, and that a main-world script can read **no** secret-bearing field. Desired: key entry is routed to the Options page action (`lp-go-options-btn` equivalent), which exists.
- Control `R-A01-0`: same page, the “Open settings” affordance is present and clickable (opens options via the worker stub).
- Baseline: red, witness `passwordFields: 1`, `mainWorldValue === 'dummy-review-secret'` after the test assigns a dummy value (never a real key).

**A02 text sinks and card serialization (P1)** — *real Chromium + string-level for exports*
- `R-A02-1..n` (parametrised over payloads `<img data-injected src=x onerror=…` with no `>`, `"><svg data-injected>`, `&amp;`, `</div><b>`, quotes in attributes): for each sink, set the external string and assert **no element with `data-injected` and no new attribute from the payload exists** anywhere in the document, and visible text equals the payload verbatim. Sinks: cue text highlight in the drawer (`lp-sentence-jp`, `lp-chat-context-sentence`), fallback romaji (`generateSentenceRomaji` result inserted), `renderPedagogicalBreakdown` (`word`, `meaning`, `title=`), error banner and identified-song banner (LRCLIB/Kugou `trackName`/`artistName`, LLM output, error messages).
- `R-A02-card-A`: Quick Add AnkiConnect payload built from a sentence/def containing markup: the `Back`/`Front` field must contain the markup **escaped**, never as live tags (assert by parsing the field in the page). Desired outcome-level: `fields.Back` has no unescaped `<img`.
- `R-A02-card-B`: TSV exports (Options and popup) for a card containing markup, tabs, newlines, quotes: the exported bytes must escape the HTML fields and keep column count equal for every row. Run the real `popup.js`/`options.js` export functions in the extension-origin page with a fake `chrome.storage` seed; read the Blob bytes.
- Control `R-A02-0`: the same payload through the chat Markdown path (already escaped) shows no element, so the detector works.
- Baseline: red for the sinks the reviews cite; witness includes injected tag name. The control must be green. If the control is red the harness is wrong (§7).

**A03 AI request identity (P2)** — *Node, production handlers, deferred responses*
- `R-A03-stale`: select 猫 → click `lp-ai-btn` → select 犬 → resolve the 猫 request late. Desired: `lastAiData`/the results pane/the provider badge never show 猫's meaning under 犬; saving the enriched card never persists `CAT_FROM_OLD_REQUEST` with 犬.
- `R-A03-dup`: click `lp-ai-btn` ×3 with same context. Desired: ≤ 1 model request in flight (the P4 gate, asserted as correctness too).
- `R-A03-error-late`: same as stale but the first request fails after the switch: the error UI must not replace the new context's view.
- Control: sequential clicks for the same word apply the response normally.
- Baseline: red, witness `lastAiData.contextual_meaning === 'CAT_FROM_OLD_REQUEST'`.

**A04 caption/source priority (P2)** — *Node with deferred completion*
- `R-A04-overlap`: described in P4; desired no lyrics/AI request while captions pending.
- `R-A04-priority`: captions arrive (猫), then late lyrics (犬) for the same video. Desired: timeline keeps captions (or follows a documented priority).
- `R-A04-manual`: user uploads a subtitle file (or picks a modal search result) and a late automatic result arrives. Desired: the manual choice wins.
- `R-A04-sameIndex`: install a new timeline while `currentSubIndex` is unchanged. Desired: the rendered cue text becomes the new timeline's text at the next update (no stale token DOM).
- Control: late result for a **different** video is dropped (already true).
- Baseline: red for overlap, priority, manual, sameIndex.

**A05 hidden-overlay bridge ownership (P2)** — *Node (real bridge) plus Chromium (both worlds)*
- `R-A05-node`: real bridge, enabled; user state: overlay hidden through the real eye-click handler of `content.js` (Node harness with both scripts sharing a fake `window` event bus), then the player stub has track = English and CC = off; run polls ×3. Desired: `selected` stays English and CC stays off. Assert by outcome, so it is satisfied whether the fix uses a new event, a changed existing event or a stored flag.
- `R-A05-browser`: the same in the fetch-intercept page with the real MAIN-world bridge and a real 1 s poll (wait ≤ 3.5 s; deterministic because the stub counts calls).
- Control: with the overlay **visible** and the app enabled, an English track is switched to Japanese by the poll (current intended behaviour) and the app-OFF behaviour in the existing test remains.
- Baseline: red, witness `{cc:true, selected:'ja'}` after polling.

**A06 normalised Anki routing, reading, status (P2)** — *Node with real AnkiConnect stub*
- `R-A06-route`: set `linguaplay_anki_deck=MyDeck`, `linguaplay_ankiconnect_url=http://127.0.0.1:<stubPort>`; click Quick Add. Desired: the stub receives `addNote` with `deckName: 'MyDeck'` at the configured URL, not 8765.
- `R-A06-enriched`: click enriched save with the stub up. Desired: an `addNote` request reaches the stub (or the UI states it was saved locally only; the assertion accepts exactly one of the two documented outcomes and fails if the label says Anki while no request was made).
- `R-A06-reading`: select 来ない with displayed reading `こない (konai)`; Quick Add. Desired: the stored card's `reading` is the kana reading, not `来ない`; the TSV `reading` column equals it; `romaji` is preserved and exported in the same way by Options and popup.
- `R-A06-status`: stub returns `{error:'deck was not found'}` and, in a second case, is offline. Desired: the button shows a failure state, not “Saved to Anki”.
- `R-A06-envelope`: AI response `{status:'success', data:{…}}` vs a bare object, and `reading` at top level vs `target_word.reading`; the enriched card must contain the reading in both.
- `R-A06-exporters`: Options and popup exporters produce **identical** bytes for the same card set (same columns, same escaping).
- Control: with default settings and stub on 8765? Use only a stub port; the control sets URL to the stub and the **default deck** and expects `LinguaPlay`.
- Baseline: red for route, enriched, reading, status, exporters.

**A07 serialized cross-tab persistence and clear errors (P2)** — *Node with `background.js` and async storage double; one Chromium case for quota*
- `R-A07-concurrent`: two content-script instances (two harnesses sharing one async storage double and, if the fix uses messaging, one production `background.js` listener wired to both `chrome.runtime.sendMessage` stubs) each click Quick Add for different words at the same tick; 10 repetitions with the double's read/write latencies randomised by the seeded PRNG. Desired: the final `linguaplay_cards` contains **both** words every time. This asserts the outcome and is neutral to whether the fix is worker-serialisation, unique keys, or a lock.
- `R-A07-clearRace`: Clear Collection (Options) concurrent with a delayed save. Desired: the final state is deterministic (either cleared with the save after it, or the save lost, but never a resurrected cleared list from a stale snapshot). Assert “no card present that was saved before clear and absent after”, i.e. cleared cards never reappear.
- `R-A07-failure`: the storage double returns `lastError` on `set`. Desired: UI does not show “Saved”; error surface text visible. Browser variant uses real quota (P8.quota).
- `R-A07-clearError`: `set` fails during Clear. Desired: Options shows failure, not success.
- Control: one save into an empty collection persists exactly one card.
- Baseline: red; witness `finalCards.length === 1` for the concurrent case.

**A08 navigation dispose (P2)** — *Node + Chromium*
- `R-A08-newVideo`: select 猫 on A, navigate to B with B's caption fetch deferred. Desired: overlay inactive, token container empty, drawer hidden/reset, `lastAiData` cleared **synchronously** after the first tick on B.
- `R-A08-leaveWatch`: on A with drawer open, navigate to `/` (no `v`). Desired: same cleanup, plus 0 listeners on A's `<video>`.
- `R-A08-backForward`: A → B → A via `popstate`; no leftover B context.
- Control: B's own captions appear after load (existing behaviour).
- Baseline: red; witness `overlayActive: true, token: '猫'`.

**A09 nested JSON extraction (P2)** — *Node, shipped `getOnPageCaptionTracks`*
- `R-A09-runs`: script text with `"captionTracks":[{"baseUrl":"…","name":{"runs":[{"text":"Japanese"}]},"languageCode":"ja"}]`. Desired: returns the array with one Japanese track.
- `R-A09-strings`: `]` and `"` inside strings (`"name":{"simpleText":"a] b \"c\""}`); two videos' scripts present; desired: the correct one for the current video.
- `R-A09-fetchedHtml`: the watch-page fallback path with the same shapes (fake `fetch` returning the HTML).
- Control: flat track list (no nested arrays) parses at baseline.
- Baseline: red for `runs`; witness `null`.

**A10 selected-provider-only routing (P2)** — *Node, request recorder*
- `R-A10-id`: selected provider `antigravity` (local) with the local request failing, a dummy Gemini key saved. Run `identifySongWithSensei` and the automatic lyrics fallback. Desired: **zero** requests to `generativelanguage.googleapis.com`, `api.deepseek.com`, `openrouter.ai`, or the custom AI URL unless that provider is selected.
- `R-A10-analysis`: analysis failure on the selected local provider with a saved Gemini key. Desired: no Gemini request.
- `R-A10-selectedUsed`: with Gemini selected and keyed, requests go to Gemini only (no other provider).
- Control: with Gemini selected, request construction still matches existing positive tests.
- Baseline: red; witness lists the Gemini URL.

**A11 real optional-permission guard behaviour (P2)** — *Chromium + static manifest checks*
- `R-A11-manifest`: parse `manifest.json`: `host_permissions` must not contain the same pattern as `optional_host_permissions`; unused permissions (`downloads`, `scripting`; `activeTab` if redundant) must not be present unless a code path uses them (the test greps for `chrome.downloads`/`chrome.scripting` usage and compares).
- `R-A11-guard`: in the extension page, `chrome.permissions.contains({origins:['https://example.invalid/*']})` must be **false** before a request (proving the guard is meaningful); the worker's `CALL_CUSTOM_AI` to a non-granted origin returns an error response and **makes no request** (recorded by a local server on a different loopback origin that is not a pre-granted origin if possible; otherwise assert on the `permissions.contains` outcome and a recorded refusal). Note: the headless run cannot click a permission prompt, so granting is out of scope; the guard check is the evidence.
- `R-A11-deadHandlers`: `FETCH_LYRICS_URL` and `FETCH_YOUTUBE_CAPTIONS` either have callers or are absent; a message to them from a content-script sender gets a refusal and no outbound request.
- Control: loopback AI endpoint still works with its documented permission (existing `browser_custom_ai.mjs` assertion).
- Baseline: red for manifest and guard; the existing test at `test_lyrics_fetch.js:109` encodes the broad permissions, so Sol Max must update that assertion in the fix stage; Sol High must not.

**A12 shipped-engine / generator correspondence (P2)** — *Node + Python*
- `R-A12-generated`: run `python3 -I build_content_js.py` into a **temp output** (via an env var or by executing the generator's construction in memory like the Ultra review did; Sol High must not overwrite `content.js`), compare bytes and SHA-256 with `content.js`. Desired: identical. Baseline green. This is the freshness guard for the future.
- `R-A12-corpus`: run the same list of words/sentences (1,000 corpus lines plus 5,000 dotted-kun entry × suffix words; the review measured 75,940 inputs with 452 differences) through (i) the shipped functions via the tail and (ii) `data/kanji-dict.js`'s exported implementation (`eval`'d as `run_tests.js` does). Baseline behaviour: records the **count of differences** as an OBSERVE number (expected 452 on the review's workload) and fails only if the test suite still calls the fork as its primary engine: the case asserts that no legacy suite function named in a short list (`resolveToHiragana`, `segmentJapaneseSentence`, `generateSentenceRomaji`) is evaluated from `data/kanji-dict.js` by any test other than the explicit comparison. After the fix stage the desired state is: the comparison reports 0 differences **or** the exported duplicate is deleted and tests target the shipped functions.
- `R-A12-bridge`: `isJapaneseTrack` of the bridge and of the content script agree on a 500-sample table of track objects (vssId, languageCode, name shapes, `a.ja`, `jan`, `ja-JP`, `japanese`).
- Control: the existing byte-identical generator check is replicated here and is green.

**Additional measured-risk cases (only if the measurement above fails; they are written now so the fix stage has them):**
- `R-X01`: `getWordReading('あ'.repeat(10000))`, `generateSentenceRomaji` and a token click with a 10,000-kana token do not throw; the drawer still opens. Baseline expected red (`RangeError` at ≥ ~5,000).
- `R-X02`: `parseVTT/SRT/LRC` with a cue containing `'<'×160,000` return within the P7 ratio bound (not an absolute millisecond limit) and `cues.length === 1`.
- `R-X03` (if P6 fails): lyrics cache bytes bounded; user cards preserved.
- Prompt quote correctness, F8 of the Sonnet review (R04): the prompt sent by `identifySongWithSensei` for a title containing `"` and `\` is valid under a JSON round trip of the quoted field (parse the field back and compare). Baseline red. Include it because it is a one-case, one-line fix and R04 is a P3 verified defect.
- Caption backend routing (R03): with `linguaplay_server_url=http://127.0.0.1:<stub>` set, caption requests go to that origin; the stub has a 3 s delayed answer and the test asserts acquisition does not block longer than the documented deadline (use fake clock + AbortSignal observation, no real waiting). Baseline red for routing.

---

## 7. Telling an expected baseline red from a harness or environment error

The baseline run **is expected to contain failures**. They only count as findings if they fail for the intended reason.

1. **Three failure types, three exit classes.** The matrix runner (`run_review_matrix.mjs`) classifies each case from structured evidence, not exit status:
   - `EXPECTED_RED`: an `AssertionError` whose message starts with the case id **and** whose `witness` matches the regex in `expected-baseline.json` for that case (e.g. A03: `CAT_FROM_OLD_REQUEST`).
   - `UNEXPECTED_GREEN`: expected red but passed. Either the defect is not reproducible in this harness (report it; do not delete the case) or the test is too weak. The control tells which.
   - `UNEXPECTED_RED`: a case expected green (controls, existing suites, `P*` guards) failed.
   - `HARNESS_ERROR`: anything else: `HarnessError` (typed: `TAIL_NOT_PURE`, `MISSING_SYMBOL`, `PRECONDITION`, `BROWSER_START`, `FIXTURE_INJECTION_FAILED`, `TIMEOUT`, `NONDETERMINISTIC_COUNT`), a thrown non-assertion error before the first assertion, a timeout, a missing Chromium, EADDRINUSE, a fixture length mismatch.
2. **Preconditions are asserted before the behaviour.** Each case first asserts what must be true for the observation to mean something (e.g. the deferred request was actually issued, the drawer element exists, the second tab's harness is wired to the same storage, the injected payload is visible in the DOM at all). A failed precondition throws `HarnessError('PRECONDITION: …')`.
3. **Controls.** Every red case has a control sharing the same setup but benign input. If the control is red the case result is discarded as `HARNESS_ERROR`, never `EXPECTED_RED`.
4. **Witness, not just red.** The expected failure signature is stored per case. A red test with a different message (e.g. `TypeError: Cannot read properties of null`) is `HARNESS_ERROR`, because it means the harness broke before reaching the product behaviour.
5. **Determinism.** Each case runs 3 times in baseline; the classification must be identical in all runs, otherwise `HARNESS_ERROR: NONDETERMINISTIC`.
6. **Environment status line.** The matrix header prints Node version, whether Chromium started, whether `fixtureMode` is `fetch-intercept`, and the existing-suite results. If an existing suite (86 + 15 + native 7) is not green before the new suite runs, stop: that is environment trouble, not a finding.
7. **Reporting.** `test-results-report.md` has one table per class with the witness. “Red” is never reported without the witness and the control result. The aggregate expectation: all A01–A12 reproductions `EXPECTED_RED`; A12-generated and the controls green; P-suite guards green; P-suite gates for P1 (reads), P2 (segmenters, throws), P7 (`<` slope), P4 (overlap) red at baseline; P3/P5/P6/P8 gates likely green or red as measured, with red promoted to a named defect only after a rerun in a second process.

---

## 8. Limits and honest scope

- **Fake DOM/clock:** the Node suite counts operations, not layout, style or paint cost. It proves work is or is not performed; it does not prove frame-rate. Real cost evidence is limited to P8, which is a single headless-Chromium fixture with a synthetic player.
- **Fixture fidelity:** the fetch-intercepted `www.youtube.com` page is a stub of the player and DOM. It exercises the manifest injection and the two worlds, but not YouTube's real player lifecycle, CSP, Trusted Types, or caption endpoints. Script execution via injected `onerror` under live CSP is **not** tested; A02 asserts element/attribute injection only (as the reviews did).
- **No live services:** no live YouTube, LRCLIB/Kugou, cloud AI, Anki, or Sudachi backend. The real Sudachi parser path is skipped (`PARSER_SERVER_DIR`); parser-online timing is out of scope. All “parser offline” numbers apply only to the in-bundle fallback.
- **Wall-clock numbers are machine-specific.** Baseline vs after is meaningful only on the same machine within the same session, with calibration values attached.
- **Storage quota:** the double is calibrated against one real-quota check (P8.quota). It does not model eviction or Chrome-version differences.
- **Heap numbers:** V8 heap deltas are noisy; they are SOFT or OBSERVE. Counts of entries and listeners are the gates.
- **Permission prompts:** headless Chromium cannot grant optional host permissions, so A11 proves the guard is no longer decorative, not the full grant flow.
- **Native-host and Python tests** are unchanged and out of scope except as the pre-run green gate.
- **No claim of memory leak or performance regression is made by this proposal.** R01/R02 stay risks until a measured gate fails.
- **Scope:** this is a harness plus targets. Architecture changes (worker-owned persistence, a navigation dispose, a shared Anki service) are the fix stage's decision; the cases are outcome-based so small fixes can satisfy them.

---

## 9. Bounded runtime and implementation order

| Part | Approx. wall time (this machine) |
| --- | --- |
| Preflight (existing 86 + 15 suites + native) | ~30–60 s (existing; `test_native_host.py` ~4 s) |
| Perf suite, Node, profile `baseline` (3 processes × P1–P7) | ~4–7 min (dominated by the 50,000-cue and 16,000-char sweeps; each script has a 60 s watchdog) |
| P8 Chromium | ~1–1.5 min (hard cap 90 s) |
| Review matrix (Node cases ×3 repetitions + Chromium cases ×1, controlled by `--repeat-browser 1`) | ~3–5 min |
| **Total baseline run** | **≈ 10–15 min; hard cap 25 min via orchestrator watchdog** |
| `--profile quick` | ≈ 2–3 min |

Cap resource use: Node heap ≤ 2 GB (`--max-old-space-size=2048`), a single Chromium instance, disk < 50 MB (artifacts < 10 MB; the quota test writes ~10 MB in the disposable profile and deletes it).

Suggested implementation order for Sol High (stop and report if a step cannot be completed):

1. `lib/shipped.js`, `lib/fakes.js`, `lib/stats.js`, `lib/env.js` and `--self-check` (tail guard, symbol list, fixture length asserts, determinism of counters).
2. Regression cases that are cheap Node outcome checks (A03, A04, A06, A07, A09, A10, A12) and the matrix runner with `expected-baseline.json` and controls.
3. P1, P2, P7 (highest value, deterministic).
4. P4, P5, P6 (request/listener/cache counts).
5. §3.4 feasibility smoke, then P8 and the Chromium regression cases (A01, A02, A05, A08, A11).
6. Baseline run ×3 processes, produce `results/baseline/*` and `test-results-report.md`.

---

## 10. Hand-off checklist for Sol High

- [ ] Do not edit production files, `content.js`, `manifest.json`, `background.js`, or existing tests. Do not run `build_content_js.py` in write mode.
- [ ] Do not commit, push, or create a PR. Leave `results/` untracked.
- [ ] Record `env.json` before and after each phase; state the `fixtureMode` actually used.
- [ ] Store the baseline raw NDJSON and the merged `perf.json` / `review-matrix.json` unmodified; the report may summarise but must link to raw files.
- [ ] Every red result in the report has: case id, finding id, witness, control status, and whether it reproduced in all 3 runs.
- [ ] Separate in the report: (a) baseline observations, (b) target comparison, (c) harness/environment issues, (d) risks that did not cross a bound (stay risks), (e) any new defect promoted from measurement (e.g. R-X01, R-X02), each with the evidence that promoted it.
- [ ] If any approach in this proposal proves infeasible (Chromium injection, accessors changing JIT behaviour, a symbol missing), say so in the report and give the closest honest alternative instead of silently dropping the case.
