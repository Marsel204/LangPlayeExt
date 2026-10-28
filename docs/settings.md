# Settings setup guide

This guide takes a new LinguaPlay installation through its first AI explanation, then covers the optional parser, Anki, and subtitle preferences. In the extension, choose **Setup guide** from the Settings navigation or use the help link beside the page heading. Settings follows your system's light or dark appearance.

## What you need

| What you want to use | What needs to be running |
| --- | --- |
| Clickable Japanese subtitles, fallback readings, reading modes, and a local flashcard collection | The extension and a YouTube video with Japanese captions, or a manually loaded subtitle file |
| Sensei Chat, AI grammar breakdowns, and AI song identification | 9Router with a working provider and a selected model or combo |
| More accurate contextual readings and dictionary forms | The optional LangPlay backend with Sudachi |
| Add cards directly to Anki | Anki with the AnkiConnect add-on |

You can configure AI first and add the optional tools later. The three server URLs below belong to different services.

## 1. Open Settings

If needed, [install the extension](../README.md#install-the-extension). Click its toolbar icon to open Settings directly. You can also open `chrome://extensions`, find LinguaPlay, and choose **Extension options** from its details.

## 2. Connect the AI tutor

### Install and start 9Router

1. Install a current [Node.js LTS release](https://nodejs.org/en/download), which includes npm. Open a new terminal after installation.
2. Run:

   ```sh
   npm install -g 9router
   9router
   ```

3. Open [the local 9Router dashboard](http://127.0.0.1:20128/dashboard). Complete any first-run setup it requests.
4. In the dashboard, connect or enable a provider. Enter that provider's credentials there if needed. OpenCode Free does not need upstream provider credentials, but your router can still require its own API key.
5. Copy a **router API key** from the dashboard if router authentication is enabled.

These are the desktop npm commands from [9Router's CLI guide](https://github.com/decolua/9router/blob/master/cli/README.md). If your router is hosted elsewhere, use its supplied API URL and router key instead of installing a second local server.

### Fill in 9Router AI

| Setting | What to enter |
| --- | --- |
| **9Router API Base URL** | `http://127.0.0.1:20128/v1` for a router on this computer. For a hosted router, use its API base URL, including its `/v1` path. This is the API URL, not the dashboard URL. |
| **9Router API Key** | The router key from 9Router. Leave blank only if that router allows requests without authentication. Upstream provider credentials stay in the dashboard. |
| **Available Models** | A dropdown containing all chat models returned by your configured router. It loads automatically when the router is reachable and browser access is already allowed. **Load Models** refreshes the list or requests access to a hosted router. |
| **Model or Combo** | Selecting from **Available Models** fills this field with the exact ID, including its provider prefix. You can also enter a model ID or the exact name of a combo you created in 9Router. A combo is a routing/fallback configuration managed in 9Router. |

1. Choose a model in **Available Models**, or type a combo in **Model or Combo**. The dropdown always shows the full loaded list, even when the text field contains another model. If the list has not loaded, or you changed the URL or key, click **Load Models**. Discovery preserves your current model or combo until you select another one.
2. Click **Test 9Router**. It sends a short request using the current form values. A successful test says **9Router is working with …** below the model field. The test uses your provider's normal request allowance.
3. Click **Save Settings** at the bottom of the page. Testing and loading models do not save the form.
4. Open or refresh a YouTube video with Japanese captions. Click a word, then try **Ask Sensei (AI Grammar Tutor)** or **Sensei Chat**.

A model list can load even when a provider request fails. Complete the AI test before relying on the connection. Models and free-tier availability depend on the providers enabled in your router; use the current list rather than copying an old model name from a screenshot.

### Keep it available after login

Follow [Start 9Router automatically](9router-autostart.md) to enable its tray startup or install a Linux user service. Each person configures startup on their own computer. Installing LinguaPlay or copying its repository does not install a 9Router service.

The **Start parser server when a video plays** checkbox controls the optional Japanese parser. 9Router has its own startup configuration.

## 3. Optional: connect Anki

1. In Anki, choose **Tools → Add-ons → Get Add-ons**, enter `2055492159` for [AnkiConnect](https://ankiweb.net/shared/info/2055492159), and restart Anki.
2. Create the deck you want to use, for example `LinguaPlay`. Keep Anki open while adding cards.
3. In LinguaPlay Settings, enter that exact name in **Anki Target Deck Name**.
4. Keep **AnkiConnect URL** at `http://127.0.0.1:8765` for Anki on this computer. Change it only if your AnkiConnect installation uses another address.
5. Click **Test AnkiConnect**, then **Save Settings**.
6. Click a word in a YouTube subtitle and choose **Quick Add to Anki**. After an AI breakdown, you can also use **Save Enriched AI Card to Anki**.

LinguaPlay keeps a local copy when you add a card. If Anki is unavailable, the result can say **Kept locally — Anki: …**. Use **Export TSV File** to import your collection into Anki later. Exported TSV files can contain a deck header; choose the destination deck in Anki's import dialog as needed.

## 4. Optional: improve Japanese readings

The companion [LangPlay backend](https://github.com/Marsel204/LangPlay) provides offline Sudachi parsing for contextual readings and dictionary forms. Follow the [local backend setup guide](local-backend.md) to install it and, on Linux, authorize the extension's native launcher.

| Setting | What to enter or choose |
| --- | --- |
| **Japanese Parser Server URL** | `http://127.0.0.1:8000` for the default local backend. Use the backend's actual port if you changed it. |
| **Start parser server when a video plays** | Enable after installing the local launcher. Disable if you run the parser yourself or have not installed it. |
| **Test Parser** | Checks the configured parser. Run after installing it, then save the settings. |

You can keep using fallback subtitle readings without this backend. Remote parser URLs require a server that is already running; the local launcher only starts its authorized local server.

## 5. Choose reading and collection preferences

**Default Subtitle Reading Mode** sets how new video sessions display pronunciation:

- **Furigana:** hiragana above kanji.
- **Romaji:** pronunciation in the Latin alphabet.
- **Hidden:** hide pronunciation guides and keep the Japanese subtitle text.

Click **Save Settings** after changing the default. You can also switch modes from the YouTube toolbar during playback.

**Stored Flashcard Collection** shows the number of cards saved in this browser's extension storage. **Export TSV File** downloads a file for later import. **Clear Cards** asks for confirmation before removing the local collection; it does not delete notes already added to Anki. Export first if you want to keep a copy.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| `node` or `npm` is not found | Install Node.js LTS, open a new terminal, and retry the installation commands. |
| Permission denied during global npm installation | Use a Node installation with a user-writable global npm directory, then install 9Router again from that environment. |
| Connection refused, a network error, or a timeout | Open the 9Router dashboard. Start or restart the server if it is unavailable. Check the host and port in the API URL; `127.0.0.1` refers to the computer running the browser. |
| HTTP 401 or 403 | Check the router API key and router access settings. If 9Router reports an upstream authentication error, reconnect that provider in its dashboard. |
| No models available | Enable a provider in the dashboard and reload the list. You can also enter a combo you have created there. |
| The model list loads but the AI test fails | Check the exact model or combo, provider login, quota, and provider availability in 9Router. Loading a list does not test a completion. |
| HTTP 404 or a non-JSON response | Use the API base URL ending in `/v1`, rather than `/dashboard` or a website landing page. |
| Settings were not saved after a permissions prompt | Allow browser access to the chosen remote server, then save again. Denying access keeps the previously saved settings. |
| Parser startup fails | Install the native launcher with this extension's ID and the correct backend path, or disable automatic parser startup and run the backend yourself. See [local backend setup](local-backend.md). |
| AnkiConnect test fails | Open Anki, confirm AnkiConnect is installed, and check its URL. If adding a card fails after a successful test, check that the target deck exists. |
| AI works in Settings but a YouTube tab still uses old behavior | Save the form, then refresh the YouTube tab and retry. |

### OpenCode reports `wreq-js unavailable`

This error comes from a missing or unloadable optional dependency in 9Router. It is repaired in the router's runtime directory, rather than the extension repository. With the default 9Router data directory, run the command for your platform after starting 9Router at least once:

Linux or macOS:

```sh
npm --prefix "$HOME/.9router/runtime" install wreq-js
```

Windows PowerShell:

```powershell
npm --prefix "$env:APPDATA\9router\runtime" install wreq-js
```

If you configured a custom 9Router data directory, use its `runtime` subdirectory instead. Restart 9Router after installation: use its tray **Quit** action and start it again, or use `systemctl --user restart 9router` if you installed the service from the [automatic startup guide](9router-autostart.md). Reload the models and run **Test 9Router** again. If loading still fails, check 9Router's error for an incompatible Node version or a missing native binding and consult [9Router's issue tracker](https://github.com/decolua/9router/issues).
