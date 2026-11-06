---
version: 1
slug: "content-js"
primary_target: "content.js"
related_targets: ["content.css","build_content_js.py"]
---

# Japanese captions and study panel

Mode: Operate. The user's visual authority is the current Marsel204/LangPlay player. Match the existing implementation in `integrations/seanime/src/player-surface.css`, inspected at commit `49647f7c0160c1bf548b80f9fc5b7e4b64a440f7`, rather than inventing a new design direction.

Japanese captions use white semibold word groups, pink readings and the reference's transparent charcoal glass material. The study panel is solid charcoal with lavender actions, restrained borders, aligned per-word romaji/glosses, sentence English and inline chat. Close/Escape keeps playback paused; Resume watching is explicit. Compact source selection provides title/file search, preview, application and timing. English below Japanese and material opacity are independent controls.

The YouTube automatic-caption and lyrics flows, optional parser, AI/card contracts and Settings design remain available. Netflix and the other declared video sites use their visible HTML5 player with Jimaku/local subtitles. Important states include missing API key, no match, rate limit, invalid file, pending preview, failed translation/retry, changed episode, fullscreen and a narrow lower sheet.

The saved Subtitle size slider sits beside background opacity in the panel's appearance controls. It scales Japanese, readings and English from 50–200%, defaults to 100%, previews without replacing word nodes, and offers Default size. The original responsive type scale remains the 100% baseline. Saved Horizontal position (Left → Right) and Vertical position (Bottom → Top) sliders move the whole caption block within its safe area without replacing word nodes. Default position returns to bottom-center. Opening Study or Subtitles keeps captions horizontally centered on the full video; retain lower clearance for letterboxing and narrow bottom sheets, and preserve fullscreen bounds.

See `docs/specs/langplay-player-and-jimaku.md` for accepted behavior, source reference and verification limits. Screenshots under `.impeccable/review/player/` use synthetic video, provider and translation fixtures. No shipping raster assets were introduced.

The player toolbar is a single compact row: power, native reading dropdown, Subtitles, More, Close. More holds repeat/import/lyrics/extension settings; timing and appearance remain in Subtitles. No duplicate reading tabs or timing stepper occupy the row. Opening Subtitles dismisses the toolbar. Escape closes More first, then the toolbar, and returns focus appropriately.

Source selection includes a per-video Watching selector (Auto / Song / Episode) at the top of Subtitles. Song hides Jimaku and exposes the existing lyrics manager; Episode suppresses automatic song searches and song caches. The ready badge opens the active workflow. Mode changes invalidate previous source requests, including subsequent automatic AI-identification work. Keep this choice out of the compact toolbar.
