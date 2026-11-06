# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Japanese learners watching YouTube, Netflix and the other declared streaming video sites, including first-time users installing 9Router and configuring their first AI explanation. Settings also serves returning users changing models, reading preferences, and flashcard connections.

## Product Purpose

LinguaPlay brings clickable Japanese subtitles, readings, contextual AI explanations, and vocabulary collection into a YouTube watch page. Settings should help a new user reach a tested, saved AI connection and let them add optional learning tools later.

## Operating Context

A Chrome/Chromium Manifest V3 extension written in plain HTML, CSS, and JavaScript. The toolbar icon opens Settings directly. Learning tools run in YouTube and the declared streaming-site players. Settings must work in both light and dark system appearances, as requested by the user.

## Capabilities and Constraints

- 9Router handles AI requests. Settings discovers its available chat models, preserves provider prefixes, accepts manual model IDs and combos, tests the connection, and saves the form explicitly.
- The Japanese parser and its local launcher are optional and configured separately from 9Router.
- On Linux / Omarchy, Settings can enable, check and disable local 9Router login startup through the installed helper. First-time setup downloads a self-contained script for that device's extension ID. Node.js and 9Router must already be installed; the parser is not required.
- AnkiConnect and a matching deck enable direct card creation. The local flashcard collection can be exported or cleared from Settings.
- Furigana, romaji, and hidden readings are available subtitle preferences.
- Keep the existing storage keys, endpoint permissions, field IDs, and service behavior compatible with the current extension.
- Keep first-time installation and troubleshooting instructions available from Settings.

## Brand Commitments

Keep the LinguaPlay name and existing extension identity. Settings retains its previously requested system-appearance design. The separately requested player redesign follows the current LangPlay reference, as recorded below.

## Evidence on Hand

README.md, docs/settings.md, docs/9router-autostart.md, the shipped Settings controls, extension icons, and Chromium integration checks document the real product. Connection and test indicators must describe observed state rather than imply that a discovered model has completed a successful AI request.

## Product Principles

- Make the next useful setup action clear.
- Keep optional tools understandable and independent.
- Preserve exact model choices and user-entered values.
- Show honest connection, test, and save feedback.
- Keep the settings usable by keyboard and on narrow screens.

## Player redesign and streaming subtitles

The user separately requested the current LangPlay player appearance for Japanese captions and study, Jimaku search for streaming video, and English sentence meaning inside the caption strip. `docs/specs/langplay-player-and-jimaku.md` and `.impeccable/surfaces/content-js.md` record this surface. YouTube keeps automatic captions/lyrics; other declared sites use Jimaku or local files against their HTML5 playback clock. Jimaku is optional, requires its own saved API key, and remains independent of 9Router and the parser.
