# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Japanese learners watching YouTube, including first-time users installing 9Router and configuring their first AI explanation. Settings also serves returning users changing models, reading preferences, and flashcard connections.

## Product Purpose

LinguaPlay brings clickable Japanese subtitles, readings, contextual AI explanations, and vocabulary collection into a YouTube watch page. Settings should help a new user reach a tested, saved AI connection and let them add optional learning tools later.

## Operating Context

A Chrome/Chromium Manifest V3 extension written in plain HTML, CSS, and JavaScript. The toolbar icon opens Settings directly. Learning tools run in the YouTube page. Settings must work in both light and dark system appearances, as requested by the user.

## Capabilities and Constraints

- 9Router handles AI requests. Settings discovers its available chat models, preserves provider prefixes, accepts manual model IDs and combos, tests the connection, and saves the form explicitly.
- The Japanese parser and its local launcher are optional and configured separately from 9Router.
- AnkiConnect and a matching deck enable direct card creation. The local flashcard collection can be exported or cleared from Settings.
- Furigana, romaji, and hidden readings are available subtitle preferences.
- Keep the existing storage keys, endpoint permissions, field IDs, and service behavior compatible with the current extension.
- Keep first-time installation and troubleshooting instructions available from Settings.

## Brand Commitments

Keep the LinguaPlay name and existing extension identity. The user requested a replacement for the current Settings visual design and delegated the visual direction. This task redesigns Settings; the YouTube learning interface has its own scope.

## Evidence on Hand

README.md, docs/settings.md, docs/9router-autostart.md, the shipped Settings controls, extension icons, and Chromium integration checks document the real product. Connection and test indicators must describe observed state rather than imply that a discovered model has completed a successful AI request.

## Product Principles

- Make the next useful setup action clear.
- Keep optional tools understandable and independent.
- Preserve exact model choices and user-entered values.
- Show honest connection, test, and save feedback.
- Keep the settings usable by keyboard and on narrow screens.
