# Player redesign verification — 3 November 2026

Self-review; no delegated or independent review was requested. Reference: the current LangPlay player surface at `49647f7c0160c1bf548b80f9fc5b7e4b64a440f7`. The specification and scope are in [langplay-player-and-jimaku.md](specs/langplay-player-and-jimaku.md).

## Passing checks

- `node --test tests/test_*.js`: 180 tests. Includes Jimaku authentication/errors, URL restriction, streamed size limits, encoding, ASS/SSA dialogue, search/episode ownership, preview/application behavior, translation request sharing, late responses and retry behavior.
- `node run_tests.js`: all 15 suites, including existing Japanese reading, drawer context, cards, parsing and manifest checks.
- `python3 tests/test_native_host.py`: 7 tests.
- `node tests/browser_custom_ai.mjs`: actual Chromium extension loading, Settings saves/model discovery, 9Router worker transport, native-host behavior, live-caption fixture, hidden/visible state, delayed translations, unified chat, trusted keyboard inputs, fullscreen, native control placement/replacement, narrow toolbar, sidebar/Mix placement and navigation.
- `node tests/browser_anki_youtube.mjs`: Quick Add reaches AnkiConnect through the extension worker with default browser security and stores a local card.
- `node tests/browser_captions_youtube.mjs`: YouTube-shaped HTTPS pages render backend cues with and without backend CORS headers; the page never requests the loopback backend itself.
- `node tests/browser_video_sites.mjs`: production extension injection on Netflix, Prime Video, Disney+, Hulu, Crunchyroll and Vimeo fixture origins. A generated playable WebM verifies real pause/resume. Missing-key recovery, episode filter, Jimaku preview/application, ASS, English captions, aligned sentence readings, delay sign, opacity without replacing word nodes, narrow study containment and episode cleanup pass.
- `node tests/perf/perf_p3_render_mutation.js`: the idle-tick gates report zero DOM/style writes while shown or hidden. Its pre-existing soft observation for explicitly calling the renderer repeatedly with identical text is not an acceptance gate.
- `node tests/perf/perf_p4_requests.js`: acquisition, repeated AI-click, stale-result and translation-cache gates pass; repeated cached translations issue no requests.
- Syntax checks, generator/bundle correspondence and `git diff --check` pass.

## Visual inspection

Inspected production-renderer captures at 1280 px and 390 px. Checked the charcoal/lavender study surface, translucent Japanese/English caption composition, source search/preview layout, wrapping, lower study sheet, sticky resume action and viewport containment. Captures are local under `.impeccable/review/player/` and use synthetic content and deterministic service responses. No artwork from a video service was copied.

The one mechanical Impeccable scan produced 184 advisory findings for colors/radii/type sizes outside the existing Settings design schema, with no non-advisory findings. The player deliberately uses the supplied LangPlay reference instead of the Settings palette; its independent visual authority is recorded in the surface brief and specification. These advisories were not used to restyle the requested reference.

## Limits

Fixture tests establish extension behavior and renderer composition. They do not verify authenticated Jimaku service access or the current DOM of a signed-in Netflix/other streaming account. The optional real Sudachi backend check was not run. Native fullscreen of the video element alone cannot contain overlay DOM; site-provided container fullscreen is supported. Archives require external extraction, and ASS styling/vector drawings are not reproduced in the learning text.

## Subtitle size follow-up

Added the 50–200% Subtitle size slider and Default size reset beside opacity. Re-ran all 180 unit/regression tests, production Chromium video-site integration, idle mutation gates, generator correspondence, syntax and whitespace checks. Chromium verifies proportional scaling of Japanese/readings/English, preserved word-node identity, keyboard adjustment, reset and persistence across new documents on the supported fixture origins. Inspected the appearance controls and captions at desktop 155% and narrow 200% sizing. The mechanical scan remains advisory-only for the separate player design.

## Subtitle position follow-up

Added saved horizontal (Left → Right) and vertical (Bottom → Top) controls, plus Default position. Defaults preserve bottom-center captions. Position interpolation keeps the full caption box inside its available player area as text size, fullscreen and panel reservations change; large caption content can scroll within its bounded surface. Word nodes and their listeners remain intact.

All 180 unit/regression tests and 15 exhaustive suites pass. Chromium video-site checks verify actual coordinates at the corners and center, keyboard adjustment, reset, invalid preference recovery, saved positions across documents/sites, fullscreen, and narrow 200% captions with both settings and study open. Existing YouTube AI/chat, caption visibility, keyboard/fullscreen, native startup and sidebar integration checks pass. Idle polling still reports zero DOM writes. Inspected desktop and narrow captures; generator correspondence, syntax and whitespace checks pass. The design scan remains advisory-only for the separate player palette. Self-review only; authenticated streaming/Jimaku and optional real Sudachi limitations above are unchanged.

## Compact toolbar follow-up

Replaced the wide wrapping button strip with one compact row: power, a native reading dropdown, Subtitles, More and Close. Repeat, import, lyrics and extension settings live in More; timing remains with source/appearance controls under Subtitles. Opening Subtitles dismisses the toolbar, and keyboard focus moves into the panel even when it was already open. No subtitle, reading, timing or appearance features were removed.

Chromium checks enforce a single-row footprint at wide and narrow player widths, verify all reading modes, native keyboard opening/Escape for More, outside-click dismissal, retained settings/import actions, site-specific lyrics visibility, and focus when switching to an already-open panel. Inspected the compact row, expanded More menu and narrow-player captures. The existing video-site and YouTube integration checks, 180 unit/regression tests, 15 exhaustive suites and zero-idle-write gates pass. The one mechanical scan reports only expected advisories for the separate player design. Verification remains self-review and fixtures, with the previously documented live-account limits.

## Song / episode mode correction

Root cause: the ready-state subtitle badge was hardwired to the Jimaku panel even when the active timeline came from the existing lyrics workflow. Source acquisition also lacked a saved per-video user choice, so cached songs could be restored during episode playback.

The badge now follows the active source. Watching offers Auto / Song / Episode and saves the choice per video. Song uses the existing LRCLIB/Kugou/cache/identification flow; Episode suppresses automatic song lookup and ignores song caches. More → Find lyrics and opening the active song manager save Song mode while preserving a working lyric timeline. Source changes reject stale captions/searches/previews, stop abandoned lyric work before further AI requests, and reset stale busy controls so returning to Song can search immediately. Auto retains the established caption-first/lyrics-fallback behavior; it does not claim reliable media-type classification.

All 187 unit/regression tests and all 15 exhaustive suites pass. The seven added source-mode tests reproduced the routing, cache, persistence, stale-response, stale AI and busy-state failures before their fixes. Chromium production-extension fixtures verify Episode → Song, no Jimaku requests during Song acquisition/reload, the original Lyrics Manager opening from the badge, persisted mode reloads and isolation between video identities. Existing YouTube AI/chat, native-caption controls, fullscreen and startup integration pass. Idle-write and request/cache gates pass. Inspected current Episode and Song panel captures. Generator correspondence, syntax and whitespace checks pass; the one design scan is advisory-only. Self-review and fixture/account limitations above continue to apply.

## Caption centering with an open panel

The desktop panel reservation reduced only the caption area's right edge. A Chromium regression reproduced a caption center of 479.6 px against the video's 640 px center when Study opened. Removed that horizontal reservation so Study and Subtitles overlay the player without shifting captions. Narrow bottom-sheet clearance and saved position controls remain in effect.

All 187 unit/regression tests and the Chromium video-site fixture suite pass. New geometry assertions check the full video's center with panels closed, Study open/closed, Subtitles open, fullscreen Subtitles and a narrow Study sheet. Existing size, custom position, keyboard, reset and persistence checks pass. Inspected the updated desktop and narrow Study captures. The layout scan reports no findings; whitespace checks pass. Self-review and fixture/account limitations above continue to apply.

## Sentence translation fallback — 6 November 2026

Requesting the screenshot's Japanese sentence from Google Translate reproduced HTTP 429. Sentence meanings now try the saved 9Router model or combo after Google HTTP, network, timeout or unusable-response failures. Google 429 responses pause Google requests for 1–5 minutes, respecting Retry-After within those bounds; dictionary glosses do not invoke AI. Both providers use the existing extension worker, saved endpoint permissions and credentials. Successful translations retain shared pending work and bounded caching. The caption retry tooltip reports both errors if translation fails.

All 195 Node tests, all 15 exhaustive suites and all 7 native-host tests pass. New regressions cover the screenshot sentence, cooldown/recovery, network/timeout/malformed responses, shared pending AI work, late captions, missing models, endpoint permissions and retry recovery. All four Chromium integrations pass: AI/settings/visibility, Anki on YouTube, captions with and without backend CORS, and the six video-site fixtures. Render-mutation and request/cache gates pass; the previously documented repeated-identical-render soft observation remains. Generator correspondence, syntax and whitespace checks pass. The AI fallback is verified with deterministic provider fixtures; authenticated live-model and streaming-account behavior remains outside this verification.
