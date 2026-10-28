# Results review and fix proposal — Sonnet 5.5

- **Repository / baseline:** `/home/marsel/.t3/worktrees/LangPlayext/t3-1a9e7cd4`, branch `t3/review-performance-fixes`, `HEAD` = `3187787fd723fa20686cb97523d3b5ab1ccaffab`. `git status` shows only the untracked `docs/reviews/`, `tests/perf/`, `tests/review/`; the 54 tracked baseline files are unchanged (`integrity.json`).
- **Date / stage:** 2026-10-28. Stage 3 of the sequence: a *review of results and a fix proposal*. No production file, harness file, target, golden or raw artifact was edited; this Markdown file is the only write. No commit, push, PR or agent delegation.
- **Inputs read:** `test-results-report.md`, `results/baseline/{coverage.md,integrity.json,commands.json,env*.json,harness-sha256*.json}`, `performance-test-proposal.md`, `aggregate-review.md`, both source reviews, the full harness source (`tests/perf/**`, `tests/review/**`), the raw NDJSON for P1–P8, `recovery.json`, the recovery logs, and the production code for every finding (cited as `build_content_js.py:N`, "gen:N"; `content.js` line = gen + 174 after the data preamble).
- **Method:** the debug skill's four phases: root cause before fix. For each defect I traced the observed witness backwards to the owning statement, then asked whether the harness evidence is valid and non-vacuous *for the after run too*. Short probes (below) resolved open questions; their scratch scripts live in `/tmp/lpreview2/` and are not part of the repo.

**Probes run (all bounded, none modifies the repo):**

| Probe | Result |
| --- | --- |
| Fresh `pathological.js parser vtt` at 20k / 40k / 80k, one call each | 522 ms / 1,861 ms / 7,681 ms → slope 1.94. The machine is *still* in the slow state of baseline process 2 (governor `powersave`). |
| Idle mutation attribution (5 s, real two-world fixture, observer with `attributeOldValue`) | 5 records in 5 s, **all** `attributes:class` on `#linguaplay-yt-drawer`, old value `hidden`. Nothing else. |
| Chromium DOM-semantics micro-probe | `classList.remove('x')` of an absent token → 1 record; `classList.add('a')` of a present token → 1 record; `classList.toggle('a',true)` / guarded `contains` → 0; `style.setProperty` with an unchanged value → 0; with a new value → 1. |
| `wanakana.toRomaji('あ'.repeat(n))` | OK ≤ 4,500, `RangeError` at ≥ 5,000. Chunked variant (below) vs direct call on 3,000 random strings of 520–3,000 kana (many `ん っ ゃ ー`): **0 differences**. |
| Linear tag stripper vs `/<[^>]+>/g` | 200,000 fuzz strings over `< > a 猫 / i> <> \n`: **0 differences**. `'<'×160,000`: 0.013 ms vs ≈12 s. |
| `run_tests.js` with `getWordReading/generateSentenceRomaji/resolveToHiragana` bound to the *shipped* engine instead of `eval(kanji-dict.js)` | All 66 assertion lines pass, **0 assertion failures**. The A12 repoint is cheap and does not alter expectations. |

---

## 1. Verdict on the results and harness

### 1.1 Overall

The baseline is **valid evidence for A01–A12, X01, X03/R01, X04, R03 and R04**, with the objections and corrections in §1.3. The harness is well built: it loads the shipped bytes, guards its tail, uses controls and witness regexes, runs three processes, and exercises two real worlds in Chromium (`fixtureMode: "fetch-intercept"`; I confirmed the manifest-injected MAIN bridge and isolated content script both ran, via the browser rows and my own idle probe). The existing suites (86 / 15 / 7 / Chromium) are green, so red rows are not environment noise.

It is **not yet safe to run unchanged in `--mode after`**. Several fixtures would produce false failures or vacuous passes once ownership moves (§3). Fixing these *before* any production change is the first stage of the plan.

### 1.2 Claims I accept, and the strength of each

| Claim in the report | Verdict |
| --- | --- |
| 53 EXPECTED_RED / 22 GREEN, UNEXPECTED_GREEN = UNEXPECTED_RED = 0 | **Accepted.** Every red case has three repetitions, a witness regex match and a passing control (`run_review_matrix.mjs` rejects otherwise). |
| R-X02 = HARNESS_ERROR | **Accepted as a harness limitation, but it is not an unresolved product question** (§1.3 O1). It is resolved *offline* from existing raw rows. |
| Native token-click RangeError (X01) | **Accepted.** Uninstrumented manifest-injected code, short control green, 3/3 processes. |
| No navigation leak (P8: −5 nodes, 0 listeners) | **Accepted. Do not invent one.** The measured defect is stale *presentation* after navigation (A08), not leaked nodes/listeners. |
| Enriched Anki label green under the allowed disclosure | **Accepted as a valid test outcome, rejected as a product resolution** (§2 S8). |
| P1 reads/update, Segmenter constructions, idle writes, duplicate/stale work, unbounded caches fail deterministic gates | **Accepted** (26 failing GATE IDs plus the SOFT `P3.sameText`, listed in §4.3 and each mapped to a fix or an explicit deferral). |
| Decoder chunking and fixed-sleep A05 were repaired with before/after evidence | **Accepted.** Raw originals are preserved (`perf-original.json.gz`, `baseline-golden-original.json.gz`, `review-matrix-core.json`). |

### 1.3 Objections to measurements, claims and harness design

| # | Objection | Evidence | Disposition |
| --- | --- | --- | --- |
| **O1** | **The P7 third-process timeouts are an arithmetic consequence of the cap and a 2.5× slowdown, not an unexplained hang, and R-X02 need not stay open.** | Quiet processes 0/1: one 160k call = 11.5–12.5 s, so cold + 3 reps ≥ 46 s. The run used a 55 s cap. Process 2: calibration min 2.43 → 6.03 ms (×2.5), load average 4.16 after the run, 20k = 459–524 ms vs 182–193 ms (×2.5). At ×2.5, 160k ≈ 30 s/call, cold + 3 reps ≈ 120 s > 55 s *and* > the 90 s retry. My fresh probe, now, reproduces the slow state: 20k = 522 ms, 80k = 7.7 s. Process 2 *did* complete 5k/20k/40k for all three formats: slope(5k→40k) = 2.07 (vtt), 1.99 (srt), 2.04 (lrc), CV ≤ 13 %. | Accept quadratic tag stripping from **three** processes at the 8× span 5k→40k (identical size ratio to 20k→160k, so the same slope ≤ 1.3 / ratio ≤ 8 thresholds apply), with 160k as *confirmation* in two quiet processes. Resolve R-X02 by an offline derivation script (H6), not a rerun. Not a product timeout; do not describe it as one. |
| **O2** | **`recovery.json` lost the retry record.** The later `recover_baseline.mjs --merge-only` overwrote it with `runs: []`; the failed 90 s retry survives only in `logs/recovery.stderr.log` (`timedOut:true, durationMs:90070`). | `recovery.json` `runs: []`, `elapsedMs: 804`. | Provenance nit. Keep the log; add a line to the next report. No data lost. |
| **O3** | **Harness drifted after the reportable run.** Seven harness files differ between `harness-sha256.json` and `harness-sha256-final.json` (`area.js`, `browser-cases.mjs`, `process.mjs`, `process-selfcheck.mjs`, `recover_baseline.mjs`, `run_perf.mjs`, `recover_browser.mjs`). The current `area.js` P7 cap is 90 s but the executed run used 55 s (3 × 55 s fits the 212 s P7 wall clock, 3 × 90 s does not). | hash diff; `perf.json runs[].durationMs`. | Declared repairs (decoder, observed polls) explain most of it. Require a **frozen harness hash file after S0** and a closed list of authorised edits (§3.1). The after run must verify the hashes. |
| **O4** | **P8 idle gate names no culprit.** It counts records but not their identity. | Report row: "10 own mutations / 10 s". My probe attributes 100 % to `class` on `#linguaplay-yt-drawer`. | Accept the defect (X04) and name the owner (§2 S9). Extend P8 to record `{type, attributeName, target id, oldValue}` aggregates. |
| **O5** | **X04 as written overstates the DOM cost.** The fake counts three style ops per tick; in real Chromium same-value `style.setProperty` produces **no** record. Only the no-op `classList.remove/add` mutates. | Micro-probe table above. | Fix both (the fake gate is a valid proxy for avoidable work; the native row proves the real mutation), but describe X04 honestly: ~1 real record/s, no layout storm, no jank demonstrated. |
| **O6** | **P3.sameText and P1 timing are synthetic worst cases.** Production only re-renders the same sentence on parser upgrade or the `playing` retry; a 50k-cue file costs ≈0.46 ms per `timeupdate` (≈2 ms/s). | Report P1 table; callers of `renderSentenceTokens`. | P1 lookup and Segmenter caching are cheap, exactness-preserving and gated, so fix them (S6, S9). **Do not** memoise same-text renders (SOFT, risks the parser-upgrade re-render). Documented as deferred, not a defect. |
| **O7** | **X03 stress is artificial at 200 KB / entry; at 8 KB it is realistic.** | 500 × 8 KB = 4.07 MB (> 2.5 MB target, 40 % of quota); 200 KB case: 449 write failures; cards and settings survived. | Accept as a demonstrated unbounded-growth problem (P2/P3); the 200 KB case is a pressure test only. No user-card loss claimed or found. |
| **O8** | **P2 `getWordReading` super-linearity is an artefact of the entry shape.** Slopes 1.4–1.9 only when a whole 400–1600-char string is passed as one "word"; every sentence-level entry point is linear (slope 0.96–1.05 for `tokenize`, `renderSentenceTokens`, `generateSentenceRomaji` on `verb/long/target/latin/surrogate`). | slope table computed from raw NDJSON. | No optimisation proposed. Only the RangeError is a defect. |
| **O9** | **Fake `chrome.storage` is not Chrome-faithful for promise callers.** In Chrome MV3 `set()` without a callback *rejects* on quota error; the fake resolves and sets `lastError` that nobody reads. | `fakes.js` `schedule()`: `resolve(v)` for omitted-callback writes. | A correct fix that uses `await chrome.storage.local.set()` would still show "Saved" in R-A07-failure → false red. **Must fix in S0** (H1). |
| **O10** | **`create()` and `extensionPage()` have no worker.** Once cards and caches move to the worker, `sendMessage` replies `offline fixture`; failure-label tests (R-A06-status-*, R-A07-failure) would pass for the *wrong reason*, and R-A06-reading / R-A03-stale would read an empty store. `R-A07-clearRace` builds a second worker instance, so no shared queue. | `shipped.js:23`, `extension.js`. | H2: one shipped worker instance per storage object, forwarded by default. |
| **O11** | **R-A04-priority / -manual assert the bug as a precondition** (`precondition(resolveLyrics,'late lyrics in flight')`, `writes.some(lp_lyrics_cache_A)`). The correct fix removes that state, so the after run would throw `HarnessError`, not go green. | `cases.js:19-24`. | H4: same outcome assertion, bug-neutral preconditions. |
| **O12** | **P6 cache gate is vacuous if caching disappears.** `bytes ≤ 2.5 MB` passes with 0 bytes. And with the worker not wired (O10), cache writes would silently vanish. | `area.js` `P6`. | H7: positive control (newest entry present and parseable, entries ≥ 1). |
| **O13** | **Timing near the clock floor.** After the parser fix, 160k stripping is 0.013 ms; the current `timed()` takes single calls. | probe. | H6: batched samples, floor control, plus an absolute catastrophe gate; correctness gates are not relaxed. |
| **O14** | **`R-A12-corpus` is a source-text predicate** (`run_tests.js` contains `kanji-dict.js` and `eval(`) and `differences` is only an OBSERVE value. It would stay red after a correct repoint that still reads the data tables. | `cases.js:52`. | H9: exact outcome predicate (below). |
| **O15** | **Interval and listener preconditions encode implementation details.** `tick()` finds `fn.name === 'checkAndInitVideo'`; `playback()` asserts `video.listenerCount() === 2`. | `shipped.js:33`, `cases.js:12`. | Keep names, or update both in one place with the new documented values (H3). |

I make no objection to the target set in `targets.json`. Bounds are unchanged; where I change *how* a gate is evaluated (H5, H6) the thresholds stay as written.

### 1.4 Disposition of findings

Evidence strength: **R** reproduced in the harness (witness + control, 3/3), **N** native two-world Chromium, **M** mechanism proven from source/probe, **S** stress only.

| ID | Pri. | Verdict | Evidence | Root cause (owner) |
| --- | --- | --- | --- | --- |
| **A01** | P1 | Accept | R N | Inline `#lp-inline-api-key` created in the shared YouTube DOM by the AI error renderer (gen:~3228-3277). |
| **A02** | P1 | Accept (markup/element injection; script execution under live CSP *unverified*) | R N | `innerHTML` interpolation of external text: highlight (gen:~1801), gloss/title/error (gen:1877-1933, ~3228), lyrics/identified banners (gen:~2585-2591, ~2690-2696), Quick Add `Front/Back` (gen:2838-2860), both TSV exporters. Fallback romaji and quote-only highlight are green controls, not findings. |
| **A03** | P2 | Accept | R | `lp-ai-btn` handler (gen:3141-3290) has no context/request identity; unconditional `lastAiData = json`. |
| **A04** | P2 | Accept | R | `checkAndInitVideo` (gen:3415-3569) marks `currentVideoId` before `await fetchYouTubeCaptions`; the 1 s interval re-enters and starts lyrics; three writers assign `subtitleTimeline` with only a video-id check; none resets `currentSubIndex` consistently. |
| **A05** | P2 | Accept | R N | Bridge `ensureJapaneseTrackActive` (`youtube-bridge.js:54-89`, interval at `:129`) knows only `enabled`; the eye handler (gen:2282-2286) toggles a CSS class only. |
| **A06** | P2 | Accept; enriched label green but contract unresolved | R | Quick Add hard-codes `127.0.0.1:8765` / `LinguaPlay`, stores `reading: word` and the *display string* `こない (konai)` as `romaji`, ignores `result.error`; enriched handler never syncs, reads `target.reading` only, ignores the `data` envelope; exporters diverge. |
| **A07** | P2 | Accept | R N | Whole-array read-modify-write in two content handlers + Options clear, no owner, no `lastError` check. |
| **A08** | P2 | Accept | R N | New-video branch clears variables but not presentation; `if (!vid) return` skips cleanup (gen:3416-3418). |
| **A09** | P2 | Accept | R | Non-greedy `\[.*?\]` captures at gen:~915 and gen:~1088. Also `getOnPageCaptionTracks` ignores which video the embedded data belongs to (SPA navigation leaves stale `ytInitialPlayerResponse`): **not measured**, see 1.5. |
| **A10** | P2 | Accept | R | `identifySongWithSensei` builds `candidateProviders` from every saved key (gen:~1338-1368); analysis fallback `antigravity → gemini` (gen:~3200-3219). |
| **A11** | P2 | Accept | R N | `host_permissions` contains `http://*/*`, `https://*/*` identical to `optional_host_permissions`; `downloads/scripting/activeTab` unused; `FETCH_LYRICS_URL`, `FETCH_YOUTUBE_CAPTIONS` have no callers. |
| **A12** | P2 (test quality) | Accept | R | `run_tests.js` evals the fork in `data/kanji-dict.js`. Measured: 45 differences in 6,000 inputs (not 452; different corpus). Repointing the legacy suite produces 0 assertion failures. |
| **X01** | P3 robustness (user-reachable) | Accept | R N | Single owner: `toModifiedHepburnRomaji` (gen:311-325) and `getCardRomaji` (gen:1896) call `wanakana.toRomaji` on unbounded strings; WanaKana recurses per character (overflow ≥ ~5,000). Explains every P2 `adv.*` row (see 4.3). |
| **X02** | P3 robustness | Accept (3-process at 5k–40k, 2-process confirmation at 160k) | R | `/<[^>]+>/g` at gen:642, 667, 697, 725 is O(n²) when no `>` follows a run of `<`. |
| **X03 / R01** | P3 | Accept (growth + ignored write failures) | R S | Unbounded `lp_lyrics_cache_*` writes (gen:2596, 3541), unbounded `sentenceTranslationCache` (gen:1588); no `lastError` handling. |
| **X04** | P3 | Accept, scoped per O5 | R N | `ensureDrawerPlacement` (gen:1670-1683) and `ensurePlayerControls` (gen:2059-2092) write every 1 s tick. |
| **R03** | P3 | Accept | R | Hard-coded `http://127.0.0.1:8000/api/captions` (gen:1044); other acquisition fetches have no deadline. |
| **R04** | P3 | Accept | R | `title.replace(/"/g, '\\"')` in a non-raw Python string emits JS `'\"'`, a no-op (gen:~1327). |

### 1.5 Risks that remain unmeasured (not defects)

- Script execution of injected markup under live YouTube CSP / Trusted Types (A02 stays "element injection").
- Live YouTube lifecycle, real caption endpoints, real optional-permission grant flow, real Sudachi, real AnkiConnect.
- **Stale embedded caption data after SPA navigation** (A09 extension): `getOnPageCaptionTracks` could return the *previous* video's tracks. Mechanism plausible from source; two-video fixture not executed. I include a cheap `v=`-match guard in S6 but classify the claim as a risk until the added test demonstrates it.
- Service-worker kill between the card `get` and `set` in S7 (design risk of the proposed owner; bounded by single-call atomicity).
- Real timer drift, long-running memory growth over hours, battery/CPU on real YouTube.
- Page-wide `MutationObserver` cost on real YouTube (fixture is synthetic).
- Unofficial Google translate endpoint disclosure (R07) and Gemini key in URL query. Policy, not measured.
- Zero-width-only reading inputs, separate long-cue-text timeline sweep, installation accessor budgets.

---

## 2. Root causes and implementable fix plan

### 2.1 Ordering and dependencies

```
S0 harness corrections (no production change; baseline-neutral)
 └─ S1 A12 repoint legacy suite to shipped engine (tests + data file only; bundle unchanged)
     └─ S2 X02 parser tag stripping, X01 safe romaji
         └─ S3 A01 remove credential field, A02 escaping           (uses S2's shared-helper placement rule)
             └─ S4 A10 selected-provider only, R04 prompt, A03 analysis identity
                 └─ S5 A05 bridge overlay ownership
                     └─ S6 watch-context: timeline installer + index (P1), A04 priority, A08 dispose, A09, R03
                         └─ S7 storage owner in worker: A07 cards, X03 cache bounds, failure surfacing
                             └─ S8 A06 card contract, Anki routing/status, shared exporters
                                 └─ S9 X04 idle writes, Segmenter, translation LRU
                                     └─ S10 A11 permissions + Options permission requests + dead handlers
                                         └─ S11 docs / README / stale assertions
```

Rules for every stage: edit `build_content_js.py` (never `content.js` by hand), run `python3 -I build_content_js.py`, `node --check content.js`, run the stage's targeted cases and the full existing suites before starting the next stage, and keep a stage patch outside the tree (`git diff > /tmp/lp-sN.patch`). No commit unless the user authorises one. S1 is deliberately early so the 12 legacy suites guard the engine changes in S2/S3.

Rollback (all stages): baseline tracked files equal `3187787`, so `git restore --source=3187787fd723fa20686cb97523d3b5ab1ccaffab -- <stage file list>` followed by `python3 -I build_content_js.py` returns to baseline. Each stage touches a disjoint or ordered file set, so rolling back stage N leaves stages < N intact; later stages that depend on N (see arrows) roll back with it.

### S1 — A12: test the shipped engine (tests and data file only)

- **Root cause:** `run_tests.js:14-23` evals `data/kanji-dict.js`, whose exported `getWordReading`, `resolveToHiragana`, `segmentJapaneseSentence`, `generateSentenceRomaji`, `matchVerbInflectionAt`, `toModifiedHepburnRomaji` (`kanji-dict.js:208-576`) are a second implementation. `build_content_js.py:5-24` only consumes `SPECIAL_WORDS` and `KANJI_DB`. Probe: the legacy suite uses only `getWordReading` (25 uses), `generateSentenceRomaji` (5), `resolveToHiragana` (2).
- **Change:** (1) New `tests/shipped_engine.js` that loads `content.js` in a `vm` with the minimal stubs `run_tests.js:693-696` already uses and returns `{getWordReading, generateSentenceRomaji, resolveToHiragana}` from the shipped closure (append a tail like the perf harness, or reuse the 696 `replace` technique). (2) `run_tests.js`: replace `eval(kanjiDictCode)` with this loader. (3) Delete the duplicate exported functions and `PARTICLES/COMMON_WORDS` from `data/kanji-dict.js`, keeping `SPECIAL_WORDS` and `KANJI_DB` byte-identical (the generator's regex `export const SPECIAL_WORDS = ({.*?});` and the `KANJI_DB` extraction must still match). (4) Document the generator-freshness check in the README "Contributor notes": `python3 -I build_content_js.py && git diff --exit-code content.js` (valid on a committed tree; during development compare with `cmp` against a saved copy).
- **Files:** `run_tests.js`, `data/kanji-dict.js`, new `tests/shipped_engine.js`, `README.md` (one line).
- **Acceptance:** `node run_tests.js` still passes (probe: 0 assertion failures); `python3 -I build_content_js.py` leaves `content.js` byte-identical (the generator did not change); `R-A12-generated` stays green; `R-A12-corpus` green under the H9 predicate.
- **Compatibility:** no shipped behaviour changes; typical readings are by construction those of the shipped engine.
- **Rollback:** restore the three files.

### S2 — X02 and X01: parser and romaji robustness

**X02 root cause.** `/<[^>]+>/g` retries the greedy class from every `<` and scans to the end of the string when no `>` exists: Θ(n²). Four sites: gen:642 (XML branch), 667 (VTT line), 697 (SRT), 725 (LRC).
**Change.** One shared helper placed **between** the markers `  // ── Subtitle Parser` and `  // ── Language Detection Helper` (`tests/content_subtitle_helpers.js` slices content.js by those strings and runs the slice in a `vm`; a helper outside the slice would break existing tests):

```js
function stripMarkupTags(text) {            // exactly text.replace(/<[^>]+>/g, ''), in O(n)
  let out = '', pos = 0;
  for (;;) {
    const lt = text.indexOf('<', pos);
    if (lt === -1) break;
    const gt = text.indexOf('>', lt + 1);
    if (gt === -1) break;                    // no later '>' => no later tag can match
    if (gt === lt + 1) { out += text.slice(pos, lt + 1); pos = lt + 1; continue; }  // "<>" is not a tag
    out += text.slice(pos, lt); pos = gt + 1;
  }
  return out + text.slice(pos);
}
```
In the Python template there are no backslashes in this code, so no extra escaping is needed. Replace the four call sites (`.replace(/<[^>]+>/g, '')` → `stripMarkupTags(...)`). Verified: 0 differences over 200,000 fuzz inputs; `<a<b>` still strips whole.
**Acceptance:** `P7.markup.*` (output `猫 犬`) pass; new differential test (H11) `stripMarkupTags` vs the old regex over ≥ 100k seeded strings = 0 differences; `R-X02` green via the 3-process derivation and the §3 floor rule; existing `test_lyrics_fetch.js`/parser tests unchanged.
**Compatibility:** byte-identical output for every input. Cue counts, ordering and the 1 MiB / blank-line cases are untouched.

**X01 root cause.** `wk.toRomaji(hira)` (gen:322) and `window.wanakana.toRomaji(raw)` (gen:1897) recurse per character inside WanaKana; ≥ ~5,000 chars overflow the stack. Every RangeError in the P2 matrix (hira/kata/sokuon/latin/long/target/surrogate) is this call, reached via `getWordReading`, `generateSentenceRomaji` (one long kana token) or `tokenize`. The native click path goes `handleTokenClick → generateSentenceRomaji(activeText, …)`.
**Change.** One safe wrapper, used by both call sites, chunking at boundaries that cannot change WanaKana's output, and never throwing:

```js
function toRomajiSafe(text) {
  const wk = window.wanakana;
  if (!wk || !wk.toRomaji) return text;
  if (text.length <= 512) { try { return wk.toRomaji(text); } catch (e) { return text; } }
  let out = '', i = 0;
  while (i < text.length) {
    let j = Math.min(i + 256, text.length);
    // never split after ん/ン/っ/ッ, before small kana or ー, or inside a surrogate pair
    while (j < text.length && (/[っッんン]/.test(text[j - 1]) || /[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮー]/.test(text[j]) ||
           (text.charCodeAt(j - 1) >= 0xD800 && text.charCodeAt(j - 1) <= 0xDBFF))) j++;
    try { out += wk.toRomaji(text.slice(i, j)); } catch (e) { out += text.slice(i, j); }
    i = j;
  }
  return out;
}
```
(Double the backslashes only inside regex literals that contain them; none do here.) Also wrap the two UI entry points in `try/catch` that falls back to the surface (defence in depth): `handleTokenClick` romaji generation and the `lp-ai-btn` renderer, so one pathological cue can never stop the drawer opening. Do not add a length cap that changes output for ≤ 4,500-char inputs.
**Acceptance:** all `P2.adv.*` rows `exceptions = 0` for all entry points (`getWordReading`, `generateSentenceRomaji`, `tokenize`, `renderSentenceTokens`); `R-X01` and `R-X01-native-browser` green (10,000-kana token click opens the drawer, short control still green); `P2.typical.*.golden` byte-identical; new differential test (H11): `toRomajiSafe` equals direct `wk.toRomaji` on ≥ 3,000 seeded strings of 520–4,500 characters over the alphabet `あいうえおかきくけこんっゃゅょーさしすせそたちつてとなにぬねのは` plus katakana and a surrogate pair case. Probe: 0 differences already.
**Compatibility:** identical output below the chunk threshold; identical above it by the equivalence test. Typical sentence outputs never reach 512 characters, so their code path is the original single call.
**Rollback:** revert the helpers and the six call sites.

**Files (S2):** `build_content_js.py` only (+ regenerated `content.js`).

### S3 — A01 and A02: no credential field in the page; text is text

**A01 root cause.** The error branch of the `lp-ai-btn` handler renders `<input id="lp-inline-api-key" type="password">` plus provider select and save button inside `#linguaplay-yt-drawer`, which lives in the YouTube document (gen:~3228-3277). Any page script can read `.value`.
**Change.** Delete `lp-inline-provider`, `lp-inline-api-key`, `lp-inline-save-key-btn`, `lp-inline-key-status` and their listeners. Keep the error text and `#lp-go-options-btn` ("Open Extension Settings") with its existing `openExtensionSettings` handler. Wording: "Add or fix your API key in Extension Settings." Keys continue to live only in Options (extension origin) and `chrome.storage.local`; credentials remain readable by the isolated content script (not by page scripts) and no key ever enters page DOM.
**Acceptance:** `R-A01-1` green with `passwordFields === 0` and `mainWorldValue === null`; `R-A01-control` stays green (so the id `lp-go-options-btn` **must be kept**).
**Rollback:** restore the block.

**A02 root cause.** Every external string reaches `innerHTML` unescaped; the HTML parser can complete an unterminated payload with the next tag the template emits. Observed sinks (all verified by `R-A02-*`): `lp-sentence-jp` / `lp-chat-context-sentence` highlight (`parts.join(\`<span …>${token.surface}</span>\`)`), `renderPedagogicalBreakdown` (`${w.word}`, `${w.meaning}`, `title="…${w.role}…"`, `${r}`, `${providerTitle}`), the AI error banner (`${err.message}`), the lyrics-search banner (`trackName`, `artistName`, `prefixBannerHtml`), the identified-song banner, the Quick Add `Front`/`Back` HTML (`word`, `romaji`, `sentence`, `cleanSentEn`, `def`), and both TSV exporters.
**Change.**
1. Add to the bundle (near the other helpers, before first use):
   - `escapeHtmlText(s)`: `String(s ?? '')` with `& < > "` replaced by `&amp; &lt; &gt; &quot;`. **Do not escape `'`** in text contexts: WanaKana emits `n'` and escaping it would change reading goldens.
   - `escapeHtmlAttr(s)`: same plus `'` → `&#39;`.
2. Highlight: build from escaped parts: `parts.map(escapeHtmlText).join('<span style="…">' + escapeHtmlText(token.surface) + '</span>')` (the `else` branch already uses `textContent`).
3. `renderPedagogicalBreakdown`: escape `w.word`, `w.meaning`, `r`, `providerTitle` with `escapeHtmlText`, and every value inside `title="…"` with `escapeHtmlAttr`. Validate shape: `Array.isArray(wordByWord)`, each `w` an object with string fields, else skip the entry.
4. Error banner: `escapeHtmlText(err.message)`.
5. Lyrics / identified banners: escape `trackName`, `artistName`, `animeName`, `provName`, and build `prefixBannerHtml` from escaped parts.
6. Fallback romaji: apply `escapeHtmlText` to each non-markup `tokRomaji` / punctuation piece *before* the highlight `<span>` is composed (defence in depth; the harness shows today's corpus output is benign). The highlight markup itself is unchanged.
7. Quick Add / enriched payloads: `escapeHtmlText` for `word`, `romaji`, `sentence`, `cleanSentEn`; `def` is already HTML-safe (it is read from `innerHTML` of an element that was set from `textContent` or a static `JDICT` string) and is left as is. The bold-sentence split uses the escaped sentence and escaped word consistently.
8. Exporters: handled in S8 (shared module); until then no change.
**Acceptance:** `R-A02-gloss`, `-error`, `-highlight-0..3,5`, `-lyrics`, `-identified`, `-card-A` green; `R-A02-control`, `R-A02-highlight-4` and `R-A02-romaji` stay green; escaped chat unchanged.
**Baseline-golden handling (explicit, separate from reading semantics):** escaping applies only to the characters `& < > "`. The 1,000-line corpus contains none of them, the highlight markup is untouched, and `'` is not escaped, so **no golden is expected to change**. If any `P2.typical.*.golden` differs after S3, do not regenerate it: write `docs/reviews/2026-10-28/results/after/golden-diff.md` listing each differing input, old/new bytes and the reason, and obtain review. Safe-encoding diffs (only `&amp;`-class entities) must be reported separately from any change to kana/romaji letters, which would be a reading regression.
**Compatibility:** displayed text for ordinary input is identical; text containing `& < > "` now displays verbatim instead of being re-interpreted as markup.
**Files (S3):** `build_content_js.py`.
**Rollback:** revert the escaping edits; sinks return to baseline.

### S4 — A10, R04, A03: selected provider only; correct prompt; analysis identity

**A10 root cause.** `identifySongWithSensei` builds `candidateProviders` from the selected provider *plus every provider with a saved key* plus `antigravity` (gen:~1338-1368), and the `lp-ai-btn` error path retries Gemini when the local provider fails and a Gemini key exists (gen:~3200-3219). Saved keys are not preferences.
**Change.** `const candidateProviders = [primaryProvider];` and delete the Gemini retry. The `hasKey` precheck becomes provider-specific (selected provider has a key, a URL, or is `antigravity`/`opencode`), so a user with a saved Gemini key but no key for the selected DeepSeek gets a clear "missing key" message, not a silent Gemini request. Sending titles to the *selected* provider is unchanged. An opt-in cross-provider fallback setting is **not** introduced here (deferred; needs UI and disclosure).
**Acceptance:** `R-A10-id`, `R-A10-analysis` green (zero requests to `generativelanguage…`), `R-A10-control` green (selected Gemini still reaches only Gemini).
**Compatibility:** deliberate behaviour change; mention in README. Chat (`sendSenseiQuestion`) already routes to the selected provider.

**R04 root cause.** `build_content_js.py:~1327-1328` writes `'\\"'` inside a normal Python string, producing JS `'\"'`, which equals `"`. Quotes in a title therefore break out of the prompt field.
**Change.** Use `Title: ${JSON.stringify(title)}` and `Channel: ${JSON.stringify(channel || '')}` (no manual escaping; no Python-escaping hazard). Plain titles produce byte-identical prompts (`"…"`).
**Acceptance:** `R-R04-prompt` green (the field `JSON.parse`s back to `a "quote" \ path`); `R-A10-control` unchanged.

**A03 root cause.** The `lp-ai-btn` handler has no request identity: it captures `word/romaji/sentence`, awaits `callSenseiLlmApi`, then unconditionally assigns `lastAiData`, shows results and the enriched button; the error path rewrites `lp-ai-results`. `handleTokenClick` resets `lastAiData = null` but cannot invalidate an in-flight request.
**Change.** Module state `let activeAnalysis = null; let analysisSeq = 0;`.
- On click: `if (activeAnalysis && activeAnalysis.contextVersion === drawerContextVersion) return;` (the same-context duplicate gate), else `const analysis = activeAnalysis = {id: ++analysisSeq, contextVersion: drawerContextVersion, videoId: currentVideoId}`.
- `const isCurrent = () => activeAnalysis === analysis && analysis.contextVersion === drawerContextVersion && analysis.videoId === currentVideoId;` evaluated after every `await` and before every DOM or `lastAiData` write, in success and error paths. A stale completion returns silently (`console.debug`).
- `finally { if (activeAnalysis === analysis) activeAnalysis = null; }`.
- `handleTokenClick`, the navigation dispose (S6) and `setAppEnabled(false)` set `activeAnalysis = null`.
- `lastAiData` is stored with its `contextVersion`; the enriched-save handler refuses if it does not match the current `drawerContextVersion` (defence in depth for the saved card).
- Optional (not required by any gate): thread an `AbortSignal` into `callSenseiLlmApi` so obsolete requests are cancelled where `AbortSignal.any` exists.
**Acceptance:** `R-A03-stale`, `R-A03-dup`, `R-A03-error-late` green; `R-A03-control` green; `P4.askSenseiRepeat` (≤ 1 request for 5 clicks) and `P4.staleWrites` (`lastAiData === null` after a context switch) pass.
**Files (S4):** `build_content_js.py`.
**Rollback:** revert the three hunks independently.

### S5 — A05: separate "learning enabled" from "overlay hidden"

**Root cause.** The MAIN-world bridge (`js/youtube-bridge.js:37-89, 129`) enforces `track = Japanese` and CC on every second whenever `isAppEnabled`. The eye handler (gen:2282-2286) only toggles a class on `<html>`; the bridge cannot know the overlay is hidden. `ensureYouTubeCCEnabled()` in the content script also forces CC on acquisition.
**Change.**
- Content: in `updateSubtitleVisibility()` (idempotent, called on every state change and at init) dispatch `new CustomEvent('LINGUAPLAY_SET_OVERLAY_HIDDEN', {detail: {hidden: areSubtitlesHidden}})` only when the value changed since the last dispatch. Keep the existing `LINGUAPLAY_SET_APP_STATE` dispatch and its detail unchanged (existing contract tests assert it). `ensureYouTubeCCEnabled()` returns early when `areSubtitlesHidden`.
- Bridge: `let overlayHidden = false;` a listener for the new event; `ensureJapaneseTrackActive()` and the `LINGUAPLAY_REQUEST_TRACK_SWITCH` listener return immediately when `overlayHidden`; on `hidden:false` with `isAppEnabled`, call `ensureJapaneseTrackActive()` once so the visible control behaviour (restore Japanese/CC) is preserved.
**Acceptance:** `R-A05-node`, `R-A05-browser` green (selected stays `en`, CC stays off across ≥ 3 polls with `pollsObserved > 0`); `R-A05-control`, `R-A05-browser-control` green; `P5.bridge.steady` unchanged (0 mutations when already Japanese); `test_youtube_bridge_toggle.js` and `test_logo_toggle.js` unchanged and green.
**Compatibility:** while the overlay is visible nothing changes. While hidden, LinguaPlay no longer fights the user's native caption choice (the documented intent). Default `overlayHidden=false` at `document_start`, and the flag is page-session only, so no race with persisted state.
**Files (S5):** `js/youtube-bridge.js`, `build_content_js.py`. **Rollback:** revert both.

### S6 — Watch-context ownership: timeline, acquisition, navigation, captions

This stage has four coordinated parts. Implement and verify in the order 6a → 6d; they share state names.

**6a — One timeline installer and an exact index (P1, A04 sameIndex).**
- *Root cause:* `onTimeUpdate` (gen:3367-3389) scans from 0 on every `timeupdate`; `subtitleTimeline` is assigned in six places (gen:2120 upload, 2481 clear-cache, 2579 modal search, and three in `checkAndInitVideo`) and only some reset `currentSubIndex`.
- *Change:* `function installSubtitleTimeline(cues, {source, token})` is the only writer. It builds `timelineIndex = {timeline: cues, length, sorted, starts: Float64Array, prefixMaxEnd: Float64Array}` reading each `start/end` exactly once; `sorted` is true only if all values are finite and `start[i] ≥ start[i-1]`. It sets `currentSubIndex = -1` and calls `onTimeUpdate()` so a replaced cue renders immediately even when the matching index number is unchanged.
- `onTimeUpdate` first checks `timelineIndex.timeline === subtitleTimeline && length matches`, otherwise rebuilds lazily and forces `currentSubIndex = -1` (this makes direct assignments, including the harness's `setPlayback`, behave as replacements). Lookup for sorted timelines:
  - `k` = last index with `starts[k] ≤ ct` (binary search); if none → −1;
  - result = first index `i ≤ k` with `prefixMaxEnd[i] ≥ ct` (binary search on the non-decreasing prefix maximum).
  This returns **exactly** the baseline "smallest `i` with `start_i ≤ ct ≤ end_i`", including inclusive endpoints, touching cues (`[0,2]` before `[2,4]` at `t=2`), overlaps and duplicates (first in array order). Unsorted or non-finite timelines use the original linear scan unchanged. Cue objects are never mutated after creation (all parsers return fresh sorted arrays; verified by grep), so an identity/length check is a sound cache key.
- *Acceptance:* `P1.oracle.*` and `P1.characterisation` identical to the golden (touching/overlap/duplicate rows byte-equal); `P1.play.cueFieldReadsPerUpdate.n50000` median ≤ 16 / max ≤ 64, `P1.seek.*` ≤ 64 (after H5); `P1.same.renderCalls` 0; `R-A04-sameIndex` green; `P1.install.reads` ≤ 4N (observed 2N).

**6b — Acquisition generation and explicit source priority (A04).**
- *Root cause:* `currentVideoId` is set before the caption `await`; the 1 s interval, `yt-navigate-finish` and `popstate` all call `checkAndInitVideo`; the lyrics gate `subtitleTimeline.length === 0 && lyricsFetchAttemptedVid !== currentVideoId && !isFetchingLyrics` is true during the pending caption fetch; every writer commits on a video-id check only.
- *Change:* `acquisition = {vid, gen, captionsSettled:false, rank:0}` created when `vid` changes. Ranks: `manual (3)` = file upload and explicit modal lyrics search; `captions (2)`; `lyrics-auto/cached (1)`. `installSubtitleTimeline` accepts only if `token` is the current acquisition and `rank ≥ acquisition.rank`; equal rank replaces (a new manual choice wins over an older manual one). Set `captionsSettled = true` after `fetchYouTubeCaptions` resolves (cues or none) or when `!isAppEnabled` returns. The automatic lyrics gate adds `acquisition.captionsSettled`. Re-entrant ticks while captions are pending do injectUI/video binding and return. A late automatic result that loses the rank check is neither installed nor cached.
- *Acceptance:* `R-A04-overlap` (0 lyrics messages while captions pending), `R-A04-priority`, `R-A04-manual` (after H4), `R-A04-control` green; `P4.overlapTicks` 0 lyrics; `P4.acquisition.perSource` ≤ 3.
- *Compatibility:* captions still replace cached lyrics (rank 2 > 1) as today; a manual upload now stays authoritative until another manual choice or a navigation.

**6c — Navigation dispose (A08).**
- *Root cause:* the new-video branch resets variables but not presentation; `if (!vid) return` (gen:3418) never disposes; the drawer-placement observer, live-caption observer and `timeupdate/playing` listeners survive leaving `/watch`.
- *Change:* `disposeWatchContext(reason)`, called synchronously (before any `await`) when `vid` changes and when `vid` is absent and `currentVideoId !== null`. It: increments `acquisition.gen`, `subtitleRenderVersion`, `drawerContextVersion`; clears `subtitleTimeline`, `timelineIndex`, `currentSubIndex`, `renderedSentence`, `activeLiveSentence`, `drawerContextSentence`, `lastAiData`, `activeAnalysis`, `activeSenseiChatRequest`, chat DOM and history, AI results DOM; calls `renderSentenceTokens('')` (clears tokens, removes `active` and `linguaplay-has-japanese`); hides the drawer; `japaneseParser?.reset()`. For *leaving* watch it also removes `timeupdate`/`playing` from `activeVideoEl`, disconnects `liveCaptionObserver` and `drawerPlacementObserver` (setting `drawerSidebar = null`), clears `textTracks[*].oncuechange`, sets `activeVideoEl = null` and `currentVideoId = null`. Returning to a watch page re-binds through the existing `v !== activeVideoEl` branch. Idempotent, so the non-watch 1 s tick does no DOM work after the first call.
- *Acceptance:* `R-A08-newVideo`, `-leaveWatch`, `-backForward`, `R-A08-browser-newVideo`, `-leaveWatch` green; `R-A08-control` green; `P5.content.leaveWatch` (0 video listeners, 0 connected observers, drawer hidden, overlay inactive); `P5.content.navigations` unchanged (no growth); `P8.navigations` still passes.
- *Compatibility:* `setAppEnabled(true)` already sets `currentVideoId = ''` and re-inits; that path is unaffected. Do not add a third video listener, or update the `playback()` precondition in the same change (H3).

**6d — Caption extraction and routing (A09, R03).**
- *A09 root cause:* `/"captionTracks":\s*(\[.*?\])/` (gen:~915, ~1088) stops at the first `]`, which closes `name.runs`.
- *Change:* `extractJsonArrayAfterKey(text, '"captionTracks"')`: find the key, skip `:` and whitespace, require `[`, then scan with depth counting that skips JSON string literals (honouring `\` escapes), bounded to 2 MB, returning the balanced substring; `JSON.parse` inside `try/catch`. Use it in both the script path and the fetched-HTML path. `getOnPageCaptionTracks(expectedVideoId)`: when given, drop tracks whose `baseUrl` carries a different `v=` parameter (tracks without `v` are kept, so the harness's `fixture.invalid` URLs and the no-argument call still work).
- *R03 root cause:* `fetch('http://127.0.0.1:8000/api/captions?v=…')` ignores `linguaplay_server_url`; the Innertube, baseUrl and watch-HTML fetches have no deadline.
- *Change:* read `linguaplay_server_url` once per acquisition (default unchanged, http/https only, no credentials, trailing `/` trimmed), keep `AbortSignal.timeout(1500)` for the backend probe, add `AbortSignal.timeout(8000)` to the Innertube/page fetches and `10000` to the caption-file fetches. Total settle time is therefore bounded, which is what lets the lyrics gate (6b) wait.
- *Acceptance:* `R-A09-runs`, `-strings`, `-fetchedHtml` green; `R-A09-control` green; `R-R03-routing` green (`url.startsWith('http://127.0.0.1:19002')`, AbortSignal present).

**Files (S6):** `build_content_js.py`. **Rollback:** the sub-parts are separable; 6a alone is safe (pure index); 6b/6c depend on 6a's installer.

### S7 — One serialized storage owner in the service worker (A07, X03/R01)

**Root cause (A07).** Both content handlers (gen:2822-2834, 3301-3311) and Options "Clear" (`options.js:~345`) do `get → push → set` of the whole `linguaplay_cards` array with no shared owner and no `lastError` check; success is shown before any write completes. Two tabs, or a save racing Clear, lose or resurrect data (10/10 seeded schedules lose a card; clear resurrects `OLD_CLEARED`).
**Root cause (X03/R01).** `lp_lyrics_cache_<id>` is written at gen:2596 and 3541 with no cap or index; `cachedAt` is never read; the fake quota double shows 449 failed writes at 200 KB and 4.07 MB at 500 × 8 KB; failures are ignored. `sentenceTranslationCache` is an unbounded `Map` (gen:1588).
**Change (all in `background.js`, which must stay a plain script: do not add `import`, the harness and `test_background_crash.js` load it as script text).**
- A module-level promise chain `enqueue(fn)` serialises every mutation. Sender check `sender.id === chrome.runtime.id` (content scripts, Options and popup all qualify).
- `SAVE_CARD {card}`: validate (object; allowlisted keys `word, reading, romaji, meaning, sentence, sentence_en, date`; strings, each ≤ 4,000 chars; `word` non-empty), then inside the queue `get → push → set`; on a rejected `set` or `chrome.runtime.lastError`, **evict caches** (`lp_lyrics_cache_*`, the index) once and retry once; respond `{success, count}` or `{success:false, error}`. The array shape, key `linguaplay_cards` and existing cards are untouched: no migration.
- `CLEAR_CARDS`: same queue; `set({linguaplay_cards: []})`, ack only after success.
- `CACHE_LYRICS {vid, payload}`: payload ≤ 512 KB else skipped; maintain `lp_lyrics_cache_index` (array of `{id, bytes, t}`); after the write evict the oldest entries until ≤ **50 entries and ≤ 2,000,000 bytes** (satisfies the 2.5 MB gate with margin) and remove their keys in the same step; failures are non-fatal and returned. `REMOVE_LYRICS_CACHE {vid}` for the modal "clear cache" button (gen:2480).
- Content: replace the three direct cache writes and both card writes with `chrome.runtime.sendMessage` helpers that expose `lastError` and a bounded timeout, so the UI can state the real outcome (S8). Reads (`lp_lyrics_cache_<id>` get) stay direct.
- Translation cache: `sentenceTranslationCache` stays a `Map` with the same name (the harness reads `.size`), bounded to 500 entries with recency (`get` deletes and re-inserts; `set` evicts the oldest). All three direct users (gen:1593, 1607, 1822) go through two tiny helpers.
- Options: "Clear" posts `CLEAR_CARDS`, updates the counter only on success, shows an error otherwise; the Save-settings callback checks `chrome.runtime.lastError` and shows a failure toast (low-cost hardening for the ignored-write finding).
**Acceptance:** `R-A07-concurrent` (10 seeded schedules, always 2 cards), `-clearRace`, `-failure`, `-clearError`, `-quota` (real quota; label never says "Saved"), `R-A07-control`, `R-A07-clear-control` green; `P6.translationCache.n10000` entries ≤ 2,000 with recent-50 hits; `P6.lyricsCache.bytes8000.videos500` and both 200 KB rows ≤ 2.5 MB with positive control (H7); `P6.pressure.cards.*` 200 cards intact and settings write succeeds; `R-X03` green.
**Compatibility:** user cards are never evicted or reordered; only re-fetchable caches are bounded. Rapid double-clicks append two cards (as today); there is no deduplication. Service-worker termination between the `get` and the `set` can at worst fail the save (the content script shows "could not confirm", never "Saved"); it cannot lose already-stored cards because `set` is one atomic call.
**Files (S7):** `background.js`, `build_content_js.py`, `options.js`. **Rollback:** restore the three files; storage keys and shapes are unchanged, so old and new code interoperate (the extra `lp_lyrics_cache_index` key is ignored by old code).

### S8 — A06: one card contract, honest status, shared export

**Root cause.** (a) `lp-quick-anki-btn` (gen:2813-2870) reads neither `linguaplay_ankiconnect_url` nor `linguaplay_anki_deck`; (b) stores `reading: word` and `romaji: <display string "こない (konai)">` taken from `textContent` of `#lp-active-romaji`; (c) `.catch(() => {})` then unconditionally prints "✓ Saved to Anki Collection!"; (d) `lp-ai-anki-btn` (gen:3292-3315) never calls AnkiConnect, labelled "to Anki", reads only `target.reading`, ignores a `data` envelope; (e) `popup.js:64-72` and `options.js:330-340` export different bytes (first-occurrence vs all-occurrences bolding, with/without `sentence_en`).
**Chosen contract (resolves routing, reading and sync coherently):**
1. State `drawerActiveReading = {furigana, romaji}` set in `handleTokenClick` and updated by the parser upgrade (`refreshDrawerParsing`) alongside the displayed text. Quick Add stores `reading: furigana`, `romaji: romaji` (separate fields). Legacy stored cards are not modified.
2. A single `saveCard(card, ankiFields)` helper used by both buttons: it (i) sends `SAVE_CARD` (durable local list, S7) and (ii) in parallel POSTs `addNote` to `linguaplay_ankiconnect_url` (validated http/https, default `http://127.0.0.1:8765`) with `deckName = linguaplay_anki_deck || 'LinguaPlay'`, `AbortSignal.timeout(5000)`, and inspects `{result, error}`. **No extra `createDeck` request** (the control asserts exactly one stub request); a `deck was not found` error is reported with an actionable message. `duplicate` is reported as "already in Anki", not as failure.
3. Button text states the true outcome, and **failure states must not contain the word "Saved"** (the existing cases assert `!/Saved/i`): pending "⏳ Adding…"; both ok "✓ Added to Anki · stored locally"; local ok / Anki failed "⚠ Kept locally — Anki: <reason>"; local failed / Anki ok "⚠ Added to Anki — local copy failed: <reason>"; both failed "✗ Not added: <reason>".
4. The enriched button performs the same `saveCard` (so its label "to Anki" becomes true), using normalised AI data: `const ai = lastAiData.data || lastAiData; const t = ai.target_word || {}; reading = t.reading || ai.reading || drawerActiveReading.furigana || word; romaji = t.romaji || ai.romaji || drawerActiveReading.romaji; meaning = t.meaning || ai.contextual_meaning || ai.meaning` (+ the existing role suffix). `R-A06-enriched` stays green (a request is made) and gains a real contract.
5. New file `js/card-export.js` (classic script, no `import`), loaded by `popup.html` and `options.html` before their scripts, exporting `buildAnkiTsv(cards)`. Both exporters call it. Format = the Options version (superset): tab/CR/LF in fields replaced by a space; `word`, `reading`, `sentence`, `sentence_en` escaped with the full `& < > "` escaper; `meaning` neutralised by replacing `<`/`>` only (legacy `meaning` is already entity-escaped or plain AI text, so this is identity for old Quick Add cards and safe for enriched ones); bolding applied to the escaped sentence with the escaped word, all occurrences. The `#deck:` header line is **unchanged** (explicitly deferred; changing it would alter import targets for existing users).
**Acceptance:** `R-A06-route`, `-reading`, `-status-apiError`, `-status-offline`, `-envelope-bare`, `-envelope-wrapped`, `-exporters`, `R-A02-card-A`, `-card-B` green; `R-A06-control` and `R-A06-enriched` stay green. Add the two cases in H12 (enriched honours the configured route; enriched failure is not "Saved"). TSV rows keep four columns.
**Compatibility:** `linguaplay_cards` shape and key unchanged; legacy cards export as before (modulo escaping of previously unescaped text, which is intended); new Quick Add cards finally carry a kana `reading`. Anki network behaviour for default settings is unchanged (same URL, deck, one request).
**Files (S8):** `build_content_js.py`, `options.js`, `popup.js`, `options.html`, `popup.html`, new `js/card-export.js`, `README.md`. **Rollback:** restore these; stored data is untouched.

### S9 — X04, Segmenter, no speculative changes

- **X04 root cause (measured):** `ensureDrawerPlacement` runs every tick via `injectUI → ensurePlayerControls` and unconditionally calls `classList.remove('floating-fallback')` (or `add`), which Chromium reports as an attribute mutation even when nothing changes (probe: 1 record/s on the drawer). `ensurePlayerControls` also rewrites three style properties each tick (no native record for equal values, but counted by the fake).
- **Change:** guard with `if (drawer.classList.contains('floating-fallback') !== want)` before toggling; cache the last `--linguaplay-control-width`, `widget.style.bottom/right` strings and write only on change. Keep the geometry reads (cheap; needed to detect real changes). No change to observers or the 1 s cadence (reducing timers on non-watch pages is deferred).
- **Segmenter:** `tokenize` constructs `new Intl.Segmenter('ja-JP', {granularity:'word'})` per call (gen:603). Use a lazily created module-level instance (`let jaWordSegmenter = null`), created through the sandbox/global `Intl` at first use so the harness spy still counts constructions.
- **Acceptance:** `P3.idleTick.shown/hidden` 0 create/append/html/text/style/class/attribute ops over 300 ticks; `P8.idle` own records 0 in 10 s; `P2.segmenters.offline/absent` ≤ 10 per 1,000 renders; `P2.typical.*.golden` identical; `P3.liveObserver.*` unchanged (renders = 50 / 0).
- **Explicitly not changed:** same-text render memoisation (P3.sameText, SOFT, risks parser-upgrade re-render), observer root narrowing, WanaKana call counts.
- **Files (S9):** `build_content_js.py`. **Rollback:** trivial.

### S10 — A11: narrow permissions without breaking configured endpoints

**Root cause.** `manifest.json` lists `http://*/*` and `https://*/*` in both `host_permissions` and `optional_host_permissions`, so every `chrome.permissions.contains` guard (`background.js:70, 119`) and `options.js:79-80` request is decorative (`contains('https://example.invalid/*')` is true before any request). `downloads`, `scripting`, `activeTab` have no uses (grep: zero in all first-party files; export uses Blob + anchor). `FETCH_LYRICS_URL` (`background.js:421-445`, an unauthenticated fetch-anything proxy) and `FETCH_YOUTUBE_CAPTIONS` (`:153-209`) have no callers.
**Change.**
- `manifest.json`: remove `http://*/*` and `https://*/*` from `host_permissions`; remove `activeTab`, `scripting`, `downloads`; keep `tabs` (popup uses `tabs.query`), `storage`, `nativeMessaging`, the named hosts (`https://*.youtube.com/*`, lrclib, kugou, the three AI hosts, translate) and loopback (`http://127.0.0.1/*`, `http://localhost/*`; match patterns ignore ports, so any loopback AnkiConnect/Ollama/parser port keeps working). Keep `optional_host_permissions` as is.
- **Configured endpoints stay reachable via explicit user grant:** in `options.js`, a helper `ensureOriginAccess(urlString)` that, for a non-loopback http(s) origin not already contained, calls `chrome.permissions.request({origins:[…]})`. Call it (as the first `await` inside the click handler, to keep the user gesture) from: Save settings (collect the origins of `opencodeUrl` when provider is `opencode`, `serverUrl` and `ankiConnectUrl` and request them in **one** call), "Test local server" (`:278`), and "Test AnkiConnect" (`:301`). `background.js` already checks `permissions.contains` for the parser server and custom AI URL; those messages become meaningful. Content-script `fetch` to the AnkiConnect URL is governed by the page's CORS, not extension permissions, so it is unaffected.
- Delete `FETCH_LYRICS_URL` and `FETCH_YOUTUBE_CAPTIONS` handlers. Optional P3 hygiene: drop `options.*` from `web_accessible_resources` and the `window.open(getURL('options.html'))` fallbacks (gen:2758-2771), keeping `icons/*` only if referenced.
- Update the three existing assertions that encode the old state, each with a one-line justification in the fix report: `tests/test_lyrics_fetch.js:109` (broad permissions), `tests/test_lyrics_fetch.js:169-…` (dead handler test), `run_tests.js:812-816` (handler presence).
**Acceptance:** `R-A11-manifest`, `-deadHandlers`, `-deadHandlers-runtime`, `-guard` (real `permissions.contains` false for `https://example.invalid/*`) green; `R-A11-control`, `-worker-control`, `-browser-control` stay green; `node tests/browser_custom_ai.mjs` still passes (loopback mock endpoint); new case (H12): Options Save with a non-loopback Anki/server/custom-AI URL calls `permissions.request` with exactly those origins and does not save on denial.
**Compatibility:** users with non-loopback custom endpoints get one browser permission prompt the first time they save or test it, instead of silent blanket access. Headless Chromium cannot click that prompt, so the grant flow itself remains an honest limitation (as in the proposal).
**Files (S10):** `manifest.json`, `background.js`, `options.js`, the three test files, optionally `build_content_js.py`. **Rollback:** restore these (the permission set returns to baseline).

### S11 — Documentation

README: provider routing (selected only), Anki/enriched behaviour and status texts, permission prompts, the generator check from S1. Note the `PARSING_VERIFICATION.md` test counts as historical. No behaviour change.

---

## 3. Harness corrections and adaptations before fixes (S0)

All edits are test-harness-only and must leave the baseline results unchanged (verified by §4.1). None changes `targets.json` thresholds, `expected-baseline.json` witness regexes or goldens. Raw baseline artifacts are read-only.

### 3.1 Closed change list and freeze

Authorised edits (everything else needs written justification): `tests/perf/lib/fakes.js` (H1), `tests/perf/lib/shipped.js` (H2, H3, H11), `tests/review/lib/extension.js` (H2), `tests/review/lib/cases.js` (H4, H9, H12 and the symbol-name mapping in H3), `tests/perf/lib/area.js` (H5, H7), `tests/perf/lib/pathological.js` and `tests/perf/run_perf.mjs` (H6), `tests/perf/perf_p8_browser.mjs` (H8), `tests/review/run_review_matrix.mjs` (H6, H10), new files `tests/perf/derive_p7.mjs`, `tests/review/lib/differential.js`. After S0 write `docs/reviews/2026-10-28/results/harness-sha256-after-S0.json`; `run_review_matrix.mjs --mode after` and `run_perf.mjs --profile after` must fail with `HARNESS_ERROR HARNESS_CHANGED` if any harness hash differs, except files in a documented `harness-amendments.md` (each amendment lists file, reason, and why no gate was weakened).

### 3.2 Corrections

| # | Change | Why / how |
| --- | --- | --- |
| **H1** | Chrome-faithful storage double | In `storage()`: when a callback is passed, run it with `runtime.lastError` set on failure (unchanged); when **no** callback is passed, **reject** the returned promise with `Error(lastError.message)` on failure. Keep the `writes` log. Self-check: promise `set` over quota rejects; callback `set` sets `lastError` only inside the callback. Baseline-neutral: baseline code uses callbacks. |
| **H2** | One shipped worker per storage; default wiring | `background(s)` memoised by `s` (a `WeakMap`), modelling one MV3 worker. `create()` and `extensionPage()` forward `runtime.sendMessage` to it for **every action except** the legacy offline set `ENSURE_LOCAL_SERVER, FETCH_LRCLIB_LYRICS, PARSE_JAPANESE, CALL_CUSTOM_AI, OPEN_OPTIONS_PAGE`, which keep their current fixture replies (`options.message` still has priority). Support both callback and promise forms and `chrome.runtime.lastError`. `messages` still records every request. Baseline-neutral: baseline content sends none of the new actions. Add a precondition to card/cache cases that the worker received the expected action, so a mis-wired harness yields `HARNESS_ERROR`, not a pass. |
| **H3** | Entry mapping when ownership moves | Keep the *observation boundary* fixed and map only names. Table below. Any new production symbol needed by the tail is appended to `functions` (closed list; `MISSING_SYMBOL` guard unchanged). |
| **H4** | R-A04-priority / -manual | Remove the bug-as-precondition lines (`resolveLyrics` in flight; `lp_lyrics_cache_A` written). *priority:* start captions pending, tick twice, resolve captions with `猫の字幕`, resolve lyrics **if** a lyrics request exists, assert the final timeline text is still `猫の字幕`; record `lyricsRequestIssued` in the witness. *manual:* upload the manual file while captions are pending, then resolve captions and any lyrics request, assert the timeline is still the manual text. Baseline stays red (late lyrics/captions overwrite), after is green, and the precondition that captions/manual were actually installed is kept. Add an expected-green guard `R-A04-cachedLate` (cached-lyrics storage read delayed past captions install must not overwrite). |
| **H5** | P1 first-update priming and install reads | In `P1`, after `setPlayback` and before the per-update loop, perform one priming `timeupdate` at an unmeasured time, and record the priming update's reads as `P1.install.reads` (SOFT ≤ 4N). Justification: the proposal itself says "install may use O(n); count the lookup path". Also run the timing batch until each sample is ≥ 5 ms (below the 1 ms floor the timing is observation-only); counts remain the authority. |
| **H6** | P7 harness: bounded, partial, floor-aware | (a) `pathological.js` emits one NDJSON line per call (cold, rep1, …) so a timeout leaves a partial witness. (b) Caps computed, not fixed: `cap = max(60 s, 4 × expected_time × calibrationFactor)`, where `expectedTime` is the baseline median for that size and `calibrationFactor` = current calibration median / recorded 4.16 ms; if the cap would exceed the 25-minute budget, run **cold + 1** at 160k (baseline mode only). (c) New `derive_p7.mjs --raw <dir> --out <file>` reads existing raw NDJSON (read-only) and applies the unchanged slope/ratio rule on the **5k→40k** span for all three processes (equal 8× span, same thresholds) plus 20k→160k where present; emits `P7.tagStrip.scaling.*` rows with `evidence:"derived"` and the per-process table. Use it to rebuild baseline R-X02 as EXPECTED_RED (3/3 processes at 5k–40k, 2/3 at 160k) into `results/baseline-recheck/`, never overwriting `results/baseline/`. (d) **After mode / near the clock floor:** every sample is a batch of `k` calls with `k` doubled until the batch is ≥ 10 ms (cap 100,000), reporting per-call = batch/k; subtract a measured empty-batch control; a sample is *floor-limited* if the batch is < 20× the empty-batch jitter. The ratio/slope gate (≤ 1.3 / ≤ 8) is evaluated unchanged on batched medians with ≥ 2 of 3 processes, CV ≤ 25 %, effect > 3×MAD. A **catastrophe gate** is always evaluated and is decisive when the ratio gate is floor-limited or noisy: single cold `160k` parse ≤ 250 ms (baseline 11.5–12.5 s quiet, ≈30 s throttled, so it separates by 40–100× and cannot be tuned by noise). Correctness gates (`P7.markup.*`, exact cue counts, `outputEquivalent`) are untouched. |
| **H7** | P6 non-vacuity | For `P6.lyricsCache.*`, require entries ≥ 1 and the newest video's entry present and parseable (`parseLRC` > 0 cues) *and* that at least one `CACHE_LYRICS`/direct write occurred; otherwise `HARNESS_ERROR`. Translation cache: keep "recent-50 refetches = 0". Card pressure case: assert cards equal the seeded 200 and the settings witness persisted. |
| **H8** | P8 attribution | In the idle observer record `{type, attributeName, target id/class, oldValue}` and aggregate counts; emit the aggregate in `P8.idle`. Gate unchanged (0 own records). Add `longTasks` count to the row summary. |
| **H9** | R-A12-corpus predicate | Replace `forkUsed` with: **pass iff** the legacy suite no longer evaluates the fork's reading functions *and* `data/kanji-dict.js` no longer exports them, i.e. `!(run_tests.js includes 'eval(' of kanji-dict.js) || !(kanji-dict.js matches /export function (getWordReading|resolveToHiragana|generateSentenceRomaji)/)`, evaluated as "neither remains". Keep recording `differences` as OBSERVE (becomes N/A when the fork is gone). Baseline still red (both present). |
| **H10** | Runner strictness and ergonomics | `run_review_matrix.mjs --mode after` additionally fails on any `HARNESS_ERROR`, any `LIMITATION` row, a missing control, or a case in `expected-baseline.json` with `expected:'red'` that is not `GREEN` (already `UNEXPECTED_RED`; make the exit message explicit). Add `--only <glob,glob>` and `--repeat-*` already present for staged runs, and `--area <p1,…>` for `run_perf.mjs`; staged runs are non-reportable and write under `results/stage-<N>/`. Add `--perf <path>` so the matrix reads R-X02/R-X03 from an explicit perf file. |
| **H11** | Differential tests | New `tests/review/lib/differential.js` with seeded cases run in the matrix: `R-X02-equivalence` (`stripMarkupTags` vs the old regex, ≥ 100k strings) and `R-X01-equivalence` (`toRomajiSafe` vs direct `wk.toRomaji`, ≥ 3,000 strings). Append `stripMarkupTags` and `toRomajiSafe` to the tail `functions` list only for these cases; they have no baseline counterpart, so register them as `expected:'absent-at-baseline'` (the runner treats `MISSING_SYMBOL` at baseline as expected) or run them only in `--mode after`. |
| **H12** | New cases (green in after only; documented absent at baseline) | `R-A06-enriched-route` (enriched honours configured URL/deck), `R-A06-enriched-failure` (apiError → label has no "Saved"), `R-A07-settingsError` (Options Save with failing `set` shows a failure toast), `R-A11-optionsPermission` (non-loopback origins trigger one `permissions.request`; denial → no save), `R-A05-browser-multipoll` (≥ 3 real polls with `pollsObserved>0`). |

**H3 entry-mapping table** (outcome assertions stay as written):

| Observation boundary the test asserts | Baseline owner | Mapping if ownership moves |
| --- | --- | --- |
| Timeline text / index after `timeupdate` | direct `subtitleTimeline =` via `setPlayback` | Keep `setPlayback`'s assignment (lazy index rebuild + forced re-render on identity change is required behaviour, 6a). Do **not** switch the tail to the installer. |
| Production tick | `setInterval(checkAndInitVideo, 1000)`, found by `fn.name` | Keep that exact registration. If a differently named scheduler is introduced, change the lookup list in `shipped.js` `tick()` only (`['checkAndInitVideo', '<new>']`). |
| Video listeners | `listenerCount() === 2` after attach | Keep two. If a listener is added, update `playback()` to the new documented count and keep `leaveWatch === 0`. |
| Card/cache persistence | content writes `chrome.storage.local` | Worker messages (S7). Assertions read the same storage double (`h.storage.state`), unchanged. Wiring via H2. |
| Model request count / destination | content `fetch` category `deepseek/gemini/localAI` | Provider calls stay in the content script (S4 does not move them), so `h.calls` remains valid. If a later change moves them to the worker, count them at the worker's `fetch` recorder through the same `category()` function. |
| Anki request | content `fetch` category `anki` (or configured URL) | Unchanged (S8 keeps the transport in the content script). |
| Sink text/DOM | production element ids | Keep ids `lp-sentence-jp`, `lp-chat-context-sentence`, `lp-ai-results`, `lp-search-results-list`, `lp-go-options-btn`, `lp-quick-anki-btn`, `lp-ai-anki-btn`, `linguaplay-visibility-toggle`, `clear-cards-btn`, `saved-card-counter`. |
| Bridge state | `loadBridge(h)` evaluates `js/youtube-bridge.js` in the shared sandbox | New event name is internal; the tests drive the real eye handler, so no mapping needed. |

---

## 4. Verification

### 4.1 S0 (before any production change)

```bash
git rev-parse HEAD                                   # 3187787fd723fa20686cb97523d3b5ab1ccaffab
git status --porcelain -- . ':!docs/reviews' ':!tests/perf' ':!tests/review'   # must be empty
node --test tests/test_*.js && node run_tests.js && python3 -I tests/test_native_host.py && node tests/browser_custom_ai.mjs
node tests/perf/run_perf.mjs --self-check && node tests/perf/process-selfcheck.mjs      # extended for H1/H2/H6
node tests/perf/derive_p7.mjs --raw docs/reviews/2026-10-28/results/baseline/perf/raw \
  --out docs/reviews/2026-10-28/results/baseline-recheck/perf/p7-derived.json
node tests/review/run_review_matrix.mjs --mode baseline --repeat-processes 3 --repeat-browser 1 \
  --perf docs/reviews/2026-10-28/results/baseline-recheck/perf/perf.json \
  --out docs/reviews/2026-10-28/results/baseline-recheck/review                        # ~1 min
node --expose-gc tests/perf/run_perf.mjs --profile baseline --area p1,p3,p4,p5 --repeat-processes 1 \
  --out docs/reviews/2026-10-28/results/baseline-recheck/perf                           # seconds
```
**Expected:** every case has the *same* classification as `results/baseline/review/review-matrix.json` (GREEN 22, EXPECTED_RED 54 now that R-X02 is derived, UNEXPECTED_* 0, HARNESS_ERROR 0); the re-run P1/P3/P4/P5 gate verdicts equal the baseline ones. The costly full baseline (P2 48 s, P6 20 s, P7 160 s × 3 processes) is **not** rerun. Then write the frozen hash file (§3.1).

### 4.2 Per-stage commands (S1–S11)

```bash
python3 -I build_content_js.py && node --check content.js && git diff --stat
node --test tests/test_*.js && node run_tests.js                     # every stage
node tests/browser_custom_ai.mjs                                     # S3, S5, S7, S8, S10
python3 -I tests/test_native_host.py                                 # S7, S10 (background.js)
node tests/review/run_review_matrix.mjs --mode after --repeat-processes 1 --repeat-browser 1 \
  --only '<stage case globs>' --out docs/reviews/2026-10-28/results/stage-N/review
node --expose-gc tests/perf/run_perf.mjs --profile after --area <areas> --repeat-processes 1 \
  --out docs/reviews/2026-10-28/results/stage-N/perf
```
Stage case/area selection: S1 `R-A12-*`; S2 `R-X01*`, `R-X02*`, `P2.adv.*`, `P7.*`; S3 `R-A01-*`, `R-A02-*`; S4 `R-A03-*`, `R-A10-*`, `R-R04-*`, `P4`; S5 `R-A05-*`, `P5.bridge`; S6 `R-A04-*`, `R-A08-*`, `R-A09-*`, `R-R03-*`, `P1`, `P4`, `P5`; S7 `R-A07-*`, `R-X03`, `P6`; S8 `R-A06-*`, `R-A02-card-*`; S9 `P2.segmenters`, `P3`, `P8.idle`; S10 `R-A11-*`; S11 none. Do not start the next stage while a stage case or an existing suite is red, and never mark baseline-red as success.

### 4.3 Final verification (the same harness, `after`)

```bash
cp content.js /tmp/lp-content-before.js && python3 -I build_content_js.py && cmp content.js /tmp/lp-content-before.js   # regeneration is idempotent: the generator reproduces the bundle you ship
node --check content.js js/*.js background.js options.js popup.js && git diff --check
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
  --out docs/reviews/2026-10-28/results/after/review
node tests/review/run_native_reading.mjs --mode after --out docs/reviews/2026-10-28/results/after/review
```
Keep the measurement pass within 25 minutes and every child bounded. After the fixes the P7 160k jobs are milliseconds, so the previous timeout problem cannot recur; if it does, the run is `HARNESS_ERROR`, not a pass.

**Expected dispositions (after):**

| Item | Expected |
| --- | --- |
| Existing suites | 86 Node tests (plus those updated in S10 with justification), 15 legacy suites, 7 native, Chromium check: all pass; Sudachi integration still skipped (no `PARSER_SERVER_DIR`). |
| Regression matrix | All 76 baseline cases **GREEN** (22 previous + 54 previously red incl. derived R-X02) plus the H11/H12 additions green; `EXPECTED_RED = 0`, `UNEXPECTED_RED = 0`, `UNEXPECTED_GREEN` not applicable, `HARNESS_ERROR = 0`. A case that stays red is a defect, not a "known baseline". |
| Native X01 | `EXPECTED_RED → GREEN` in 3/3 processes (10,000-kana click opens the drawer, no RangeError). |
| Perf GATE rows | All 26 baseline-failing GATE IDs pass: `P1.{play.head,play.tail,seek.random,seek.gap}.n50000`, `P2.segmenters.{offline,absent}`, `P2.adv.*` (10 rows; one root cause X01), `P3.idleTick.{shown,hidden}`, `P4.{overlapTicks,askSenseiRepeat,staleWrites}`, `P5.content.leaveWatch`, `P6.translationCache.n10000`, `P6.lyricsCache.*` (3 rows); `P7.tagStrip.scaling.*` ×3 pass (or are floor-limited and decided by the catastrophe gate with the reason recorded); `P8.idle` own records 0; `P8.navigations` and long tasks still pass. |
| SOFT rows | `P3.sameText` remains a documented SOFT miss (deferred by design, O6). Any other SOFT miss (e.g. `P2.slope`, `P8.navigationHeap`, `P2.typicalLineP95`) needs a written explanation; none is a gate. |
| Goldens | `P2.typical.*.golden` pass (byte-identical) and `P1.characterisation` identical. A difference triggers `golden-diff.md` review as in S3; it is never regenerated silently. |
| Integrity | Raw baseline tree, `perf-original.json.gz`, `baseline-golden-original.json.gz`, `review-matrix-core.json` unchanged; harness hash file matches; the only tracked files changed are those listed per stage. |

### 4.4 Deferred (explicit)

- Same-text render memoisation, observer-root narrowing, timer reduction on non-watch pages (no gate demands them; risk to parser-upgrade and A08/A05 behaviour).
- Moving provider calls and the Anki transport into the worker (would remove credentials from the content script process and fix CORS, but changes the test boundary; not needed to meet A01/A10 as scoped).
- Opt-in cross-provider fallback setting; HTTPS-only/disclosure for Kugou and the unofficial translate endpoint (R07); Gemini key in URL query.
- `#deck:` header in the TSV, card deduplication, a per-card storage layout.
- Duplicate `isJapaneseTrack` and deinflection-rule copies (R05); `PARSING_VERIFICATION.md` refresh (R06); vendor provenance.
- Real optional-permission grant flow, live YouTube CSP, real Sudachi/Anki: remain unmeasured limitations.
- `AbortSignal` cancellation of obsolete AI requests (stale results are already dropped).

---

## 5. Summary of what Sol Max should do first

1. **S0 harness:** H1 (fake storage rejects), H2 (worker per storage), H4, H5, H6 (+ derive the baseline R-X02 verdict), H7, H9, H10, H11/H12; prove baseline neutrality; freeze hashes.
2. **S1–S2:** repoint the legacy suite, then the two cheap, exactness-preserving robustness fixes (X02 tag stripping, X01 romaji chunking).
3. **S3–S4:** remove the credential field and escape every sink (A01, A02); selected-provider-only, prompt quoting and analysis identity (A10, R04, A03).
4. **S5–S6:** bridge overlay ownership (A05); then the single timeline installer with the exact index, acquisition priority, navigation dispose, robust caption extraction and routing (P1, A04, A08, A09, R03).
5. **S7–S10:** worker-owned card and cache storage (A07, X03), the unified card/Anki contract and exporters (A06), idle-write and Segmenter hygiene (X04), then permissions (A11).
6. Final full verification (§4.3), a fix-results report that lists each resolved finding and every deferred item with its reason.
