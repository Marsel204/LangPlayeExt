# Local backend setup

[← Back to the README](../README.md)

The companion [LangPlay backend](https://github.com/Marsel204/LangPlay) supplies local Antigravity AI and offline Sudachi parsing. It is a separate checkout; `Server.py` is not included in this extension repository.

## Automatic local server startup (Linux)

LinguaPlay can start the companion `Server.py` when a YouTube video begins playing. A running server is reused; opening a paused video does not start it. The server stays running after playback stops. This launches the backend service; the standalone app remains in the separate LangPlay project.

Install the local launcher once from this repository. Find your extension ID in `chrome://extensions`, then run:

```bash
python3 native/install_host.py \
  --server /absolute/path/to/LangPlay/Server.py \
  --extension-id YOUR_EXTENSION_ID
```

Replace the server path and `YOUR_EXTENSION_ID` with your own values. Run this command from the extension repository root. Reload the extension after installing. The launcher uses Chrome native messaging and registers with both Google Chrome and Chromium. Repeat `--extension-id` to authorize another checkout. Use `--port` if your local server uses a port other than 8000, and save the matching **Local Server URL** in Options, then click **Save Settings**.

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

## Japanese morphology with Sudachi

The YouTube extension uses the companion backend's offline Sudachi parser
for readings, parts of speech and dictionary forms. Inflected words stay
clickable as a unit: `来ない` reads `こない` and looks up `来る`. The drawer and
Anki use the same readings. Sentence translation providers are unchanged.

This requires the updated backend as well as the extension. Install the pinned
parser dependencies once inside the **backend** checkout:

```bash
uv venv --python 3.14 .venv
uv pip install --python .venv/bin/python -r requirements-parser.txt
```

Rerun `native/install_host.py` using the installed backend path and extension ID,
then reload the extension. The updated launcher prefers `.venv/bin/python` beside
`Server.py`; restart any server already running with the old interpreter. For
manual startup, use `.venv/bin/python Server.py --host 127.0.0.1 --port 8000`.

When the server/parser is unavailable, subtitles remain usable with the existing
lightweight fallback. Parsing retries on subsequent cues and when automatic
startup finishes. No remote dictionary download or API key is needed for Sudachi.
Ambiguous words and fictional names can still have incorrect readings.

The tested Core dictionary takes about 207 MiB on disk, with approximately
124 MiB total parser-process peak RAM in the short-line benchmark. A real Chromium
run measured about 35 ms for its first request and a 3.7 ms median across four
subsequent uncached requests, including localhost and extension messaging.
Repeated lines are cached; these timings are machine-specific.

Run the real parser/browser integration with the backend environment installed:

```bash
node --test tests/test_*.js
PARSER_SERVER_DIR=/path/to/LangPlay node tests/browser_custom_ai.mjs
```

The browser test uses an isolated backend on a temporary port and a disposable
Chromium profile. Run `.venv/bin/python -m unittest discover -s tests -p 'test_*py'`
from the backend checkout for morphology and HTTP tests. Both repositories need
to ship together to enable this path.
