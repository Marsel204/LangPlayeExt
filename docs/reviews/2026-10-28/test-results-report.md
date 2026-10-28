# Baseline test results — GPT 6.1 Sol High

Production baseline: `3187787fd723fa20686cb97523d3b5ab1ccaffab` on `t3/review-performance-fixes`. This stage implemented and executed the new test harness only. No production fix, existing-test edit, dependency installation, bundle regeneration in write mode, commit, push, PR or publishing action was performed. No agents were delegated. The supplied `3187787fd723fa206cb97523d3b5ab1ccaffab` spelling was corrected by actual `git rev-parse` to the full hash above.

The reportable pass including bounded recovery ran from 2026-10-28T06:51:00.966Z to 2026-10-28T07:12:30.363Z in **21.49 minutes**, under its 25-minute deadline `2026-10-28T07:16:00.966Z`. The supplemental native-browser X01 run also finished before that same deadline; exact durations are in [native-reading.json](results/baseline/review/native-reading.json). Implementation, feasibility probes and fixture debugging happened before this clock. All tracked baseline files remain byte-identical: **54 checked, 0 changed**. See [integrity.json](results/baseline/integrity.json), [before hashes](results/baseline/tracked-before.json), [after hashes](results/baseline/tracked-after.json), and [initial harness hashes](results/baseline/harness-sha256.json) and [final harness hashes](results/baseline/harness-sha256-final.json).

## Test status

- Unchanged checks: **86/86 Node tests, 15/15 legacy suites, 7/7 native Python tests, and the existing Chromium checks passed**. The real Sudachi integration remains explicitly skipped because `PARSER_SERVER_DIR` is absent. The native launcher check uses its preexisting test fixture, not a real Sudachi service.
- Harness self-check: **PASS** for prefix/trailer preservation, closed-tail tamper rejection, missing-symbol rejection, async independent storage snapshots, fixture lengths, read-only snapshots and deterministic counts.
- Regression matrix, including native-browser X01: **GREEN=22, EXPECTED_RED=53, UNEXPECTED_GREEN=0, UNEXPECTED_RED=0, HARNESS_ERROR=1**. All accepted regression cases have three process repetitions, a matching witness and a passing control. R-X02 remains HARNESS_ERROR because its third-process large-parser samples are missing. An EXPECTED_RED is an observed baseline defect against desired behavior, not a passing product assertion.
- Node performance gates: **{'pass': 153, 'fail': 78, 'unmeasured': 3} metric/process outcomes**, across **{'pass': 51, 'fail': 26, 'unmeasured': 3} unique gate IDs**. These are target comparisons, separate from regression expectations. Soft misses and observation-only rows are not product test failures. P8 has its own gate/soft rows below.
- Recorded performance harness errors: **3**; runtime limitation/error rows: **3**. A timeout, missing symbol, invalid fixture, failed control or different failure signature is never accepted as a product failure. Native-browser X01 status: **EXPECTED_RED**.

## Exact commands and provenance

Executed from `/home/marsel/.t3/worktrees/LangPlayext/t3-1a9e7cd4`:

```bash
git rev-parse HEAD
node tests/perf/run_baseline.mjs
# Its bounded child commands (the Node glob is expanded in commands.json):
node --test tests/test_*.js
node run_tests.js
python3 -I tests/test_native_host.py
node tests/browser_custom_ai.mjs
node tests/perf/run_perf.mjs --self-check
node --expose-gc tests/perf/run_perf.mjs --profile baseline --repeat-processes 3 \
  --out docs/reviews/2026-10-28/results/baseline/perf
node tests/perf/perf_p8_browser.mjs \
  --out docs/reviews/2026-10-28/results/baseline/perf
node tests/review/run_review_matrix.mjs --mode baseline --repeat-processes 3 --repeat-browser 3 \
  --out docs/reviews/2026-10-28/results/baseline/review
# Supplemental native UI confirmation, using the same overall deadline:
node tests/review/run_native_reading.mjs --mode baseline \
  --out docs/reviews/2026-10-28/results/baseline/review
# Harness recovery, preserving originals and raw NDJSON:
node tests/perf/process-selfcheck.mjs  # failed before UTF-8 fix; passes after
node tests/perf/recover_baseline.mjs   # bounded 90s retry timed out; exit 1
node tests/perf/recover_baseline.mjs --merge-only  # UTF-8 merge repaired; exit 2 for retained timeouts
node tests/review/recover_browser.mjs  # observed-poll preconditions; exit 2 only for R-X02
```

Environment: v26.8.1, V8 14.6.202.34-node.28, 7.2.5-3-omarchy, 11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz, 8 logical CPUs, governor `powersave`, Chromium `Chromium 152.0.7977.82 Arch Linux`. Start load average: [0.51, 0.91, 1.06]; noisy-load flag: `False`. Calibration before/after and exact argv, status, source SHA-256, heap and CPU metadata are retained in [env.json](results/baseline/env.json), [phase metadata](results/baseline/perf/env-before.json), [final metadata](results/baseline/perf/env-after.json), and [commands.json](results/baseline/commands.json). Calibration itself is noisy (41.7% CV); absolute timing is contextual, not a portable gate.

Actual **`fixtureMode: "fetch-intercept"`**. The disposable Chromium profile loads the unchanged extension manifest. The bridge runs in MAIN, the content script in the extension isolated world, and both act on a local fulfilled YouTube-shaped document. The feasibility gate observed injected controls and passed bridge OFF/ON controls. The fixture disables DNS resolution, fulfills its document locally, and blocks other page requests. No real YouTube/provider/Anki/profile/Sudachi was used. Chrome permission values and quota are real; network answers and player behavior are fixture boundaries.

The source-tail design is a closed template/identifier schema rather than the sketch grammar parser. It admits only forwarding calls, state reads, and the three permitted playback fixture assignments. The full shipped prefix and closing trailer are preserved exactly. Nested handlers are driven through actual captured listeners. Neither the generated bundle nor the generator is written. Generator correspondence executes construction in memory after structurally removing only the final output/print AST nodes.

## Harness issues, recovery and remaining blocker

The initial merged performance JSON falsely reported four golden mismatches because subprocess stdout Buffers were decoded independently: a UTF-8 character split across chunks became replacement characters. Raw NDJSON files retained the correct bytes. A new split-byte self-check failed before the decoder fix and passed afterward. The merged JSON and baseline goldens were rebuilt from the original raw bytes; all six full-corpus configurations/process outputs now agree byte-for-byte. The original faulty merges are preserved losslessly in [perf-original.json.gz](results/baseline/perf/perf-original.json.gz) and [baseline-golden-original.json.gz](results/baseline/perf/baseline-golden-original.json.gz). No measured product function or acceptance target changed.

The initial browser A05 case used a fixed 1.2-second sleep; one of three runs recorded no track change because no poll was proven to have executed. It was correctly classified NONDETERMINISTIC_CLASSIFICATION. The fixture now waits for a real production loadModule call before reading the outcome. Three fresh browser processes reproduce the hidden-overlay defect with observed polls. Initial matrix/raw data remain preserved; recovery rows identify their new raw files.

**Remaining blocker: third-process P7 160,000-character samples.** All three formats exceeded the original 55-second child cap. A separate unchanged VTT workload with a bounded 90-second cap also timed out. The runner lacks a partial per-call witness for that attempt, so the timeout cause cannot be safely separated into product work versus environment effects; it remains HARNESS_ERROR/limitation, never an accepted product failure. Processes 0 and 1 completed all sizes, with valid controls and strong quadratic scaling. No target, input size or expected output was reduced. Three performance timeout rows and one aggregate regression HARNESS_ERROR remain. The third process also measured 20k cases at 459–524 ms versus 182–193 ms in earlier processes, showing substantial run-to-run timing drift; its cause was not isolated. Further stress measurement is deferred to the new Sonnet review; do not call this a fully green harness.

See [performance recovery metadata](results/baseline/perf/recovery.json), [failed retry log](results/baseline/logs/recovery.stderr.log), [UTF-8 before](results/baseline/logs/utf8-before.log), [UTF-8 after](results/baseline/logs/utf8-after.log), [browser recovery log](results/baseline/logs/browser-recovery.stdout.log), and [total measurement timing](results/baseline/measurement-summary.json). Main-run perf/review exit codes were 2, and recovery retains that error status for P7. Every unchanged suite remains green.

## Baseline observations

These numbers describe the baseline. Acceptance budgets are in the following section and in the separate [targets.json](../../../tests/perf/targets.json); none was adjusted to make these observations pass.

| Area | Measured baseline observation |
| --- | --- |
| P1 play.head, 50k cues | Reads/update median **134**, max **50,100**; median plain-property batch time/update in the three processes: 0.0753 / 0.0752 / 0.0690 ms. |
| P1 play.tail, 50k cues | Reads/update median **99,920**, max **100,000**; median plain-property batch time/update in the three processes: 0.4648 / 0.4874 / 0.4733 ms. |
| P1 seek.random, 50k cues | Reads/update median **57,848**, max **99,910**; median plain-property batch time/update in the three processes: 0.3086 / 0.3206 / 0.3296 ms. |
| P1 seek.gap, 50k cues | Reads/update median **74,371**, max **99,908**; median plain-property batch time/update in the three processes: 0.3450 / 0.3566 / 0.3526 ms. |
| P1 same.cue, 50k cues | Reads/update median **2**, max **2**; median plain-property batch time/update in the three processes: 0.0001 / 0.0000 / 0.0000 ms. |
| P1 correctness | Every sorted-fixture oracle check passed; same-cue extra render count is zero. Touching endpoints are **inclusive** and choose the **first matching cue in array order**. At t=2, [0,2] precedes [2,4]; overlaps and duplicates retain first-match behavior. Raw characterization is in the golden file. A replacement timeline retaining index 0 leaves the old text, separately reproduced by R-A04-sameIndex. |
| P2 rendering | `1000` Segmenter constructions / 1,000 renders with the real parser client offline; the parser-absent configuration gives the same count. Complete 1,000-line outputs are byte-identical across the three process repetitions. |
| P2 robustness | Long inputs throw RangeError in multiple reading entry points. Ten-step word-reading threshold probes bracketed [(4735, 4750), (4676, 4691), (4676, 4691)]; isolated adversarial jobs sometimes fail at smaller sizes. This threshold is call-shape/JIT/stack dependent and is not asserted as a universal boundary. Native 10k-sentence token-click evidence is recorded separately below. |
| P3 | Same-text render calls rebuild 1,000 times; unrelated observer deliveries render 0 times; 50 actual text changes render 50 times. Stable shown/hidden ticks each perform **900 style and 300 class operations / 300 ticks**. Retry storm: 50 renders / 50 launcher-success callbacks while parser transport remains offline. |
| P4 | Five Ask clicks issue **5** deferred model requests. Lyrics starts while captions are pending; a superseded analysis writes `CAT_FROM_OLD_REQUEST`. Translation repeats issue **0** requests. Settled failure request counts remain bounded in the 60-tick fixture; pending captions have no harness-invented deadline. |
| P5 | Steady bridge poll does not rewrite track/CC after matching Japanese state. Navigation listener/observer counts at 5 and 50: `{"checkpoints":[{"navigation":5,"totalVideoListeners":2,"liveObservers":2,"intervals":1},{"navigation":50,"totalVideoListeners":2,"liveObservers":2,"intervals":…`. Leaving watch retains listeners/observers/presentation; cleanup fails. The second live observer is drawer placement, so the sketch’s “at most one” would be an invalid total-observer oracle. |
| P6 translation | **10000 entries** after 10k unique sentences; recent 50 remain hits. GC heap deltas include retained fixture request strings and cannot be attributed solely to production cache allocations. |
| P6.lyricsCache.bytes8000.videos500 | `{"entries":500,"bytes":4069890,"failedWrites":0,"cards":200}` |
| P6.lyricsCache.bytes200000.videos500 | `{"entries":51,"bytes":10207079,"failedWrites":449,"cards":200}` |
| P6.pressure.cards.bytes200000 | `{"cards":200,"settingsPersisted":true,"failedWrites":449}` |
| P6 cards / offsets | Save 100 / 500 / 2,000 serialized bytes: 15771 / 78571 / 314071; cumulative whole-array write payload at 2,000 saves: 314,299,000 bytes. Modal offset handler persists 500 keys for 500 videos. |
| P7 vtt tag strip | 20k median milliseconds: 181.63 / 182.94 / 490.86; 160k: 12,280.49 / 11,663.65; ratios 67.61 / 63.76; slopes 2.03 / 2.00. Every completed pathological fixture returns exactly one cue, and ordinary markup control output stays `猫 犬`. |
| P7 srt tag strip | 20k median milliseconds: 182.27 / 192.50 / 458.61; 160k: 11,482.03 / 11,981.28; ratios 63.00 / 62.24; slopes 1.99 / 1.99. Every completed pathological fixture returns exactly one cue, and ordinary markup control output stays `猫 犬`. |
| P7 lrc tag strip | 20k median milliseconds: 187.68 / 188.60 / 523.94; 160k: 11,885.18 / 11,536.45; ratios 63.33 / 61.17; slopes 1.99 / 1.98. Every completed pathological fixture returns exactly one cue, and ordinary markup control output stays `猫 犬`. |
| P8 idle | **10** extension-owned native mutation records and **0** renders / 10 s. This is periodic work, not a runaway self-feedback loop. |
| P8 churn | **50** rebuilds / 50 caption changes plus 2,000 unrelated append/remove pairs; long tasks: `[]`. |
| P8 navigation | After forced GC, navigation 30 minus 5: **-5 nodes, 0 listeners, 138,480 heap bytes**. No node/listener leak is established in this fixture. |

## Comparison with the proposal targets

| Target group | Comparison |
| --- | --- |
| P1 lookup work | 50k head/tail and seek count budgets fail; same-cue rendering and all source-derived lookup correctness guards pass. Absolute update latency is an observation, not an assertion of live-page jank. |
| P2 | Segmenter budget and adversarial no-throw requirement fail. Baseline typical-output goldens agree across processes. WanaKana calls are a recorded baseline for later comparison. |
| P3/P4 | Stable tick DOM-write budget, pending-caption exclusivity, duplicate model and stale-write gates fail. Live-caption render counts and translation cache repeat-hit controls pass. |
| P5 | Stable bridge and no-navigation-growth gates pass. Leave-watch cleanup fails. Constant two-observer ownership is characterized rather than falsely rejected. |
| P6 | Translation-entry and lyrics-byte bounds fail; pressure preserves the pre-seeded cards and small settings witness. A failed real card write still claims success. |
| P7 | Two completed processes in every format exceed both slope/alternative-ratio targets, with MAD separation and acceptable CV. The third-process 160k jobs time out, so the aggregate gate is **unmeasured** and R-X02 is **HARNESS_ERROR**, not an accepted red. Full ordinary cue-count/markup guards pass. |
| P8 | Zero-idle-own-mutation target fails, corroborated by repeated P3 operation counts and the earlier feasibility probe. Navigation node/listener and long-task targets pass in the representative headless fixture; the representative P8 timing run itself is one process. |

General timing rows with CV >25% remain noisy and do not support a timing acceptance conclusion. Deterministic count gates remain valid when associated timings are noisy. P1/P2 ordinary timing slopes are not automatically gated by this implementation; source data is retained for review. Some small helper batches are below the sketch’s 1 ms aggregation floor and are observation-only. The P7 code checks the unchanged slope/ratio alternatives and MAD/CV rules, but conservatively requires all three process measurements before emitting an aggregate verdict; the two completed processes provide strong quadratic evidence without a complete aggregate acceptance result.

## Correctness/security witnesses and controls

| Finding | Important witness and passing control |
| --- | --- |
| A01 | MAIN reads `dummy-review-secret` from the password input. `R-A01-control` proves the settings action is present and routes its actual worker message. |
| A02 | Real DOM creates injected elements/attributes in sentence, AI gloss/error, lyrics and identified-song sinks. Unterminated markup truncates visible sentence text; `&amp;` changes displayed text. Card HTML and both TSVs contain live markup. Escaped chat is green; quote-only highlight and tested fallback-romaji outputs are benign green controls. |
| A03 | Old cat response becomes `lastAiData.contextual_meaning=CAT_FROM_OLD_REQUEST` after selecting 犬 and is persisted with the new word; three identical clicks issue three requests; late error replaces the new view. Sequential current response applies normally. |
| A04 | Lyrics request begins with captions pending; late lyrics replace captions and a real manual file upload; replacing cue index 0 leaves rendered 猫 instead of 犬. Different-video response is dropped. |
| A05 | With actual eye hidden, poll leaves `{selected:ja,cc:true}` despite user setting English/off, in both Node and native two-world browser. Visible overlay control correctly restores Japanese/CC. |
| A06 | Configured local stub receives zero requests while actual destination stays 8765/deck LinguaPlay. Default control reaches the ephemeral stub through an explicitly labeled transport relay. 来ない stores its surface as reading; API error/offline still says Saved; bare/wrapped top-level reading is lost; exporters differ. Enriched save is GREEN because its actual label discloses local storage, an allowed outcome. |
| A07 | Ten seeded cross-tab schedules each leave one of two cards; clear/save resurrects OLD_CLEARED; failed save/clear claims success/zero cards. Native quota leaves zero cards while displaying Saved, after a normal real durable-save control passed. |
| A08 | New-video and leave-watch transitions retain active overlay, tokens and open drawer; Node leave-watch retains two video listeners. Native browser reproduces stale visible DOM; current-video caption control appears correctly. |
| A09 | Flat caption-track JSON parses; nested runs and strings with ] return null, including fetched-HTML fallback. This is an extraction failure, not a fixture count error. |
| A10 | Selected local provider failure sends actual constructed Gemini requests using a dummy saved key. Selected-Gemini control reaches only its selected transport; no real provider network call occurs. |
| A11 | Required and optional wildcard hosts duplicate; real `permissions.contains(https://example.invalid/*)` is true before asking. Real worker code refuses a genuinely denied permission double but unused FETCH_LYRICS_URL executes a fetch boundary. Loopback permission control stays green. |
| A12 | In-memory generator output is byte-identical. Requested 6,000-input comparison records 45 differences, not the review’s 452 from a different 75,940-input corpus. Legacy source still evaluates the duplicate engine. Bridge/content predicate agrees on 500 samples. |
| R03/R04 | Caption request ignores configured origin and uses 127.0.0.1:8000, with its existing AbortSignal. Actual quoted/backslash title prompt cannot round-trip its quoted field through JSON. |
| X01 | Repeated long-reading RangeErrors; real production Node token listener is exercised. Supplemental native-browser fixture uses uninstrumented manifest-injected code and a short-sentence control; inspect the native row below. |
| X02 | 20k→160k cue payloads return one cue with roughly quadratic time in all three formats in processes 0 and 1; benign parser controls pass. Process 2 times out at 160k and is not treated as a product failure. R-X02 remains a harness limitation. |
| X03 / X-R01 | 500×8KB cache exceeds 2.5MB; 200KB stress causes 449 cache write failures. Cards/settings survive. Cache growth and ignored write failure are demonstrated; no user-card loss or independent heap leak is claimed. |

Native X01 observations (no tail, no dependency wrappers):

- Process 0: short control `{"n":100,"tokenCount":50,"drawerHidden":false,"errors":[]}`; long witness `{"n":10000,"tokenCount":5000,"drawerHidden":true,"errors":[{"message":"Uncaught RangeError: Maximum call stack size exceeded","name":"RangeError"}]}`; `EXPECTED_RED`.
- Process 1: short control `{"n":100,"tokenCount":50,"drawerHidden":false,"errors":[]}`; long witness `{"n":10000,"tokenCount":5000,"drawerHidden":true,"errors":[{"message":"Uncaught RangeError: Maximum call stack size exceeded","name":"RangeError"}]}`; `EXPECTED_RED`.
- Process 2: short control `{"n":100,"tokenCount":50,"drawerHidden":false,"errors":[]}`; long witness `{"n":10000,"tokenCount":5000,"drawerHidden":true,"errors":[{"message":"Uncaught RangeError: Maximum call stack size exceeded","name":"RangeError"}]}`; `EXPECTED_RED`.

### Per-case classification index

All below rows link through the [full matrix](results/baseline/review/review-matrix.json), which contains every repetition, witness object and control reference. Raw NDJSON is not rewritten when merging. The initial unextended core matrix (including its then-unresolved fixture issues) is preserved as [review-matrix-core.json](results/baseline/review/review-matrix-core.json).

| Case | Status | Control | Witness signature |
| --- | --- | --- | --- |
| `R-A03-control` | GREEN | `self-contained positive control` | `CURRENT_RESPONSE_APPLIED` |
| `R-A03-stale` | EXPECTED_RED | `R-A03-control` | `CAT_FROM_OLD_REQUEST` |
| `R-A03-dup` | EXPECTED_RED | `R-A03-control` | `DUPLICATE_MODEL_REQUESTS` |
| `R-A03-error-late` | EXPECTED_RED | `R-A03-control` | `LATE_ERROR_REPLACES_CONTEXT` |
| `R-A04-control` | GREEN | `self-contained positive control` | `OLD_VIDEO_DROPPED` |
| `R-A04-overlap` | EXPECTED_RED | `R-A04-control` | `LYRICS_WHILE_CAPTIONS_PENDING` |
| `R-A04-priority` | EXPECTED_RED | `R-A04-control` | `LATE_LYRICS_OVERWRITE_PRIORITY` |
| `R-A04-manual` | EXPECTED_RED | `R-A04-control` | `LATE_LYRICS_OVERWRITE_MANUAL` |
| `R-A04-sameIndex` | EXPECTED_RED | `R-A04-control` | `TIMELINE_REPLACEMENT_STALE_INDEX` |
| `R-A05-control` | GREEN | `self-contained positive control` | `VISIBLE_JAPANESE_RESTORED` |
| `R-A05-node` | EXPECTED_RED | `R-A05-control` | `HIDDEN_OVERLAY_CC_JA_RESTORED` |
| `R-A06-control` | GREEN | `self-contained positive control` | `DEFAULT_QUICK_SAVE` |
| `R-A06-route` | EXPECTED_RED | `R-A06-control` | `IGNORED_ANKI_ENDPOINT_DECK` |
| `R-A06-reading` | EXPECTED_RED | `R-A06-control` | `QUICK_SURFACE_AS_READING` |
| `R-A06-status-apiError` | EXPECTED_RED | `R-A06-control` | `ANKI_FAILURE_FALSE_SUCCESS` |
| `R-A06-status-offline` | EXPECTED_RED | `R-A06-control` | `ANKI_FAILURE_FALSE_SUCCESS` |
| `R-A06-enriched` | GREEN | `R-A03-control` | `ENRICHED_LOCAL_STORAGE_DISCLOSED` |
| `R-A06-envelope-bare` | EXPECTED_RED | `R-A03-control` | `ENRICHED_READING_ENVELOPE_LOST` |
| `R-A06-envelope-wrapped` | EXPECTED_RED | `R-A03-control` | `ENRICHED_READING_ENVELOPE_LOST` |
| `R-A07-control` | GREEN | `self-contained positive control` | `ONE_DURABLE_SAVE` |
| `R-A07-concurrent` | EXPECTED_RED | `R-A07-control` | `CONCURRENT_WHOLE_ARRAY_LOST_SAVE` |
| `R-A07-failure` | EXPECTED_RED | `R-A07-control` | `FAILED_STORAGE_FALSE_SUCCESS` |
| `R-A07-clearRace` | EXPECTED_RED | `R-A07-control` | `CLEARED_CARD_RESURRECTED` |
| `R-A08-control` | GREEN | `self-contained positive control` | `CURRENT_CAPTION_APPEARS` |
| `R-A08-newVideo` | EXPECTED_RED | `R-A08-control` | `NAVIGATION_STALE_DOM_newVideo` |
| `R-A08-leaveWatch` | EXPECTED_RED | `R-A08-control` | `NAVIGATION_STALE_DOM_leaveWatch` |
| `R-A08-backForward` | EXPECTED_RED | `R-A08-control` | `NAVIGATION_STALE_DOM_backForward` |
| `R-A09-control` | GREEN | `self-contained positive control` | `FLAT_TRACK_PARSED` |
| `R-A09-runs` | EXPECTED_RED | `R-A09-control` | `NESTED_TRACK_EXTRACTION_NULL` |
| `R-A09-strings` | EXPECTED_RED | `R-A09-control` | `NESTED_TRACK_EXTRACTION_NULL` |
| `R-A10-control` | GREEN | `self-contained positive control` | `SELECTED_GEMINI_USED` |
| `R-A10-id` | EXPECTED_RED | `R-A10-control` | `UNSELECTED_GEMINI_REQUEST` |
| `R-A10-analysis` | EXPECTED_RED | `R-A10-control` | `UNSELECTED_GEMINI_REQUEST` |
| `R-A11-control` | GREEN | `self-contained positive control` | `LOOPBACK_PERMISSION_PRESENT` |
| `R-A11-manifest` | EXPECTED_RED | `R-A11-control` | `OPTIONAL_REQUIRED_WILDCARD_DUPLICATION` |
| `R-A11-deadHandlers` | EXPECTED_RED | `R-A11-control` | `UNUSED_PRIVILEGED_FETCH_HANDLERS` |
| `R-A12-generated` | GREEN | `self-contained positive control` | `GENERATOR_BYTE_IDENTICAL` |
| `R-A12-corpus` | EXPECTED_RED | `R-A12-generated` | `LEGACY_TESTS_EVALUATE_DUPLICATE_ENGINE` |
| `R-A12-bridge` | GREEN | `R-A05-control` | `BRIDGE_CONTENT_PREDICATE_AGREEMENT` |
| `R-X01-control` | GREEN | `self-contained positive control` | `SHORT_KANA_SAFE` |
| `R-X01` | EXPECTED_RED | `R-X01-control` | `LONG_KANA_RANGEERROR` |
| `R-R04-prompt` | EXPECTED_RED | `R-A10-control` | `PROMPT_QUOTE_ROUNDTRIP_FAILED` |
| `R-R03-routing` | EXPECTED_RED | `R-A08-control` | `HARDCODED_CAPTION_BACKEND` |
| `R-A07-clear-control` | GREEN | `self-contained positive control` | `OPTIONS_CLEAR_DURABLE` |
| `R-A07-clearError` | EXPECTED_RED | `R-A07-clear-control` | `CLEAR_FAILURE_ZERO_CARD_SUCCESS` |
| `R-A09-fetchedHtml` | EXPECTED_RED | `R-A09-control` | `FETCHED_HTML_NESTED_TRACK_LOST` |
| `R-A11-worker-control` | GREEN | `self-contained positive control` | `WORKER_REFUSES_UNGRANTED_ORIGIN` |
| `R-A11-deadHandlers-runtime` | EXPECTED_RED | `R-A11-worker-control` | `UNRESTRICTED_UNUSED_FETCH_REQUEST` |
| `R-A01-control` | GREEN | `self-contained positive control` | `SETTINGS_AFFORDANCE_PRESENT` |
| `R-A01-1` | EXPECTED_RED | `R-A01-control` | `HOST_PAGE_READS_DUMMY_CREDENTIAL` |
| `R-A02-control` | GREEN | `self-contained positive control` | `CHAT_MARKDOWN_ESCAPES_PAYLOAD` |
| `R-A02-highlight-0` | EXPECTED_RED | `R-A02-control` | `HIGHLIGHT_MARKUP_OR_TEXT_CHANGED` |
| `R-A02-highlight-1` | EXPECTED_RED | `R-A02-control` | `HIGHLIGHT_MARKUP_OR_TEXT_CHANGED` |
| `R-A02-highlight-2` | EXPECTED_RED | `R-A02-control` | `HIGHLIGHT_MARKUP_OR_TEXT_CHANGED` |
| `R-A02-highlight-3` | EXPECTED_RED | `R-A02-control` | `HIGHLIGHT_MARKUP_OR_TEXT_CHANGED` |
| `R-A02-highlight-4` | GREEN | `R-A02-control` | `HIGHLIGHT_MARKUP_OR_TEXT_CHANGED` |
| `R-A02-highlight-5` | EXPECTED_RED | `R-A02-control` | `HIGHLIGHT_MARKUP_OR_TEXT_CHANGED` |
| `R-A02-gloss` | EXPECTED_RED | `R-A02-control` | `GLOSS_ELEMENT_ATTRIBUTE_INJECTION` |
| `R-A02-error` | EXPECTED_RED | `R-A02-control` | `ERROR_BANNER_INJECTION` |
| `R-A02-card-A` | EXPECTED_RED | `R-A02-control` | `ANKI_FIELDS_CONTAIN_MARKUP` |
| `R-A02-card-B` | EXPECTED_RED | `R-A02-control` | `TSV_HTML_UNESCAPED` |
| `R-A06-exporters` | EXPECTED_RED | `R-A02-control` | `EXPORT_BYTES_DIVERGE` |
| `R-A05-browser-control` | GREEN | `self-contained positive control` | `VISIBLE_POLL_CONTROL` |
| `R-A05-browser` | EXPECTED_RED | `R-A05-browser-control` | `REAL_HIDDEN_OVERLAY_CC_JA_RESTORED` |
| `R-A11-browser-control` | GREEN | `self-contained positive control` | `REAL_LOOPBACK_PERMISSION` |
| `R-A11-guard` | EXPECTED_RED | `R-A11-browser-control` | `UNREQUESTED_ORIGIN_ALREADY_GRANTED` |
| `R-A07-quota` | EXPECTED_RED | `R-A07-quota-control` | `REAL_QUOTA_FALSE_SUCCESS` |
| `R-A08-browser-newVideo` | EXPECTED_RED | `R-A05-browser-control` | `REAL_NAVIGATION_STALE_DOM` |
| `R-A08-browser-leaveWatch` | EXPECTED_RED | `R-A05-browser-control` | `REAL_NAVIGATION_STALE_DOM` |
| `R-A02-romaji` | GREEN | `R-A02-control` | `FALLBACK_ROMAJI_NO_MARKUP_ON_CORPUS` |
| `R-A02-lyrics` | EXPECTED_RED | `R-A02-control` | `LYRICS_METADATA_INJECTION` |
| `R-A02-identified` | EXPECTED_RED | `R-A02-control` | `IDENTIFIED_METADATA_INJECTION` |
| `R-A07-quota-control` | GREEN | `self-contained positive control` | `REAL_STORAGE_SAVE_CONTROL` |
| `R-X02` | HARNESS_ERROR | `R-A09-control` | `QUADRATIC_TAG_STRIPPING` |
| `R-X03` | EXPECTED_RED | `R-A07-control` | `UNBOUNDED_LYRICS_CACHE` |
| `R-X01-native-browser` | EXPECTED_RED | `self-contained positive control` | `NATIVE_TOKEN_CLICK_STACK_OVERFLOW` |

## Newly measured defects and limits

**X01** is a stack-safety defect in the shipped fallback conversion path; the precise failing length varies with engine optimization and call shape. Do not treat the threshold bisection as a portable limit. **X02** has quadratic evidence from two processes but remains protocol-incomplete because third-process stress jobs timed out. **X03 / X-R01** promotes unbounded expendable-cache growth from a risk to a failed measured budget with quota-pressure evidence. **X04** names the newly measured recurring idle DOM work: three fake style operations per tick, and one real native mutation per second. These do not establish live-YouTube frame drops. Timeline scan work and Segmenter construction now have measured baselines, while the small-fixture navigation-leak suspicion is not established.

Detailed executable mapping and every design deviation are in [coverage.md](results/baseline/coverage.md). Material limits: fake DOM cannot model layout or markup; actual security checks use Chromium. Timer overlap is created deliberately; real drift and live network deadline behavior are not tested. Real P8 observers are not wrapped, so their callback-invocation count is unavailable; actual rebuilds/mutations and CDP metrics are the honest equivalent. Node heap deltas include fixture request logs. The sketch’s total-observer limit would misclassify the legitimate drawer observer, so the lifetime gate checks no growth and documents the two owners.

Not executed: real permission grant UI or distinct real ungranted-worker refusal (all origins are already granted); two-video embedded-script selection; real Sudachi/online parser timing; zero-width-only reading input; separate long-cue-text timeline sweep; exact installation accessor-read budgets; live YouTube CSP/script execution. No result claims these behaviors were validated. Some design-sketch output-length ratios are null for non-string returns. Native/browser profiling covers a synthetic player, not the real YouTube lifecycle.

Pathological repetitions were reduced to remain bounded: long P2 uses one warmup and three measured calls, other P2 jobs five/15, parser stress cold plus three measured calls with no extra warmup. Normal synchronous timing uses five warmups/15 repetitions; typical corpus timing uses 20-line batches while full-corpus outputs/counts are collected independently. Three process repetitions were attempted; the documented third-process parser jobs remain incomplete. The rich raw/golden artifacts exceed the sketch’s aspirational 10 MB artifact size but remain below its 50 MB resource cap (about 29.1 MB total); no samples were dropped to shrink output.

## Artifacts and next handoff

- [Merged performance results](results/baseline/perf/perf.json), [raw performance NDJSON directory](results/baseline/perf/raw/), [typical/timeline goldens](results/baseline/perf/baseline-golden.json), [native browser performance](results/baseline/perf/p8-browser.json).
- [Regression matrix](results/baseline/review/review-matrix.json), [raw regression NDJSON directory](results/baseline/review/raw/), [core status index](results/baseline/review/junit-like.txt), [native reading supplement](results/baseline/review/native-reading.json).
- [Unchanged-suite and runner logs](results/baseline/logs/), [coverage/limits](results/baseline/coverage.md), [command metadata](results/baseline/commands.json), [integrity evidence](results/baseline/integrity.json). All remain untracked. Nothing was added to .gitignore.

**Next is a NEW Sonnet results review/fix proposal**, as requested. Review harness validity, expected-red controls, native reading reachability, same-index state semantics, targets versus observations, and explicit limitations before proposing focused production fixes. This stage proposes and implements no production fix. Then Sol Max implements only that reviewed proposal; no commit/push/PR is authorized here.

Exact Sol Max verification commands, after the authorized production fixes and bundle regeneration:

```bash
node --test tests/test_*.js
node run_tests.js
python3 -I tests/test_native_host.py
node tests/browser_custom_ai.mjs
node tests/perf/run_perf.mjs --self-check
node tests/perf/process-selfcheck.mjs
node --expose-gc tests/perf/run_perf.mjs --profile after --repeat-processes 3 \
  --out docs/reviews/2026-10-28/results/after/perf
node tests/perf/perf_p8_browser.mjs \
  --out docs/reviews/2026-10-28/results/after/perf
node tests/review/run_review_matrix.mjs --mode after --repeat-processes 3 --repeat-browser 3 \
  --out docs/reviews/2026-10-28/results/after/review
node tests/review/run_native_reading.mjs --mode after \
  --out docs/reviews/2026-10-28/results/after/review
```

Keep the after measurement pass capped at 25 minutes and each subprocess bounded. Preserve baseline raw files/goldens. `--mode after` requires desired behavior: expected baseline red no longer counts as success. Review changes to engine output or characterization semantics explicitly instead of updating goldens to hide them. If a production symbol moves, adapt the single symbol/entry mapping with the guard intact and rerun self-checks. The existing broad-permission assertion will need a reviewed fix-stage update if permissions are narrowed; it was left unchanged here.
