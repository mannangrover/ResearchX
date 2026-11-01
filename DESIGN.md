# ResearchX design system

**Direction — "evidence, annotated."** ResearchX tells students where their idea
stands in the published literature. The look borrows from the tools of that world:
white paper or black screen, blue ink for actions, a highlighter for the one thing
that matters (the gap), footnotes for evidence, and journal-style serif headlines
over a precise technical sans. Inspired by the restraint of linear.app and
stripe.com (left-aligned type, real product UI as imagery, one action colour),
without copying either.

The one memorable element is the **literature map**: the student's idea plotted
among related papers, with the open region marked in highlighter. Everything
else stays quiet.

## Color

Each colour has one job. Tokens live in `frontend/src/styles.css` (`:root`, dark
values under `[data-theme="dark"]` and `prefers-color-scheme: dark`).

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#000000` | Page background (pure white / pure black, by request) |
| `--surface` | `#FFFFFF` | `#0A0B0D` | Panels and cards |
| `--surface-2` | `#F5F6F8` | `#121418` | Insets, table headers, quiet fills |
| `--surface-3` | `#EBEDF1` | `#1B1E24` | Tracks, skeletons, hover on insets |
| `--border` | `#E2E5EA` | `#22262D` | Hairlines and card outlines |
| `--border-strong` | `#C9CED6` | `#363B44` | Inputs, emphasised outlines |
| `--text` | `#10131A` | `#EDEFF3` | Headings and body text (ink) |
| `--text-2` | `#3A404C` | `#C4C9D2` | Secondary text |
| `--muted` | `#5E6572` | `#8F97A4` | Captions, metadata (≥ 4.5:1 on bg) |
| `--primary` | `#2451D6` | `#7C9CFF` | Cobalt ink: buttons, links, selection, focus |
| `--primary-hover` | `#1B40AE` | `#9BB4FF` | Hover on primary |
| `--primary-soft` | `#EDF1FD` | `#121B33` | Selected rows and tabs |
| `--accent` | `#F5D547` | `#E9C933` | Highlighter: research gaps and evidence marks only, never buttons |
| `--accent-soft` | `#FDF6D3` | `#2A2410` | Highlighted backgrounds |
| `--ok` / `--ok-soft` | `#11795A` / `#E5F4EE` | `#45C48F` / `#0C2219` | Success, done stages |
| `--warn` / `--warn-soft` | `#9C5A00` / `#FCF1DF` | `#EFAF4A` / `#2A1E0A` | Warnings, partial results |
| `--danger` / `--danger-soft` | `#BF2C2C` / `#FCEBEB` | `#FF7B7B` / `#331515` | Errors, destructive actions |

Rules: one primary action per view. Highlighter yellow always carries ink-coloured
text on top (never white). No gradients as decoration.

## Typography

- **Newsreader** (Google Fonts, variable optical size) — display: page titles,
  section headings, paper titles, big numbers. Weights 500 and 600.
- **IBM Plex Sans** — interface and body text. Weights 400, 500, 600.

| Step | Size / line height | Use |
|---|---|---|
| `--fs-display` | clamp(40px, 5vw, 58px) / 1.04, Newsreader 500, −0.02em | Landing hero only |
| `--fs-h1` | 36px / 1.15, Newsreader 600 | Page titles |
| `--fs-h2` | 28px / 1.2, Newsreader 600 | Section headings |
| `--fs-h3` | 20px / 1.3, Plex 600 | Card and panel titles |
| `--fs-lead` | 19px / 1.55, Plex 400 | Intro paragraphs |
| `--fs-body` | 16px / 1.6, Plex 400 | Body text |
| `--fs-sm` | 14px / 1.5, Plex 400–500 | UI controls, tables |
| `--fs-xs` | 12.5px / 1.4, Plex 500 | Captions, footnotes, metadata |

Sentence case everywhere: no all-caps labels, no tracked-out eyebrows. Lines stay
under 72 characters (`--measure: 64ch`). Footnote markers (small cobalt
superscripts) link a claim to its evidence; this is the only typographic
ornament.

## Spacing and layout

4px base scale: `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 24 ·
`--s-6` 32 · `--s-7` 48 · `--s-8` 64 · `--s-9` 96 · `--s-10` 128.
Section padding: 96px desktop, 64px mobile. Content width 1120px
(`--content`), 24px gutters (16px on phones). Everything is left-aligned; the
hero is a 5/7 split with the literature map on the right.

## Shape and depth

Radius follows hierarchy, not one value everywhere:
`--radius-sm` 6px (inputs, small buttons, chips with text) · `--radius` 10px
(cards, panels) · `--radius-lg` 16px (hero visual, large media) · pills 999px only
for status chips.

Cards are separated by hairline borders, not shadows. One shadow, `--shadow-lg`,
for things that float (menus, the hero visual, dialogs); `--shadow-sm` for a
subtle lift on raised controls. Dark mode uses borders only.

## Components

- **Primary button** — cobalt fill, white text, 40px tall (32 small, 48 large),
  `--radius-sm`. Hover: `--primary-hover`. Focus: 2px cobalt outline, 2px
  offset. Disabled: 45% opacity, no hover.
- **Secondary button** — surface fill, `--border-strong` outline, ink text; hover
  fills `--surface-2`.
- **Quiet button** — no fill or border, `--text-2`; hover fills `--surface-2`.
  Destructive variant uses `--danger` text.
- **Links** — cobalt, underline on hover (offset 3px). No arrows appended to text.
- **Inputs** — 40px, `--border-strong` outline, `--radius-sm`; focus: cobalt
  border + 3px `--primary-ring`; errors use `--danger` with a message underneath.
- **Cards** — `--surface`, 1px `--border`, `--radius`, 20–24px padding. Clickable
  cards change border to cobalt on hover; nothing lifts.
- **Navigation** — sticky top bar 60px with a hairline bottom border; app pages
  add the left sidebar (248px) with sentence-case section titles.
- **Status chips** — pill, soft background of the status colour, 12.5px text.
- **Footer** — hairline top border, three short link columns, muted text.

## Imagery, icons and motion

- No stock photos or illustrations. Imagery is the product itself: live
  fragments of real ResearchX screens (score breakdown, version comparison,
  paper analysis) built in HTML, and the literature map in SVG.
- Icons: the in-house 24px stroke set in `components/Icon.jsx` (2px stroke,
  rounded joins). No emoji.
- Motion: one orchestrated moment — the literature map settles and the gap is
  highlighted on load. Scroll drives only the "how it works" progress line.
  Everything else moves only in response to the user (hover, open, confirm).
  `prefers-reduced-motion` turns all of it off.
