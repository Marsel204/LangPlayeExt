# Fix results — 2026-10-28

> Integration update: main now uses 9Router only. [Current merge validation](merge-main-report.md) preserves that backend. The results below describe the earlier reviewed-fix snapshot.

The Sonnet and GPT 6.1 Sol Ultra reviews, aggregated findings, Sonnet performance proposal, Sol High baseline run, and Sonnet results review are complete. GPT 6.1 Sol Max implemented S0–S11; the interrupted implementation was resumed on the current account. All 18 accepted finding groups below are addressed in the measured scope.

**Final result:** 103/103 Node tests, 15 legacy suites, 7 native-host Python tests, the existing Chromium integration suite, **84 GREEN review cases**, and **246 passing Node performance GATE rows** (86 distinct IDs). Native P8 idle/navigation gates pass. No final HARNESS_ERROR, UNEXPECTED_RED, missing control, or changed golden remains. Same-text rendering remains an explicitly deferred SOFT miss.

The repository is not AEK-enrolled. The local S0 hash manifest records harness integrity; it is not an AEK human approval or protected snapshot. Changes remain local and uncommitted.

## Findings and behavior

| Finding | Implemented result |
| --- | --- |
| A01 | Removed credential entry from the page; the existing Options control opens extension settings. |
| A02 | Escaped external DOM, attribute, card and TSV fields; malformed AI entries are rejected or skipped. Card highlighting splits source text before encoding so entity names cannot be highlighted accidentally. |
| A03 | Added analysis ownership and a same-context duplicate gate; stale successes and errors cannot change a new drawer context or enrich its card. |
| A04 | Centralized timeline installation, added acquisition generations and source ranks, and ordered manual requests. Captions settle before automatic lyrics; the latest manual selection wins. |
| A05 | Published overlay-hidden state to the MAIN-world bridge; hidden playback leaves native CC and track choices alone. |
| A06 | Unified Quick and enriched Anki saves, configured routing/deck, kana and romaji, bare/wrapped AI data, truthful outcome labels, and one safe TSV exporter. |
| A07 | Serialized card save and clear in the real worker, validated payloads, checked acknowledgements/errors, and retried durable saves after evicting expendable caches. |
| A08 | Disposed old watch state and DOM synchronously; leaving watch detaches video listeners and observers, clears parser state, and hides stale UI. |
| A09 | Replaced truncated caption-array regex extraction with a bounded balanced JSON scanner; filtered caption URLs belonging to another video. |
| A10 | Identification and analysis use the selected provider only; saved keys no longer enable cross-provider fallback. |
| A11 | Removed required wildcard hosts, three unused permissions and two unused fetch proxies. Save and Test request missing configured endpoint origins; denial prevents settings writes. |
| A12 | Removed the duplicate reading engine from the data file and repointed legacy reading tests at the shipped closure. The unrelated legacy copied helper tests remain outside this reading-engine change. |
| X01 | Bounded WanaKana conversion at semantic boundaries, including long marks, sokuon, syllabic n and surrogate pairs; skipped identity ASCII chunks without changing their output. |
| X02 | Replaced quadratic tag stripping with a linear scanner that preserves original regex semantics. |
| X03/R01 | Bounded translations to 500 LRU entries and lyrics to 50 entries / 2,000,000 indexed payload bytes. Reconciled legacy unindexed keys and preserved user cards/settings. |
| X04 | Guarded repeated class/style/hidden writes and reused one lazy Japanese Segmenter. |
| R03 | Honored the configured caption backend and bounded acquisition fetches with AbortSignals. |
| R04 | Serialized title and channel prompt fields with JSON.stringify. |

The generator remains authoritative: interface, parsing, request and card changes live in `build_content_js.py`, with regenerated `content.js`. Storage ownership is in `background.js`; overlay ownership is shared with `js/youtube-bridge.js`; `js/card-export.js` is loaded before both popup and Options scripts. No bundler or wholesale module rewrite was introduced.

## Comparable measurements

These are deterministic observations, using the same workloads. Timings are reported separately. [Open the comparison chart](results/after/comparison.html).

| Observation | Baseline | Final |
| --- | --- | --- |
| Cue object field reads per update | 99920 | 0 |
| Model requests for five repeated clicks | 5 | 1 |
| Translation cache entries | 10000 | 500 |
| Segmenter constructions in 1,000 measured warm renders | 1,000 | 0; one lazy cold construction |
| Idle writes across 300 ticks, shown or hidden | 900 style + 300 class | 0 |
| 500-video cache, 8 KB lyrics | 500 entries / 4,069,890 bytes | 50 entries / 407,000 bytes |
| 500-video cache, 200 KB lyrics | 51 entries / 10,207,079 bytes; 449 failed writes | 9 entries / 1,801,260 bytes; 0 failed writes |

Cue lookup reads no cue-object fields after installation; installation reads exactly 2N start/end fields and binary searches use numeric arrays. The original inclusive-endpoint, first-array-match behavior for touching, overlapping and duplicate cues is preserved. Unsorted/non-finite inputs retain the original fallback behavior.

All three performance processes preserve the typical reading outputs and timeline goldens byte-for-byte. Automatic lyrics requests while captions are pending are zero. Late analysis leaves `lastAiData` null after context changes. Ten seeded concurrent-save schedules keep both cards. Cache pressure preserves all 200 seeded cards and a new settings write; recent-50 translations remain hits. Native Chromium recorded **0 idle mutations in 10 seconds**, with navigation deltas of **0 nodes and 0 listeners** between navigation checkpoints 5 and 30.

The original pathological parser showed quadratic slopes on the three-process 5k→40k span; the 160k confirmation was complete in two original processes. Final batched 20k→160k slopes span **0.788–0.988**, with cold 160k calls spanning **0.219–1.212 ms**, below the unchanged 250 ms catastrophe limit. Calibration, CV, MAD, empty-batch controls and raw samples are retained. Timings are machine-specific; count and equivalence checks provide the stronger evidence.

## Harness validity and corrections

S0 corrected storage promise rejection versus callback `lastError`, one worker per storage, source-race preconditions, installation priming, non-vacuous cache checks, bounded/batched P7 timing, strict after classifications, and mapped production entries. It added seeded tag/romaji differential tests and the proposed endpoint/enriched/permission/browser controls. The corrected baseline reproduced **22 GREEN / 54 EXPECTED_RED / 0 HARNESS_ERROR**, using derived original P7 data rather than repeating its costly timed-out run.

The intended A12 predicate requires **both** removal of the fork evaluator and removal of the exported fork. Baseline callback-free Quick Add writes were recorded honestly rather than incorrectly described as callback-only. Raw baseline evidence, witness regexes, target files and goldens were not relaxed or overwritten.

Post-S0 amendments are documented with before/after hashes and reasons in [harness-amendments.md](results/harness-amendments.md), with a matching JSON log. They correct staged dispatch, the independent reference worker stack, integer subprocess deadlines, missing fixture `clearTimeout`, and acknowledgement-based storage completion. The direct WanaKana reference alone receives an enlarged stack; production and native UI still run on ordinary stacks. The full after matrix runs the differential cases in three independent processes.

The first complete after performance attempt passed all 246 GATE rows but was rejected for three metadata errors: `counts.coldMs` was elapsed time, so it could not be identical between processes. The correction moves that same measurement to `timeMs.coldFirstCall`; the threshold, predicate, sizes, repetitions, and count validator are unchanged. [The original failed attempt](results/after/perf-attempt1/perf.json) is preserved. A three-process P7 recheck and the complete three-process performance rerun then passed with zero harness errors.

A resumed P6 run also exposed conversion overhead on 200 KB Latin runs. A failing production-function test confirmed redundant WanaKana calls. Identity ASCII chunks now bypass its recursive trie; the regression checks all 128 ASCII code points mixed with kana. P6 completes within its existing deadline. A separate failing test caught source highlighting accidentally splitting generated HTML entities; splitting source text before encoding fixed both card and TSV output.

Existing test adaptations preserve their requirements: `run_tests.js` and `test_gloss_romaji.js` load the real shipped closure; `test_drawer_context_sentence.js` matches actual card listeners and the shared save boundary; `test_extension_separation.js` loads the scripts declared by popup HTML. The old blanket-permission and unused-proxy assertions in `test_lyrics_fetch.js` / `run_tests.js` now assert narrow permissions and ignored proxy requests. No outcome assertion was removed to make a real defect pass.

## Verification evidence

[Machine summary](results/after/summary.json), [check commands and exit codes](results/after/checks/commands.json), [performance](results/after/perf/perf.json), [native P8](results/after/perf/p8-browser.json), [regression matrix](results/after/review/review-matrix.json), and [native long-reading supplement](results/after/review/native-reading.json) contain the final results. Raw NDJSON and stderr logs are retained beside each artifact. Staged failures and their later successful checks remain under `results/stage-*`.

Final command set:

```bash
python3 -I build_content_js.py                 # saved bytes compared after regeneration
# node --check was run separately for content/background/options/popup and every js/*.js file
node --test tests/test_*.js
node run_tests.js
python3 -I tests/test_native_host.py
node tests/browser_custom_ai.mjs
node tests/perf/run_perf.mjs --self-check
node tests/perf/process-selfcheck.mjs
node --expose-gc tests/perf/run_perf.mjs --profile after --repeat-processes 3 \
  --out docs/reviews/2026-10-28/results/after/perf
node tests/perf/perf_p8_browser.mjs --out docs/reviews/2026-10-28/results/after/perf
node tests/review/run_review_matrix.mjs --mode after --repeat-processes 3 --repeat-browser 3 \
  --perf docs/reviews/2026-10-28/results/after/perf/perf.json \
  --out docs/reviews/2026-10-28/results/after/review
node tests/review/run_native_reading.mjs --mode after \
  --out docs/reviews/2026-10-28/results/after/review
git diff --check
```

The [implementation snapshot](results/after/implementation-snapshot.json) records SHA-256 values. Regeneration is byte-idempotent, 7 JavaScript entry files pass syntax checks, the harness manifest matches its documented amendments, and all **120 baseline artifact hashes** remain unchanged. The measurement pass, including the preserved failed attempt and full rerun, took **21.4 minutes** against the 25-minute budget; see [measurement-summary.json](results/after/measurement-summary.json).

## Deferred work and practical limits

- `P3.sameText` still rebuilds 1,000 times for 1,000 explicit render calls. Memoization was explicitly deferred because parser-upgrade rendering must remain possible. This is a SOFT miss, not a skipped gate. No other emitted SOFT target fails in the final Node results.
- Real YouTube lifecycle/CSP/Trusted Types, remote provider services, the native optional-permission grant dialog, real AnkiConnect/CORS, and real Sudachi were not tested. The existing Chromium suite explicitly skips Sudachi without `PARSER_SERVER_DIR`. New tests use dummy keys, controlled transports, disposable profiles and local fixtures; they do not establish arbitrary script execution under YouTube CSP or real-service compatibility.
- Moving provider/Anki transport into the worker, optional cross-provider fallback, network disclosure/HTTPS policy for third-party endpoints, Gemini query-key transport, per-card storage/deduplication, and the historical TSV deck header remain deferred as proposed. A lost worker acknowledgement can leave save completion uncertain; the UI reports that uncertainty rather than confirming success.
- Duplicate track/deinflection definitions, remaining legacy copied helper tests, broader observer-root/timer changes, and refresh of the historical parsing verification document remain maintenance work. README now identifies that document as historical. This change does not claim hours-long leak/battery testing.
- This is implementation self-review following the already completed independent Sonnet and Sol Ultra reviews and Sonnet results review. No additional independent post-implementation review was requested or claimed.

Original review artifacts: [aggregate](aggregate-review.md), [Sonnet](sonnet-code-review.md), [Sol Ultra](sol-ultra-code-review.md), [performance proposal](performance-test-proposal.md), [baseline report](test-results-report.md), [Sonnet results review/fix proposal](results-review-and-fix-proposal.md).
