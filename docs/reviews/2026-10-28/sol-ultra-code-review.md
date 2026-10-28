# Independent initial code review — GPT-6.1 Sol / Ultra

Date: 2026-10-28  
Repository: `/home/marsel/.t3/worktrees/LangPlayext/t3-1a9e7cd4`  
Branch and reviewed baseline: `t3/review-performance-fixes`, `3187787fd723fa20686cb97523d3b5ab1ccaffab`

This is an independent, repository-wide initial review. I read the source and existing checks directly, did not read another reviewer's report, and used no subagents or delegation. The checkout was clean at the reviewed commit when review began. There is no `.aek/project.json` or checked-in `AGENTS.md`; the supplied repository instructions therefore leave the existing workflow in force. Only this report was written by this review; production and test files were not edited. No commit, publishing, PR, implementation, or subsequent performance-test stage was attempted.

The review found **two P1 security/privacy defects and eight P2 functional/data-integrity defects**. Existing checks pass, but they miss several interactions between the page bridge, asynchronous content UI, and persistence. The findings below are verified from source and, where stated, focused execution. They are baseline defects, not claims that every issue originated in the last commit.

## Architecture and ownership

- `manifest.json` injects `js/youtube-bridge.js` into YouTube's **MAIN** world at document start. It controls YouTube's caption module, Japanese track selection, and CC through page events and a one-second poll.
- The isolated content world loads WanaKana, the parser client, a standalone deinflector, and the generated `content.js`. The bundle also defines its own deinflector. It owns subtitle acquisition, local fallback readings, asynchronous parser upgrades, overlay rendering, drawer/chat UI, external translations, most AI-provider calls, lyrics state, and card persistence.
- `build_content_js.py` is the authoritative source of that bundle. It extracts the two dictionary objects from `data/kanji-dict.js`, embeds `lib/deinflect-rules.json`, and emits the remaining application code from a Python string. The exported reading functions in the data file are **not** imported into the bundle; they constitute another implementation used by much of `run_tests.js`.
- `background.js` owns privileged custom-OpenAI requests, bounded/deduplicated parser HTTP calls, native-launch requests, lyrics-provider fetching, an external-URL fetch action, an Innertube action, and opening Options. Most cloud AI and Anki requests still bypass it from the content UI.
- Options owns configuration and provider connectivity checks; the popup owns YouTube navigation and collection export. The content UI has separate Anki and export-related assumptions, which have drifted from Options.
- `native/install_host.py` installs a fixed executable/path/port configuration and authorized extension origins. `native/native_host.py` validates framed native messages, locks startup across processes, probes loopback readiness without proxies, launches the separately installed backend, and prefers its virtual environment. The real `Server.py` and Sudachi implementation are outside this repository.

Good boundaries already present include parser offset/surface validation, parser cache/request limits and generation guards, chat context/request guards, saved-endpoint ownership for custom AI calls, and native origin/command validation. These protections are unevenly applied to the other flows.

## Verified findings

### F1 — P1: API-key entry is exposed to YouTube page scripts

**Confidence: high.** References: `build_content_js.py:3228–3277`, especially `3243`; generated `content.js:3418` and `3430–3452`.

**Trigger and impact:** A nonlocal AI-analysis error displays an inline password field inside the YouTube document. A user following the “Quick-save your API key” prompt enters a secret into DOM owned jointly with the host page. `type="password"` masks presentation; page JavaScript can still read `.value` or observe input events. Content-script isolation does not isolate these DOM nodes. The field is not cleared after saving, either. This unnecessarily exposes provider credentials to any page script running on that watch page.

**Evidence:** The production failure renderer creates `#lp-inline-api-key` in the drawer and reads it on Save. In a disposable Chromium DOM fixture running the production renderer, assigning `dummy-review-secret` to this field and reading `document.querySelector('#lp-inline-api-key').value` from the page returned that exact value. No real credential was used.

**Recommended fix:** Collect and edit credentials only on an extension-origin Options page or another isolated extension document. Replace inline credential entry with the existing settings action. Keep provider secrets out of the page DOM.

**Test gap:** No test asserts that failure UI contains no credential field in the host document. Add a security boundary check using page and isolated execution worlds, not only fake DOM objects.

### F2 — P1: External strings are interpolated into unsanitized HTML

**Confidence: high for HTML injection; script execution under live YouTube CSP was not tested.** References: `build_content_js.py:1802–1806`, `1877–1933` (especially `1914–1917`), `2585–2591`, `2690–2696`, `3228–3232`; generated `content.js:1978–1980`, `2051–2107`.

**Trigger and impact:** Model-generated gloss fields, lyric search metadata, model/provider error messages, and selected sentence text are inserted into HTML and attribute contexts without escaping. These are external strings, including data obtained through the HTTP Kugou fallback. A malicious or simply markup-containing value can introduce elements, attributes, resource loads, or misleading UI into YouTube. The raw sentence/highlight route also converts text that was safely displayed using `textContent` back into HTML. This is especially undesirable next to F1's credential prompt.

**Evidence:** In disposable Chromium, the production `renderPedagogicalBreakdown` given a `word_by_word[].meaning` containing a harmless `<img data-review-injected="true" ...>` produced a real image element when assigned to the normal results container. The function also inserts unescaped text inside a `title="..."` attribute. The separate chat Markdown renderer does escape HTML; its protection is not used by these renderers.

**Recommended fix:** Build the UI with DOM nodes and `textContent`, including highlights and tooltips. If a narrow subset of formatted content is intentional, use a reviewed sanitizer and a restrictive allowlist. Escape literal text separately from intentional markup when serializing HTML-enabled Anki/TSV fields. Validate model response shapes before rendering.

**Test gap:** Parser-romaji escaping is tested in `tests/test_japanese_parser.js:71–75`; gloss, metadata, error, and sentence-highlight sinks are not. Exercise literal angle brackets, quotes, event attributes, and resource elements against a real DOM. This finding does not claim that injected scripts acquire extension privileges.

### F3 — P2: A delayed breakdown can overwrite another word and contaminate its saved card

**Confidence: high; reproduced.** References: `build_content_js.py:3141–3198`, `3200–3220`, `3292–3311`; contrast the guarded chat path at `3050–3108`. Generated analysis handler: `content.js:3316–3465`.

**Trigger and impact:** Start Ask Sensei for word A, then select word B or navigate before A finishes. Unlike chat and parsing, the analysis handler does not capture/check `drawerContextVersion` or a request identity. It unconditionally replaces `lastAiData`, shows results and the enriched-save button, and updates the provider badge. An enriched save then combines B's current word/sentence with A's meaning. Multiple Ask Sensei clicks can also start overlapping paid or local inference calls and apply responses out of order. Local requests may take two minutes, making this an ordinary interaction window.

**Evidence:** Executed the production handlers using the existing VM harness, with deferred DeepSeek responses. After selecting 猫, starting analysis, selecting 犬, and completing the old response, the active word remained 犬 but `lastAiData.contextual_meaning` contained `CAT_FROM_OLD_REQUEST`. Clicking enriched save persisted that meaning with 犬 and 犬がいる.

**Recommended fix:** Give analysis the same context-version and request-identity discipline as chat. Check before starting work, after each await, in fallback/error handling, and before UI/data writes. Prevent duplicate submissions for the same context and cancel obsolete requests where the transport permits it.

**Test gap:** Existing stale-response tests cover parsing and chat, not analysis success, fallback, errors, repeated clicks, or enriched saves after a context switch.

### F4 — P2: Caption and lyrics acquisition race and overwrite higher-priority or manual subtitles

**Confidence: high; reproduced.** References: `build_content_js.py:2116–2125`, `3435–3438`, `3501–3512`, `3518–3564`; generated `content.js:3676–3739`.

**Trigger and impact:** On a new video, `checkAndInitVideo` records the video ID and awaits caption fetching. The one-second interval can enter again while that request is pending. The second invocation sees the same ID, skips the caption branch, and starts lyrics acquisition because the timeline is still empty. When either completes, its only meaningful ownership check is the video ID. Thus late lyrics overwrite captions that successfully arrived in the meantime, and late automatic results can overwrite a manual upload or an explicit modal search for the same video. This also starts redundant network/model work while captions are still being acquired or are available live.

**Evidence:** Invoked the real initializer twice with the local caption request deferred. The second call dispatched `FETCH_LRCLIB_LYRICS` before captions completed. Resolving captions first installed 猫; resolving lyrics afterward replaced the timeline with 犬. No navigation was involved. The automatic lyrics assignment also leaves `currentSubIndex` intact, as does manual upload, so replacing a timeline while the matching index is unchanged can leave the old cue rendered until the index changes.

**Recommended fix:** Maintain one acquisition generation per video plus explicit source priority/ownership. Await or settle caption discovery before automatic lyrics fallback, and invalidate automatic work when a user selects/uploads subtitles. Commit only if the request still owns the subtitle source. Centralize timeline replacement to invalidate the cue index and render immediately.

**Test gap:** Tests cover stale video IDs and modal button behavior, but not overlapping initializer calls, automatic versus manual source precedence, or replacement while the active cue index remains the same.

### F5 — P2: The bridge overrides native CC/language choices while the overlay is hidden

**Confidence: high; reproduced with production bridge.** References: `js/youtube-bridge.js:37–43`, `54–84`, `129`; `build_content_js.py:2022–2033` and `2282–2286`; `content.css:5–17`.

**Trigger and impact:** Hide the LinguaPlay overlay using the eye control, then turn YouTube CC off or select another original caption language. The content UI updates a CSS class only; the MAIN-world bridge remains enabled. Its next one-second poll switches back to Japanese and calls `ensureSubtitlesVisible`, turning CC back on. This contradicts the new UI's stated ownership rule that native captions are controlled by YouTube while LinguaPlay is hidden.

**Evidence:** With the actual bridge evaluated in its existing style of player harness, set the selected track to English and CC to false while the app remained enabled, then invoke its registered poll. The resulting state was `{cc:true, selected:"ja"}`. The eye handler emits no state that could suppress this behavior.

**Recommended fix:** Define bridge state separately for learning enabled and overlay presentation hidden. Suspend forced track/CC changes while the user is watching original captions. Avoid repeatedly undoing explicit user choices; request a track transition when learning is enabled rather than enforcing it indefinitely.

**Test gap:** `tests/test_youtube_bridge_toggle.js` covers app OFF, not the eye state. `tests/browser_subtitle_visibility_checks.mjs:169–178` tests native CC on an extension-origin fixture without the real MAIN-world bridge or a full polling interval. Run both production scripts together and verify choices remain stable across polls.

### F6 — P2: Anki actions do not honor configuration, sync behavior, or the displayed reading

**Confidence: high; request/persistence defects reproduced, remaining branches verified directly.** References: `options.js:96–109`, `295–309`; `build_content_js.py:2814–2867`, `3292–3315`; `popup.js:64–71`; `options.js:330–339`.

**Trigger and impact:** Configure a different AnkiConnect URL or deck and save a word, or use Save Enriched AI Card to Anki.

- Quick Add always POSTs to `http://127.0.0.1:8765` and deck `LinguaPlay`; neither saved setting is read. Options can report a successful test against one endpoint while the actual add targets another. The content path does not inspect AnkiConnect's JSON `error`, create a missing deck, or report a failed add.
- The enriched Anki button performs only local storage writes. It never invokes AnkiConnect, even when available, despite its label and README's described behavior.
- Quick Add persists `reading: word` and a separate `romaji` field. Both exporters use `reading` and ignore `romaji`, so the exported reading column repeats the Japanese surface instead of the displayed pronunciation. The enriched handler expects `target_word.reading`, whereas its own prompt requests top-level `reading`/`romaji`; it also does not normalize the `data` wrapper accepted by the renderer.

**Evidence:** With settings `MyDeck` and `http://127.0.0.1:9000`, the executed Quick Add handler still built the default endpoint/deck request. Selecting 来ない with the displayed reading `こない (konai)` persisted `reading:"来ない"`. Inspecting the actual enriched handler confirms that it has no network branch.

**Recommended fix:** Share one normalized card model and one Anki service between both save actions. Use saved deck/endpoint settings, preserve the selected parser reading independently of display text, normalize AI response envelopes, inspect AnkiConnect errors, and make the local-versus-synced outcome explicit. Reuse the same export serializer for Options and popup.

**Test gap:** `run_tests.js` verifies a separately implemented `buildAnkiPayload`, not the production button handlers. The popup export test checks that a blob download exists, not its contents. Test production handlers against a local AnkiConnect stub and inspect actual TSV bytes, reading fields, configured routing, missing-deck errors, and offline behavior.

### F7 — P2: Concurrent local card saves silently lose data

**Confidence: high; reproduced with independent storage snapshots.** References: `build_content_js.py:2822–2834`, `3301–3311` (generated `content.js:2997–3009`, `3476–3486`).

**Trigger and impact:** Save two words close together or save from two YouTube tabs. Both flows read the entire `linguaplay_cards` array, append locally, and replace the entire stored array. Two reads can receive the same snapshot; whichever write completes last removes the other new card. Storage writes are not awaited or checked, and both UI paths display success regardless.

**Evidence:** Executed two production Quick Add handlers with Chrome-like independent snapshots of the same empty collection. Their writes were separate arrays `["猫"]` and `["犬"]`, rather than a collection containing both. The second write necessarily replaces the first in the single storage key. This is an ownership issue even if buttons are disabled locally, because tabs remain concurrent writers.

**Recommended fix:** Give persistence one writer and serialize mutations in the worker, or store cards under unique IDs/use transactional storage. Acknowledge durable writes before displaying success. Coordinate Clear Collection with the same owner so a delayed save cannot unexpectedly restore cleared data.

**Test gap:** No concurrent same-tab/cross-tab save or storage-failure test exists. The content harness normally invokes storage callbacks synchronously and does not model independent serialized snapshots, masking this race.

### F8 — P2: Navigation resets variables but leaves the old study UI visible and usable

**Confidence: high; new-video case reproduced.** References: `build_content_js.py:3415–3418`, `3435–3460`; generated `content.js:3590–3593`, `3610–3635`.

**Trigger and impact:** Select a word on video A, then navigate to video B, especially a paused video or one with slow/failed caption discovery. The initializer clears timeline/context variables and increments versions, but does not clear the token DOM, remove the overlay's active/player-caption-hiding classes, hide/reset the drawer, or clear `lastAiData`. The page can show A's subtitle and word against B until another render happens. The drawer's old DOM remains actionable even though its backing context was cleared. When leaving `/watch` entirely, `if (!vid) return` skips cleanup altogether; listeners and pending work retain the prior video context.

**Evidence:** After rendering/selecting 猫 on A, switched the real initializer to `?v=B` with B's fetch deferred. State reported `currentVideoId:"B"`, an empty timeline/context, but the overlay was active with 猫 and the drawer was visible with 猫. This does not depend on a stale network response.

**Recommended fix:** Introduce a navigation reset/dispose operation that clears presentation synchronously, invalidates all pending work, clears AI data, and detaches old video/text-track bindings when leaving the watch experience. Rebuild only after the new video/source is ready. Keep any intentional pinned context explicit rather than accidentally reusing old DOM.

**Test gap:** Existing navigation tests manually install the next timeline before checking presentation. Add paused/failed-loading B, navigation to home/search, and Back/Forward cases with a drawer and analysis already open.

### F9 — P2: Regex extraction rejects valid caption tracks with nested name arrays

**Confidence: high; reproduced using the fixture shape already present in the repository.** References: `build_content_js.py:903–915`, `1083–1091`; generated `content.js:1077–1089`. The relevant nested shape appears in `run_tests.js:297–302`.

**Trigger and impact:** A page's caption track contains `name.runs`, an array inside the outer `captionTracks` array. `/"captionTracks":\s*(\[.*?\])/` stops at the first closing bracket, which closes `runs`, not `captionTracks`. `JSON.parse` then fails. Both script-data discovery and the fetched-watch-page fallback use this pattern, so the fallback can report no usable track even when a Japanese track is present. Users then incur slower/misleading lyrics or AI fallback instead of caption fetching.

**Evidence:** Passed a script containing a valid Japanese track with `name:{runs:[{text:"Japanese"}]}` to the actual `getOnPageCaptionTracks`; it returned `null`. The code's downstream language selector already supports `name.runs`, and legacy tests construct exactly this shape, but bypass extraction by passing the parsed array directly.

**Recommended fix:** Transfer structured player-response/track data through the existing MAIN-world bridge, or use a properly bounded JSON/array parser that respects nesting and strings. Do not regex-match nested JSON. Apply video-generation checks to bridge responses.

**Test gap:** Test the full discovery pipeline from embedded script/HTML, including `runs`, nested fields, escaped brackets/quotes, and multiple videos' script data, rather than only the track selector.

### F10 — P2: Selecting local AI does not prevent automatic calls to saved cloud providers

**Confidence: high; reproduced without external network calls.** References: `build_content_js.py:1338–1368`, `1446–1450`, `3200–3219`; generated `content.js:1512–1542`, `1620–1624`, `3375–3394`.

**Trigger and impact:** The user has a saved cloud key from an earlier configuration, selects the local provider, and the local server fails or produces unusable song metadata. Song identification iterates all providers with saved credentials, even though only one is selected. Automatic lyrics acquisition invokes this routine without a separate AI action. Analysis also silently retries Gemini after a local failure if a Gemini key exists. Consequently video titles, and for analysis selected sentences, can leave the machine and incur cloud usage despite the current local-provider selection. A saved key is not a current preference to use that provider as a fallback.

**Evidence:** Called the production song identifier with `linguaplay_ai_provider:'antigravity'`, a dummy saved Gemini key, a failed local fetch, and stubbed model responses. It attempted the local analysis URL and then the Gemini generate-content URL with the title prompt. The selected provider was never changed by the user.

**Recommended fix:** Respect the selected provider by default. Make cross-provider fallback a separate explicit setting with a clear destination/cost disclosure, and gate automatic song identification behind the corresponding preference. Retain ordinary non-AI lyrics search as a separate path.

**Test gap:** Current provider tests assert positive request construction only. Add negative assertions that local-only selection never contacts a cloud provider, including automatic lyrics fallback and analysis failure.

## Design and performance risks — not promoted to verified runtime defects

These are bounded follow-up targets, not claims of measured jank, a memory leak, or a production outage.

1. **P2 candidate, high confidence in code facts / unmeasured user impact: unbudgeted work and cache growth.** `build_content_js.py:1588–1608` keeps an unbounded sentence-translation map; `2594–2605` and `3539–3550` persist per-video lyrics without eviction. Card history shares storage with caches and writes do not surface quota failures. `3367–3377` scans the entire timeline on every time update. The fallback word-click romaji path tries many synchronous substring deinflections (`353–452`) and creates fresh segmenters (`601–604`). `setupLiveCaptionHooking` observes the entire player subtree and queries captions for every mutation (`1937–1964`). Controls polling also mixes style writes and geometry reads (`2059–2091`). Measure long videos, rapid seeks/cue changes, parser-offline sessions, long uploaded lines, repeated visits, and multiple tabs before selecting optimizations. Bound expendable caches separately from user cards and check persistence errors.
2. **P3 candidate, high confidence: application and dependency ownership are duplicated.** The dictionary file exports its own older reading/segmentation algorithms, the generator has different algorithms, and the manifest additionally loads a deinflector shadowed by the bundle's class. All YouTube pages load the roughly 420 KB generated bundle and start two one-second timers, including non-watch pages; app OFF leaves these lifetimes in place. Consolidate shared logic into buildable modules, preserve a deterministic generated output check, and define watch-page activation/disposal. This is an architectural recommendation, not an assertion that the current bundle size alone causes a visible performance problem.
3. **P2/P3 candidate, high confidence in mismatch / unverified external behavior: caption integration needs contract fixtures.** Caption backend fetching is hardcoded to `127.0.0.1:8000` (`build_content_js.py:1044`), while startup, parser, and AI use the configured server URL. A nondefault backend therefore is not used for that caption route. Innertube and timed-text fetches have no explicit deadlines, and the caption payload uses fixed client/version/signature values. The separate worker caption action is not called by the current content bundle. A focused helper check also returned no cues for `<transcript><text start="1" dur="2">猫</text></transcript>`; only the `p t/d` XML form is implemented. Verify the actual companion/YouTube response contracts before deciding which formats/routes to support. No live service compatibility was claimed here.
4. **P3 candidate, high confidence in repository inventory / provenance unverified:** the vendor/data integration lacks a clear pinned provenance/update inventory for WanaKana, the ported deinflector/rules, and the kanji data. The bundled WanaKana points to an absent source map. No dependency lockfile, root license, or third-party notice inventory was found among tracked files. Preserve and document upstream versions/licenses and reproducible updates; this review does not infer a specific license violation or known vulnerability. The architecture diagrams still describe pre-Sudachi pipelines and some removed Kuromoji/standalone paths, so they should be labeled historical or updated.

## Verification performed

All checks below were run locally against the reviewed baseline. Network/model replies were controlled by the repository's fixtures or by in-memory diagnostic stubs; no real API keys, paid model calls, real Anki collection, or user's installed native host/profile were used.

| Check | Result and practical scope |
| --- | --- |
| `node --test tests/test_*.js` | **86 passed**, 0 failed/skipped. Includes production-function VM checks, parser/worker/native-startup unit checks, and structural tests. |
| `node run_tests.js` | **15 legacy suites reported passing.** Portions test copied algorithms or the data-file implementation, not shipped handlers. |
| `python3 -B tests/test_native_host.py` | **7 passed** in about 4.2 seconds. Real isolated launcher/protocol processes; covers startup deduplication, origin/command validation, venv preference, restart, occupied port, startup failure, and bad frames. |
| `node tests/browser_custom_ai.mjs` | **Passed.** Real unpacked extension worker, temporary native-host installation, mock custom endpoint, and Chromium DOM/CSS/control/chat fixtures. |
| Optional real Sudachi integration | **Skipped by the browser runner:** `PARSER_SERVER_DIR` was not supplied. No external backend checkout was inspected. |
| Generator correspondence | Executed the generator's construction in memory, omitting its final output write. **Byte-for-byte identical** to `content.js`: 419,938 bytes, SHA-256 `f3d4bab5397bdff0d2c0b18ab6dd74c904c07f3fd991e7b01188ab102faaff0b`. |
| Static syntax/data checks | `node --check` passed for the first-party runtime JS entry points; Python `compile()` passed for generator, native helpers, and Python tests/fixture. Kanji table: **3,834 entries**, expected row shapes; rule JSON: **37 groups / 575 variants**. This validates structure, not linguistic accuracy. |
| Focused diagnostics | Reproduced F3/F4/F5/F6/F7/F8/F9/F10 with actual production functions and controlled deferred replies/storage snapshots. Disposable Chromium confirmed F1's readable dummy field and F2's element injection. A suspected empty-`innerHTML` observer feedback loop did **not** reproduce and is not a finding. |
| Repository hygiene | `git diff --check` passed before report creation. No production/test changes were made by this review. |

The browser UI fixture runs the content bundle on an **extension-origin document shaped like YouTube**, rather than navigating to live YouTube and loading both content worlds normally. That is useful DOM/layout evidence but cannot validate YouTube's actual player lifecycle, CORS/CSP/Trusted Types, server contracts, or bridge/content interactions. It explains why F5 can coexist with a passing “native CC” browser check.

## Explicit file coverage

| Files | Coverage |
| --- | --- |
| `manifest.json`, `.gitignore` | Read in full; entry points, permissions, worlds, web-accessible settings resources, and ignored build/runtime outputs assessed. |
| `background.js` | Read in full; all dispatch actions, sender checks, endpoint ownership, timeouts, deduplication, fallbacks, response handling, and native launch integration traced. |
| `build_content_js.py`, `content.js` | Generator application logic read end to end; generated runtime traced to it and entire output compared in memory. Caption/parsing/UI/translation/AI/chat/card/navigation/control flows reviewed. Generated dictionary/rule literals were structurally inspected, not linguistically audited entry by entry. |
| `js/japanese-parser.js`, `js/youtube-bridge.js` | Read in full, including parser validation/cache/cooldown/generations and bridge polling/event ownership. |
| `native/install_host.py`, `native/native_host.py` | Read in full and exercised with existing isolated process tests. No severe command-selection/origin defect was found in the reviewed helper path. |
| `options.html`, `options.js`, `options.css`, `popup.html`, `popup.js`, `popup.css`, `content.css` | Read; settings/save/test/export wiring, popup routing, DOM sinks, event handling, presentation state, native-caption CSS, sidebar/control placement assessed. Browser fixtures exercised main layout/control behavior. This was not a complete accessibility audit. |
| `data/kanji-dict.js` | Both embedded objects, data structure, exported duplicate reading/segmentation algorithms, and their test/build consumers inspected. |
| `lib/yomitan-deinflector.js`, `lib/deinflect-rules.json`, `lib/wanakana.min.js` | Deinflector algorithm and browser/Node exports inspected; rule-source equality exercised by existing tests and rule structure checked. WanaKana integration/exports and actual conversions exercised; minified internals were not independently audited line by line. |
| `run_tests.js` | Read, including direct data-engine loading, duplicated track/VTT/AI/Anki helpers, generated-function extraction, and structural assertions. Executed. |
| `tests/test_background_crash.js`, `test_chat_markdown_tables.js`, `test_drawer_context_sentence.js`, `test_drawer_tabs.js`, `test_extension_separation.js`, `test_gloss_romaji.js`, `test_header_definition.js`, `test_japanese_parser.js`, `test_logo_toggle.js`, `test_lyrics_fetch.js`, `test_review_regressions.js`, `test_server_startup.js`, `test_yomitan_deinflector.js`, `test_youtube_bridge_toggle.js` | Read and executed through the full Node run. Production-function coverage distinguished from string assertions, duplicate logic, and simplified DOM/storage behavior. |
| `tests/test_native_host.py`, `tests/fixture_server.py`, `tests/content_subtitle_helpers.js` | Read in full; protocol/process behavior, fixture isolation/cleanup, and helper extraction assessed. |
| `tests/browser_custom_ai.mjs`, `browser_subtitle_visibility_checks.mjs`, `browser_native_startup_checks.mjs`, `browser_japanese_parsing_checks.mjs`, `browser_sensei_chat_checks.mjs` | Read, including lifecycle/cleanup and fixture limitations. Default integrated browser run executed; optional external parser path read but not executed. |
| `README.md`, `docs/local-backend.md`, `PARSING_VERIFICATION.md` | Read in full; setup, feature claims, configuration, companion-repository ownership, historical results, and check commands compared with implementation. |
| `docs/diagrams/translation_architecture.mmd`, `docs/diagrams/translation_architecture.drawio`, `japanese-romaji-architecture.html` | Architecture labels, graph content, runtime relevance and stale claims inspected. The HTML's bundled Archify viewer/export utility was inventoried/sampled, not exhaustively audited across its approximately 15,000 lines. It is not a manifest runtime entry point. |
| `icons/*.png`, `docs/screenshots/*.png` | Asset references/existence considered; no binary image-content or screenshot-accuracy audit performed. |

## Test-quality conclusions and limitations

The newer tests meaningfully execute production parser, chat, worker, and control logic. Native-helper tests provide valuable real-process coverage, and the generated bundle is currently reproducible. However, source-string assertions and simulations of newly written mock logic cannot establish production behavior. The legacy “exhaustive” suite's API/Anki builders and early reading checks are particularly weak evidence for the shipped UI because those functions are independently implemented. The VM DOM does not reproduce mutation/layout or browser-origin boundaries; storage callbacks are usually synchronous and do not model durable failure or concurrent snapshots.

Priority additions are the per-finding negative/race/boundary checks above, a normal YouTube-origin fixture that loads the real bridge and isolated content together, and performance measurements with explicit workload/latency/memory budgets. This report is an initial review, not the later requested performance-test proposal or its approval.

No live YouTube/API/provider reliability assessment, real Sudachi morphology run, actual Anki sync, paid inference, sustained CPU/RAM/battery profile, store-install permission review, full accessibility review, exhaustive dictionary accuracy audit, or upstream vendor/license validation was performed. Historical benchmark claims in documentation were read as historical evidence, not revalidated or presented as this review's measurements.
