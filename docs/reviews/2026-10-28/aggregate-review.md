# Aggregated code and architecture review

Date: 2026-10-28  
Baseline: `3187787fd723fa20686cb97523d3b5ab1ccaffab`  
Branch: `t3/review-performance-fixes`

Independent inputs: [Sonnet 5.5](sonnet-code-review.md) and [GPT 6.1 Sol Ultra](sol-ultra-code-review.md). Both reviewed the same unchanged production/test snapshot without reading each other's findings. This report reconciles their evidence; it is not a third independent review. The coordinator spot-checked the initializer race, card handlers, parser boundary, and source references. No AEK enrollment or frozen harness applies to this repository.

## Overall assessment

The extension has useful defensive boundaries in its parser client, native launcher, custom-AI worker handler, and newer chat code. Its existing checks pass. The main weakness is inconsistent ownership: the generated content script owns acquisition, UI, network calls, credentials, and persistence, but applies request generations, validation, and serialization to only some of those paths.

The reviewers jointly identified **two P1 and ten P2 groups of concrete defects**, plus separately identified design/performance risks and lower-priority cleanup. Passing tests do not contradict these findings: many missing cases concern overlapping requests, multiple tabs, host-page DOM visibility, and the difference between copied test algorithms and shipped code. Neither review established arbitrary script execution under live YouTube CSP.

## Prioritized, deduplicated findings

The source reports contain precise baseline file/line references and reproductions. “Verified” below means verified by at least one independent reviewer, not a claim of live-service testing.

| ID | Priority / evidence | Finding and consequence | Source findings |
| --- | --- | --- | --- |
| A01 | P1 / browser reproduction | Inline API-key entry is inserted into YouTube's shared document. Page scripts can read the password field. Move credential entry to extension Options. | Ultra F1 |
| A02 | P1 / browser and harness reproduction | Sentence highlights, fallback romaji, lyric metadata, model gloss/error fields, and HTML card/export fields interpolate external text without appropriate escaping. Markup/resource injection is demonstrated; live YouTube script execution is unverified. | Sonnet F1; Ultra F2 |
| A03 | P2 / deferred-response reproduction | An old Ask Sensei analysis can overwrite a newly selected word/context and contaminate the enriched card. Duplicate requests are also allowed. | Ultra F3 |
| A04 | P2 / deferred-response reproduction | Reentrant initialization starts lyrics before captions settle. Late automatic work can overwrite captions or manually chosen subtitles, and timeline replacement does not consistently invalidate the rendered cue index. | Sonnet F2; Ultra F4 |
| A05 | P2 / production-bridge reproduction | The bridge's poll re-enables CC and Japanese tracks while the overlay is hidden, undoing the user's native-caption choices. | Sonnet F9; Ultra F5 |
| A06 | P2 / request/persistence reproduction and source tracing | Anki endpoint/deck settings are ignored; enriched saves never sync; Quick Add stores the surface as its reading and ignores API-level errors. Popup/Options exporters diverge and do not preserve the same card contract. | Sonnet F3/F12; Ultra F6 |
| A07 | P2 / independent-storage-snapshot reproduction | Concurrent whole-array card saves lose another save. Success is shown before a durable write, and clear/save operations have separate owners. | Sonnet F3; Ultra F7 |
| A08 | P2 / navigation reproduction | Navigation clears variables but leaves old subtitle/drawer/AI DOM usable; leaving watch pages bypasses cleanup entirely. | Ultra F8 |
| A09 | P2 / embedded-script fixture reproduction | Non-greedy regex extraction truncates caption-track JSON at nested `name.runs` arrays, causing valid tracks to be missed. | Ultra F9 |
| A10 | P2 / controlled-request reproduction | Automatic song identification and analysis fallback can use saved cloud keys despite the selected local provider, sending titles/sentences to an unselected provider. | Sonnet F7; Ultra F10 |
| A11 | P2 / manifest and caller tracing | Required wildcard hosts make optional endpoint permission guards ineffective. Unused permissions and dead unrestricted fetch handlers expand the privileged surface. | Sonnet F4 |
| A12 | P2 / source tracing and differential execution | Much of `run_tests.js` tests a separate reading engine and copied helper implementations. Sonnet measured 452 differences in 75,940 synthetic reading inputs; shipped behavior is sometimes better. Tests need to exercise the shipped implementation. | Sonnet F5; Ultra architecture/test-quality analysis |

## Risks and lower-priority work

These are not established performance regressions or measured memory leaks.

| ID | Status | Observation and appropriate next action |
| --- | --- | --- |
| R01 | P2 candidate; mechanisms verified, quota impact unmeasured | Translation and persisted per-video caches lack eviction; cache/card/settings writes ignore errors. Measure growth, bound expendable caches, preserve user cards, and surface failed writes. |
| R02 | Performance hypothesis | Time updates scan whole timelines; fallback readings do repeated synchronous work; player-wide mutation observation and recurring control/bridge work lack explicit budgets. Benchmark realistic and adversarial workloads before selecting optimizations. |
| R03 | P3 verified/configuration risk | Caption backend URL is hard-coded and several acquisition fetches lack deadlines. Validate configured routing and bounded failure time with local fixtures. Live caption endpoint compatibility is untested. |
| R04 | P3 verified | The Python string template makes prompt quote escaping a no-op. Serialize prompt metadata safely and verify generator correspondence. |
| R05 | P3 architecture/maintenance | Reading/deinflection ownership, provider routing, exports, and caption paths are duplicated. Prefer small shared ownership fixes; a wholesale bundler/module rewrite is not required to repair the reproduced defects. |
| R06 | P3 documentation/provenance | Architecture material and test counts are stale; vendor/data update provenance is incomplete. No specific upstream vulnerability or license violation was established. |
| R07 | Privacy disclosure risk | Sentence/word translations use an unofficial Google endpoint without a clear preference/disclosure. Document actual destinations and distinguish this from the demonstrated unselected-provider defect A10. |

## Architecture direction

1. Keep `build_content_js.py` authoritative and regenerate `content.js`; add a deterministic correspondence check. Point behavior tests at shipped functions rather than rewriting them in tests.
2. Give subtitle acquisition explicit video/source generations and source priority. Centralize timeline replacement and dispose presentation/listeners when a watch context ends.
3. Apply context versions and request identities to analysis as already done for chat and parsing. Keep credentials in extension-origin UI and restrict provider use to the selected provider.
4. Give card persistence one serialized owner in the service worker, with a normalized card model shared by Quick Add, enriched save, and both exporters. Keep durable saved cards separate from evictable caches.
5. Distinguish app enabled, overlay visible, and native CC ownership in the bridge. Preserve direct user choices when original captions are in use.
6. Treat all external strings as text at rendering/serialization boundaries and retain actual endpoint permission checks when narrowing required permissions.

## Baseline verification and practical limits

Both reviewers independently report:

- `node --test tests/test_*.js`: 86 passed.
- `node run_tests.js`: 15 legacy suites passed, with production-coverage limitations above.
- `python3 tests/test_native_host.py` (isolated interpreter flags varied): 7 passed.
- `node tests/browser_custom_ai.mjs`: passed using a disposable Chromium profile and local fixtures.
- Generated `content.js` matches the generator byte for byte.

The real Sudachi integration was skipped because `PARSER_SERVER_DIR` was absent. No live YouTube lifecycle/CSP validation, paid AI calls, actual Anki collection writes, linguistic dictionary audit, full accessibility audit, or sustained performance profile was performed. The browser fixture uses an extension-origin document shaped like YouTube and does not by itself verify both production worlds together.

## Requested next stages

1. **Sonnet:** propose reproducible performance tests with workloads, operation/latency/memory budgets, measurement method, and commands. Include targeted correctness/security regressions needed to validate the concrete defects without confusing a harness simulation with a real-browser boundary test.
2. **GPT 6.1 Sol High:** implement the proposed test harness without production fixes, run the unchanged baseline, and preserve raw measurements plus a test-results report.
3. **Sonnet:** review those results and harness validity, reconcile them with A01–A12, and propose focused fixes with acceptance criteria. Keep unmeasured risks distinct from demonstrated problems.
4. **GPT 6.1 Sol Max:** implement the proposed fixes, regenerate the bundle, rerun the same harness and existing regressions, and record resolved/deferred findings with reasons.

The user authorized this complete sequence. These local review/proposal artifacts do not imply a request to publish, merge, or deploy.
