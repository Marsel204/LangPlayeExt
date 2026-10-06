# LinguaPlay — Japanese AI Immersion Player Chrome Extension

An AI-enhanced Japanese language immersion video player and YouTube subtitle companion featuring interactive Kuromoji tokenization, multi-provider AI pedagogical explanations (Google Gemini, OpenRouter DeepSeek, and Antigravity CLI), and dual-pipeline Anki flashcard sync.

---

## 🚀 Features & Capabilities

### 1. Dual Immersion Workspaces
* **Standalone Immersion Player (`player.html`)**:
  * Open local video files (`.mp4`, `.webm`) and local Japanese subtitle files (`.vtt`, `.srt`).
  * Search and load any YouTube video with embedded YouTube IFrame API.
  * Real-time O(log N) binary search subtitle sync.
  * Interactive subtitle tokens: Click any word to instantly pause playback, view dictionary definitions, and trigger in-depth linguistic AI analysis.
* **YouTube On-Site Immersion Mode (`content.js`)**:
  * Injects directly onto `youtube.com/watch` pages.
  * Automatically synchronizes and overlays interactive Japanese subtitles over native YouTube videos.
  * Click any Japanese word on YouTube to pause and open the floating linguistic analysis drawer.

### 2. Subtitle Display & Reading Modes
* **Furigana**: Displays Hiragana ruby readings above Kanji characters.
* **Romaji**: Shows alphabetical pronunciation for beginners.
* **Hidden**: Kanji-only display for authentic immersion and recall practice.
* **Timing Sync Adjuster**: Fine-tune caption offsets in `±0.1s` and `±0.5s` increments.

### 3. Multi-Provider AI Linguistic Tutor
* **Google Gemini 2.5 Flash API**: Direct in-browser generation with high-speed pedagogical breakdowns.
* **OpenRouter DeepSeek**: Streaming AI breakdowns with real-time token feedback.
* **Local Antigravity CLI (`agy`)**: Zero-configuration local AI engine via the companion `Server.py`.
* **Pedagogical Output Structure**:
  * Meaning & JLPT level badge (`N5`–`N1`) + Formality level.
  * In-depth Grammar role explanation with Romaji.
  * Morphological Conjugation analysis (Base form, reading, inflection rules).
  * Sentence Breakdown with accurate Romaji transcriptions for every segment.
  * Cultural / colloquial nuance.
  * Natural example sentences with Romaji and English translations.

### 4. Dual-Pipeline Anki Integration
* **Direct AnkiConnect Sync**: One-click export to Anki desktop (`http://127.0.0.1:8765`, creates `LinguaPlay` deck).
* **Offline Card Collection & TSV Export**: If Anki is closed, cards are saved to extension storage and can be exported as TSV anytime via the popup or options page.

---

## 📦 How to Install in Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left.
4. Select the `extension/` folder in this repository:
   ```
   /path/to/LangPlay/chrome_extension_port_app/extension
   ```
5. The **LinguaPlay** icon (言) will appear in your Chrome toolbar!

---

## ⚙️ Configuration & API Keys

1. Click the LinguaPlay icon in the Chrome toolbar and select **Options / Keys** (or right-click the icon and choose *Options*).
2. Configure your preferred settings:
   * **Google Gemini API Key**: Paste your free key from [Google AI Studio](https://aistudio.google.com/).
   * **OpenRouter API Key**: (Optional) Paste key from [OpenRouter](https://openrouter.ai/).
   * **Local Server URL**: Default `http://127.0.0.1:8000` (if using local `Server.py`).
   * **Anki Deck Name**: Default `LinguaPlay`.

---

## Automatic local server startup (Linux)

LinguaPlay can start the companion `Server.py` when a YouTube video or a video in the standalone player begins playing. A running server is reused; opening a paused video does not start it. The server stays running after playback stops.

Install the local launcher once from this repository. Find your extension ID in `chrome://extensions`, then run:

```bash
python3 native/install_host.py \
  --server /home/marsel/Projects/LangPlay/Server.py \
  --extension-id YOUR_EXTENSION_ID
```

Replace the server path if needed. Reload the extension after installing. The launcher uses Chrome native messaging and registers with both Google Chrome and Chromium. Repeat `--extension-id` to authorize another checkout. Use `--port` if your local server uses a port other than 8000, and save the matching **Local Server URL** in Options.

The launcher starts the server on `127.0.0.1`, launches only the installed server path and port, and prevents duplicate starts across tabs and browsers. Remote server URLs do not launch a local process. Disable **Start local server when a video plays** in Options to turn off automatic startup.

Launcher files are installed in `~/.local/share/linguaplay/native`; server output is recorded in `~/.local/state/linguaplay/server.log`. If you move `Server.py` or reinstall Python, rerun the installer. No login service is created. Other operating systems can continue running the server manually.

Verify the implementation with:

```bash
node tests/test_server_startup.js
python3 tests/test_native_host.py
node tests/browser_custom_ai.mjs
```

The browser check requires Chromium and uses a temporary profile and a small test server; it does not invoke an AI model or modify your browser profile.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause media |
| `←` / `→` | Seek backward / forward 5 seconds |
| `↑` / `↓` | Jump to previous / next subtitle cue |
| `R` | Repeat current subtitle cue |
| `C` | Copy current Japanese sentence to clipboard |
| `S` | Toggle subtitle overlay visibility |
| `[` / `]` | Adjust subtitle timing offset by ±0.1s |

---

## 📁 Extension File Structure

```
extension/
├── manifest.json              # Manifest V3 configuration
├── player.html                # Standalone immersion player app
├── popup.html / popup.js      # Toolbar action popup
├── popup.css                  # Toolbar action styling
├── options.html / options.js  # Settings & API key management
├── options.css                # Options page styling
├── content.js / content.css   # YouTube on-site overlay script
├── background.js              # Service worker & context menus
├── css/
│   └── styles.css             # Main player & glassmorphic styles
├── js/
│   ├── app.js                 # Player app coordinator
│   ├── ai.js                  # Multi-provider AI tutor engine
│   ├── anki.js                # Dual-pipeline Anki sync & TSV exporter
│   ├── dict.js                # Offline JDICT & Google Translate fallback
│   ├── player-controller.js   # Video & YouTube iframe controller
│   ├── subtitles.js           # Subtitle parsing & cue sync
│   ├── tokenizer.js           # Kuromoji / WanaKana morphological analyzer
│   └── ui.js                  # Toast notifications & modals
├── lib/
│   ├── wanakana.min.js        # Offline WanaKana library
│   └── kuromoji.js            # Morphological parser library
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
