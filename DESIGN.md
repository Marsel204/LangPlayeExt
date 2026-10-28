---
name: LinguaPlay Settings
description: A focused listening room for Japanese learning preferences and connections.
colors:
  accent: "#865714"
  accent-hover: "#70450c"
  accent-text: "#ffffff"
  accent-dark: "#e8bd72"
  accent-hover-dark: "#f4ce8d"
  accent-text-dark: "#192024"
  rail: "#203a3f"
  rail-dark: "#182e34"
  rail-text: "#eff4ed"
  rail-muted: "#b1c4c0"
  rail-active: "#315057"
  rail-active-dark: "#2c4850"
  rail-accent: "#f0c271"
  canvas: "#f6f8f6"
  surface: "#ffffff"
  field: "#fdfefd"
  text: "#23342f"
  muted: "#5b7067"
  line: "#d7e1db"
  line-strong: "#7b9387"
  canvas-dark: "#111b1e"
  surface-dark: "#162327"
  field-dark: "#19292e"
  text-dark: "#e5eeea"
  muted-dark: "#a2b7b1"
  line-dark: "#2e4246"
  line-strong-dark: "#64817d"
  status-info: "#42646e"
  status-success: "#236448"
  status-error: "#a13b2d"
  status-busy: "#805615"
  status-info-dark: "#a6cbd4"
  status-success-dark: "#8bdbb6"
  status-error-dark: "#ffb0a1"
  status-busy-dark: "#e8bd72"
  preview-text: "#f1f4eb"
  preview-muted: "#bdd0c8"
typography:
  display:
    fontFamily: 'Onest, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(32px, 3vw, 42px)"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-.035em"
  title:
    fontFamily: 'Onest, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-.02em"
  body:
    fontFamily: 'Onest, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'Onest, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 550
    lineHeight: 1.55
  control:
    fontFamily: 'Onest, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 550
    lineHeight: 1.5
  caption:
    fontFamily: 'Onest, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  technical:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.55
  japanese-preview:
    fontFamily: 'Onest, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "25px"
    fontWeight: 450
    lineHeight: 1.8
    letterSpacing: ".02em"
rounded:
  control: "6px"
  navigation: "7px"
  preview: "9px"
spacing:
  compact: "8px"
  field-inset: "12px"
  control-inset: "14px"
  regular: "20px"
  field-stack: "22px"
  section-inset: "24px"
  mobile-section: "28px"
  section: "36px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
    height: "42px"
  button-clear:
    textColor: "{colors.status-error}"
    padding: "8px 0"
  field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    height: "42px"
  navigation-link:
    textColor: "{colors.rail-muted}"
    rounded: "{rounded.navigation}"
    padding: "12px 14px"
  reading-preview:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.preview-text}"
    rounded: "{rounded.preview}"
    padding: "18px 22px 17px"
  connection-status:
    textColor: "{colors.status-info}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
---

# Design System: LinguaPlay Settings

## Overview

**Creative North Star: "The Listening Room"**

Quiet mineral surfaces and a deep petrol rail make Settings feel like a focused place to prepare for listening. Warm ochre marks useful actions and the current destination; thin rules and aligned fields organize the work.

This records the finished Settings implementation in `options.html`, `options.css`, and `options.js`. It does not establish a replacement system for the YouTube learning interface. Appearance follows the operating system, as requested by the user.

**Key Characteristics:**

- Petrol navigation, mineral surfaces, and warm ochre actions.
- Standard controls arranged in ruled, open sections.
- Live Japanese reading samples with restrained motion.
- Persistent save feedback and explicit connection states.

## Colors

### Primary

Ochre (`accent`) identifies links, checkbox selection, focus, and Save Settings. Its dark appearance becomes pale gold with dark text. The hover tokens deepen the light action and brighten the dark action.

### Secondary

Petrol (`rail`) anchors navigation, with pale rail text, muted secondary text, a lighter active surface, and gold active labels. The header reading sample keeps the light petrol background in both appearances, with its own pale text and muted translation tokens.

### Neutral

Mineral `canvas` supports the page and fixed footer; `surface` supports secondary buttons and transient messages; `field` distinguishes editable controls. `text` and `muted` establish readable hierarchy. Thin `line` rules divide sections, while `line-strong` outlines fields. The `-dark` entries are the `prefers-color-scheme: dark` overrides; rail text and rail gold remain unchanged.

Connection information, success, error, and pending changes use the respective status tokens, always accompanied by explanatory text.

**The System Appearance Rule.** Resolve both appearances through the existing CSS custom properties; retain the reading sample's deliberate fixed petrol treatment.

## Typography

Onest is the interface family, with platform sans-serif fallbacks. Japanese glyphs use the available glyph fallback through the same stack. Technical addresses and model IDs use the platform monospace stack. The frontmatter records the implemented type roles; romaji previews use a smaller, relaxed line (21px, weight 450, line-height 1.6).

Titles use tight tracking, field labels use medium weight, and helper text remains quiet without becoming faint. Ruby readings sit above Japanese text in warm ochre; the reading sample keeps real text, language attributes, and native ruby markup.

The bundled variable face (`assets/fonts/Onest-Variable.ttf`, weights 100–900, `font-display: swap`) comes from [Google Fonts' Onest source](https://raw.githubusercontent.com/google/fonts/main/ofl/onest/Onest%5Bwght%5D.ttf). Its license is bundled as `assets/fonts/OFL-Onest.txt`, corresponding to [OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/onest/OFL.txt).

## Layout

The desktop shell uses a sticky full-height navigation rail (236px) beside centered content (maximum 1140px including padding). Main content has generous sides (64px); a header pairs the page title with a reading sample. Ruled sections pair a narrow introduction column (180px) with flexible controls, separated by a measured gap (38px). Related connection fields share two columns; field actions sit beside their controls.

At 1150px and below, the rail narrows (210px), main sides reduce (36px), and section introductions narrow (150px). At 960px and below, headers and sections become single columns. At 760px and below, the rail becomes a top navigation strip with horizontal scrolling, main sides reduce (24px), and section spacing tightens. At 480px and below, sides reduce again (20px), paired fields and field actions stack, and collection actions move below their count. At 1600px and above, main top padding increases (64px).

The fixed save footer aligns with the content edge and occupies the full width after the rail disappears. Main bottom padding reserves room for it (140px desktop; 126px mobile). Anchors include scroll clearance (24px).

**The Ruled Groups Rule.** Group settings with thin separators, aligned field edges, and open space; reserve the enclosed petrol container for the reading sample.

## Elevation & Depth

Most surfaces are flat. Color, rules, and strong field outlines establish hierarchy. Only the transient toast uses a soft shadow (`0 6px 24px #00000012`). The fixed footer stays on the mineral canvas with a top rule; it does not add blur or a floating card treatment.

## Shapes

Controls and status boxes use gently rounded corners; navigation is slightly softer, and the reading sample is the softest rectangle. The frontmatter owns those radii. Status dots are circular. Icons are authored inline SVG with rounded strokes (normally 18px, stroke width 1.7), sized down within compact controls. This Settings system introduces no shipping raster imagery.

## Components

**Buttons and fields.** Save Settings is the filled ochre action. Load, test, and export actions use outlined secondary buttons. Clear Cards is a red text action with confirmation. Inputs and native selects share strong one-pixel outlines; hover shifts the border and focus uses ochre. Keyboard focus is a visible two-pixel outline with four-pixel offset, using rail gold inside navigation. Busy buttons are disabled with reduced opacity; unavailable model selects retain muted text.

**Navigation.** Icon and label anchors share one active petrol surface and gold text. The selected section follows the URL fragment, with AI tutor selected before a section is targeted. On mobile the same anchors form a scrolling row. The skip link appears on keyboard focus.

**Reading preview.** The header sample and inline subtitle sample update together immediately when Furigana, Romaji, or Hidden is selected. A stable preview stage prevents the surrounding layout from jumping. New text enters with a small fade and upward movement (220ms); reduced motion removes smooth scrolling and nearly eliminates animation and transitions.

**Save workflow.** The fixed footer exposes No pending changes, Unsaved changes, Saving settings…, or Could not save changes. Pending state persists until storage succeeds; test and discovery actions do not save. A status toast confirms the result. Standard control transitions use a short ease (160ms).

**Connection feedback.** Inline live regions describe loading, discovered models, tested success, and failure. A loaded list is discovery evidence; only a nonempty AI reply earns a working AI message. Parser success requires valid parser data. Anki success requires a valid API result (integer version 6 or newer) without an API error. Colors support these written states. Long error messages wrap within the available width.

**The Observed State Rule.** Say what the completed operation proved, retain actionable failure text, and keep connection tests distinct from saved configuration.

**Setup guide.** A native disclosure keeps detailed setup and troubleshooting available after the main groups. Code examples use wrapping monospace blocks, strong field references, and normal links.

## Do's and Don'ts

### Do:

- **Do** follow system appearance through the paired color tokens.
- **Do** align standard fields in open sections separated by thin rules.
- **Do** show reading changes in both Japanese samples before saving.
- **Do** keep pending changes visible until a successful storage write.
- **Do** pair every connection color with text describing observed state.

### Don't:

- **Don't** treat model discovery as a successful AI request or a saved setting.
- **Don't** replace the native controls and setup disclosure with decorative substitutes.
- **Don't** apply this Settings redesign to the YouTube learning interface without a separate design decision.

Evidence: `.impeccable/review/first-{desktop,tablet,mobile}-{light,dark}.png`, their full-document companions, and `anki-error-*` captures. Review screenshots use explicit mock configuration; displayed ports, model counts, and collection contents are fixtures rather than product defaults.
