<p align="center">
  <img src="icons/icon128.png" width="72" height="72" alt="LinguaPlay extension icon">
</p>

<h1 align="center">LinguaPlay for YouTube</h1>

<p align="center">
  <strong>Learn Japanese from the videos you already love.</strong><br>
  Clickable subtitles, contextual explanations, and Anki cards — directly on YouTube.
</p>

<p align="center">
  Chrome / Chromium extension · Manifest V3<br>
  <a href="#install-the-extension">Install</a> ·
  <a href="#how-it-works-on-youtube">How it works</a> ·
  <a href="#connect-your-ai-tutor">AI setup</a> ·
  <a href="docs/local-backend.md">Local backend</a>
</p>

![LinguaPlay running on a real YouTube watch page, with clickable Japanese subtitles and the word analysis drawer beside the video](docs/screenshots/youtube-extension.png)

*Watch a Japanese video. Click an unfamiliar word. Understand it in context. Keep it for review.*

Screenshots below show LinguaPlay on the real YouTube watch page for [Atarayo — 「僕は...」](https://www.youtube.com/watch?v=5tABGeWbVtQ).

LinguaPlay adds a Japanese learning workspace to YouTube's watch page. Subtitles become words you can click, and a learning drawer sits beside the video with readings, definitions, translation, and AI assistance. You can follow the video and study a line in the same tab.

## How it works on YouTube

### 1. Open a video and read along

Open a YouTube video with Japanese captions. LinguaPlay detects the captions and displays an interactive Japanese overlay with **furigana** above the words.

Use the **言** control in the video player to open LinguaPlay's toolbar. Switch to **Romaji** for alphabetic pronunciation or **Hidden** to practise reading without pronunciation guides. The **eye** control shows or hides the Japanese subtitle overlay and learning drawer. To watch with original subtitles, hide the Japanese overlay with the eye control and turn on YouTube's **CC** button.

Click the **LinguaPlay** logo in the toolbar to turn the app off and restore native captions. Click **言** again to turn it back on.

For music videos without captions, click **Lyrics** to search for synced lyrics by track and artist. You can also use the toolbar's **folder** button to load a Japanese `.srt`, `.vtt`, or `.lrc` file. Adjust the timing offset or use **Sync Line 1 to Playhead** in the Lyrics Manager when the text is out of sync.

Your latest manual file or lyrics selection stays active until you choose another source or leave the video. While the overlay is hidden, LinguaPlay leaves your native caption language and CC choice alone.

### 2. Click a word to understand the sentence

Click any word in the subtitle overlay. Playback pauses and LinguaPlay opens its drawer in YouTube's sidebar.

- **Word and reading:** check the Japanese word, hiragana reading, romaji, and dictionary meaning.
- **Context sentence:** see the original line, its romaji, and English translation.
- **Breakdown & Gloss:** click **Ask Sensei (AI Grammar Tutor)** to get an AI word-by-word gloss.

The drawer keeps the sentence you selected as its context, even if playback moves on. When you're ready, close the drawer and resume the video.

### 3. Ask Sensei a follow-up question

Switch to **Sensei Chat** to ask about the selected sentence. Use a prompt such as **Why this particle?**, **Grammar breakdown**, **2 More examples**, or **Nuance & Politeness** — or type your own question.

![Sensei Chat open beside a Japanese video on YouTube](docs/screenshots/youtube-sensei-chat.png)

Sensei uses the model or combo configured in 9Router. Its answers depend on the model and should be checked when a reading or explanation seems uncertain.

### 4. Save useful words to Anki

Click **Quick Add to Anki** to save the selected word with its reading, meaning, and sentence context. After an AI breakdown, **Save Enriched AI Card to Anki** saves an enriched card.

Both buttons use your configured AnkiConnect URL and deck and keep a local copy. Create that deck in Anki first. The result states what completed: **Added to Anki · stored locally**, **Kept locally — Anki: …**, or a local-storage failure. An existing duplicate is reported as **Already in Anki**. Kana readings and romaji are stored separately.

Open the extension popup or Options and choose **Export TSV** to export the collection later. Both exports contain identical sentence, word, kana reading, and meaning columns, including the sentence translation when available. The TSV retains the historical `LinguaPlay Japanese Immersion` deck header.

## Install the extension

No build step is needed.

1. Clone or download this repository:

   ```bash
   git clone https://github.com/Marsel204/LangPlayeExt.git
   ```

2. Open `chrome://extensions` in Chrome or Chromium.
3. Enable **Developer mode**, click **Load unpacked**, and select the repository root — the folder containing `manifest.json`.
4. Pin **LinguaPlay** to your toolbar.
5. Open **Options / Keys**, configure 9Router, and click **Save Settings**.
6. Open a YouTube watch page. Refresh an already-open page so the extension can load.

Japanese subtitle interaction, reading modes, and the offline card collection work without an AI API key. AI breakdowns and chat require a configured 9Router connection. More accurate contextual readings use the optional Sudachi backend.

## Connect your AI tutor

LinguaPlay uses **9Router** for Sensei Chat, grammar breakdowns, and AI song identification. Open **Options / Keys** to configure its URL, router key, and model or combo.

[9Router](https://github.com/decolua/9router) manages your AI providers, credentials, and fallback combos behind one OpenAI-compatible API. Run it separately from the extension:

```bash
npm install -g 9router
9router
```

1. Open the 9Router dashboard at `http://localhost:20128`, connect your providers, and copy the router API key if authentication is enabled.
2. Open LinguaPlay **Options / Keys** to find the 9Router settings.
3. Keep `http://127.0.0.1:20128/v1` for a router on the same computer, or enter your hosted router's API base URL. Enter the **router** key here; upstream provider keys stay in 9Router.
4. Click **Load Models**, then choose an ID in **Model or Combo**, or type a combo name from your dashboard. This preserves provider prefixes and custom combo names without guessing a model.
5. Click **Test 9Router** to send a short AI request, then **Save Settings**.

Sensei Chat, grammar breakdowns, and AI song identification use only the configured 9Router model or combo. Enter the router key in extension Options; upstream credentials stay in 9Router. Keep 9Router running while using these features. The extension does not start 9Router automatically.

For optional offline **Sudachi** parsing and automatic parser startup on Linux, see the [local backend setup guide](docs/local-backend.md). The parser improves contextual readings and dictionary forms; subtitle fallback readings work without it.

Saving or testing a remote 9Router, parser/server, or AnkiConnect endpoint may ask for access to its origin. Denying access leaves existing settings intact. Default HTTP endpoints on `127.0.0.1` and `localhost` work on any port without an extra grant.

## Connect Anki

1. Install [AnkiConnect](https://ankiweb.net/shared/info/2055492159) in Anki using add-on code `2055492159`, then restart Anki.
2. Keep Anki open. Its default endpoint is `http://127.0.0.1:8765`.
3. In LinguaPlay Options, set your deck name — default: **LinguaPlay** — and click **Test AnkiConnect**.
4. Save your settings and add a word from the YouTube subtitle drawer.

You can also start with the offline collection and export your cards later.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| **No extension controls** | Reload the extension in `chrome://extensions`, then refresh the YouTube watch page. |
| **No Japanese text** | Enable Japanese captions, search with **Lyrics**, or upload a subtitle file with the folder button. Availability varies by video. |
| **Text is out of sync** | Adjust the toolbar offset or use the Lyrics Manager's playhead sync tools. |
| **AI isn't responding** | Test 9Router in Options. Check the router key, model or combo, URL, and that 9Router is running. |
| **A reading looks wrong** | Use the updated Sudachi backend for contextual parsing. Names and ambiguous words may still need checking. |
| **A card isn't in Anki** | Check that AnkiConnect is available. Look in the extension collection for cards saved while Anki was offline. |

## Extension and standalone app

This repository contains the **YouTube extension**. Its popup opens YouTube and searches YouTube directly; all learning tools run on the watch page.

The standalone video player and companion Python backend live in the separate [LangPlay app repository](https://github.com/Marsel204/LangPlay). Use that project for local video playback. The extension connects to its optional backend over HTTP for offline Sudachi parsing; it does not bundle or launch the standalone player.

<details>
<summary><strong>Contributor notes and checks</strong></summary>

The extension uses plain JavaScript, HTML, and CSS. `content.js` and `content.css` implement the YouTube interface; `background.js` handles extension requests; `popup.*` and `options.*` provide the popup and settings. `js/` contains the YouTube bridge and parser client, `lib/` contains reading libraries, and `native/` contains the optional Linux backend launcher.

`build_content_js.py` generates `content.js` using the extension's reading data in `data/kanji-dict.js`. When changing the YouTube interface, update the generator and regenerate the bundle:

```bash
python3 build_content_js.py
```

On a committed tree, `python3 -I build_content_js.py && git diff --exit-code content.js` checks generator correspondence. During development, save the bundle before regeneration and compare it with `cmp`. Reading tests load the shipped engine; `data/kanji-dict.js` contains reading data only.

Run the extension checks:

```bash
node --test tests/test_*.js
node run_tests.js
python3 tests/test_native_host.py
node tests/browser_custom_ai.mjs
```

The browser check requires Chromium and uses a disposable profile and local test API. It does not invoke an AI model. Set `CHROMIUM_PATH` if your executable has another name. See the [backend guide](docs/local-backend.md) for real Sudachi integration checks.

The code-review regressions and performance harness are in `tests/review` and `tests/perf`. Their baseline evidence and fix report are under `docs/reviews/2026-10-28`. The counts in `PARSING_VERIFICATION.md` describe an earlier snapshot.

</details>
