# Design Direction

> **Audience**: AI agents (and humans) generating BeatOS UI code.
> **Read this** before producing any frontend component, page, or styling
> token. If a generated UI does not match this direction, it is wrong even
> if the code is correct.

This is **direction**, not pixel-perfect spec. It tells you the shape of the
right answer; it does not pre-decide every screen.

---

## 1. North star

**Visual reference**: **Spotify desktop app, dark theme.**
When in doubt, ask "what would Spotify do here?" then adapt for BeatOS's
producer use case.

**Mood keywords**: *darkroom · focused · dense-but-breathing · tactile · pro-tool*.

**Anti-patterns** (what BeatOS must NOT look like):
- Generic shadcn beige / "AI-default" landing page
- Bootstrap-style cards with thick borders and drop shadows
- Material Design ripples and elevation overlays
- Glassmorphism / heavy translucency
- Pastel marketing palettes

---

## 2. Primary screen layout — 3-column

The main window is permanently divided into three vertical columns. The
proportions are not absolute; the table below is the default.

```
┌──────────────────┬───────────────────────────────────┬─────────────────────┐
│                  │                                   │                     │
│   LEFT           │   MIDDLE                          │   RIGHT             │
│   ────           │   ──────                          │   ─────             │
│   Library        │   Track list of selected list     │   Preview of        │
│   sidebar        │                                   │   focused track     │
│                  │   • All Beats                     │                     │
│   📂 All Beats   │     ┌────────────────────────┐    │   ┌──────────────┐  │
│   📂 Trap        │     │ ⏵ Title  BPM  Key  ... │    │   │              │  │
│   📂 Lo-fi       │     │ ⏵ Title  BPM  Key  ... │    │   │   Cover Art  │  │
│   📂 Drill       │     │ ⏵ Title  BPM  Key  ... │    │   │              │  │
│                  │     │ …                      │    │   │              │  │
│   ── Beattapes ──│     └────────────────────────┘    │   └──────────────┘  │
│   📦 Tape vol.1  │                                   │                     │
│   📦 Tape vol.2  │   double-click row → editor       │   Title             │
│                  │                                   │   BPM · Key · Genre │
│   + New list     │                                   │   Tags · License    │
│                  │                                   │   Description       │
│                  │                                   │                     │
└──────────────────┴───────────────────────────────────┴─────────────────────┘
   ~240px              flex: 1                           ~360px
```

### Column responsibilities

| Column | Contains | Source of truth | Selection state |
|---|---|---|---|
| **Left** | Lists: the system "All Beats" list (always present, contains every track in the active library) + user-created lists (genre folders, beattape collections). Fixed bottom: "+ New list". | `library` table + a `list` table (introduced in v0.0.2 design). The "All Beats" view is a virtual list that selects every track. | Selecting a list updates Middle. |
| **Middle** | Rows representing tracks in the selected list. Each row shows the most-scanned metadata (title, BPM, key, tags). Header row is sortable. | `track` table filtered by selected list. | Selecting a row updates Right. Double-click opens the track editor (modal or full-page route — see §5). |
| **Right** | "Now focused" detail: large cover art, title, all metadata fields read-only. Edit button promotes to the editor. | Currently focused `track`. | Read-only here; edits happen in the editor. |

### Layout rules

- Columns are **always visible** at app width ≥ 1100px.
- Below 1100px (rare for a desktop pro tool, but supported): right column
  collapses to a peek-bar; below 800px left column collapses to icon rail.
  Mobile is **out of scope**.
- Column dividers are **1px subtle lines** (`var(--border-subtle)`), not gaps
  or shadows.
- Each column scrolls independently.

### What "Beattape" means here

A Beattape is just a user-created list whose membership the user curates
manually (drag-drop tracks in). It maps to the same table as a genre list —
the only difference is intent (genre = browse filter; beattape = packaged
release). UI may show beattape lists with a different icon (📦) and a
"Export tape" action; the data model is identical.

---

## 3. Color tokens

Start from Spotify's dark palette, then nudge toward BeatOS personality.
**These are defaults. Tune the accent later; do not tune the dark grays.**

| Token | Value | Used for |
|---|---|---|
| `--bg-base` | `#121212` | Window background, middle column |
| `--bg-elevated` | `#181818` | Cards, right-column panel |
| `--bg-elevated-hover` | `#1f1f1f` | Hovered card / row |
| `--bg-sidebar` | `#000000` | Left column |
| `--bg-row-hover` | `#1a1a1a` | Track row hover |
| `--bg-row-selected` | `#2a2a2a` | Track row selected |
| `--border-subtle` | `#282828` | Column dividers, table separators |
| `--text-primary` | `#ffffff` | Titles, primary metadata |
| `--text-secondary` | `#b3b3b3` | Subtitles, secondary metadata, labels |
| `--text-tertiary` | `#6a6a6a` | Disabled, placeholder, hint |
| `--accent` | `#7c5cff` (violet) — locked since v0.0.1 in `apps/desktop/src/renderer/src/assets/main.css`. | Primary CTAs, selection ring, "Now Playing"-style highlights |
| `--accent-soft` | `<accent>` at 18% alpha | Subtle accent backgrounds, hover trails |
| `--danger` | `#f15e6c` | Destructive actions, missing-asset warning |
| `--success` | `#3ecf8e` | "Inject succeeded", confirmed states |

**Rule**: every color used in code must come from a token. Inline hex in JSX
is a smell. The token names above are the canonical CSS variable names.

---

## 4. Typography

| Role | Font | Size | Weight | Line height |
|---|---|---|---|---|
| Display (cover-page title) | Inter | 32px | 700 | 1.1 |
| H1 / page title | Inter | 24px | 700 | 1.2 |
| H2 / section | Inter | 18px | 600 | 1.3 |
| Body / row title | Inter | 14px | 500 | 1.4 |
| Metadata / sub | Inter | 13px | 400 | 1.4 |
| Label / caption | Inter | 11px uppercase, 0.05em letter-spacing | 600 | 1.2 |
| Numeric (BPM, duration) | JetBrains Mono | 13px | 500 | 1.4 |

- **Default font**: Inter (free, broad weight range, ships well in Electron).
- **Numeric font**: JetBrains Mono — tabular figures matter for BPM/duration
  columns aligning vertically.
- **Never** use the OS default font (looks generic).
- **Never** use serif faces.

---

## 5. Component patterns

### Track row (middle column)

- Height: **44px** (Spotify-density; not 56px Material density).
- Hover: background → `--bg-row-hover`, no border.
- Selected: background → `--bg-row-selected`, **left 3px accent bar inside the row** (not a full border).
- Double-click opens the editor.
- Right-click opens a context menu (edit, add to list, remove from list, delete from library, reveal in Finder/Explorer).
- Drag handle visible only on hover (≡ icon at row left).

### Editor (when double-click a row)

- **v0.0.2 default**: full-route navigation (replaces Middle + Right with an editor view). This avoids modal layering complexity.
- **v0.1.0+ may revisit**: side-sheet from the right (Spotify "Now Playing" panel pattern).
- ESC closes / returns to list.

### Buttons

| Variant | Use | Style |
|---|---|---|
| Primary | The single most important action on screen (Save, Inject, Confirm) | `--accent` background, white text, 32px height, 6px radius |
| Secondary | Common actions (Add asset, Switch library) | Transparent bg, `--text-primary`, 1px `--border-subtle` border |
| Ghost | In-row actions, icon-only buttons | No background, `--text-secondary`; on hover `--text-primary` + `--bg-row-hover` |
| Destructive | Delete, Discard | `--danger` text on `--bg-elevated`; click confirms via inline prompt, not a modal |

- **No text-shadow, no inner-shadow, no gradient on buttons.**
- Border radius: **6px everywhere** (buttons, cards, rows). Only the cover art preview is **8px**. Avoid pill shapes except for tag chips.

### Cover art

- Right column cover: max **320×320**, 8px radius, subtle `0 8px 24px rgba(0,0,0,0.4)` drop-shadow.
- Row thumbnail: **40×40**, 4px radius, no shadow.
- When no cover: a flat `--bg-elevated` square with a centered 24px music-note glyph in `--text-tertiary`.

### Empty states

- Each list view has a meaningful empty state, not "No items found":
  - "All Beats" empty → "Drop a `.wav` here, or click + Add Track"
  - User list empty → "Drag tracks from All Beats to start curating this list"
- Empty-state typography: H2 + 13px body + a single ghost button.

---

## 6. Interactions

| Action | Trigger | Result |
|---|---|---|
| Switch list | Click list in left column | Middle re-renders; right column shows previously-selected track if it's still in the new list, else first row |
| Focus a track | Click row | Right column updates |
| Open editor | Double-click row, or Enter on focused row | Navigate to editor |
| Add track to user list | Drag row from middle → list in left | Track joins target list (multi-list membership allowed) |
| Remove from user list | Right-click → Remove from this list | Track leaves the list, stays in library |
| Delete from library | Right-click → Delete (in "All Beats" view only) | Confirm inline; track + asset rows removed |
| Inject (v0.0.4+) | Editor → Inject button | Inject flow per charter §8 Flow 3 |

- **Keyboard**: Up/Down moves focus in middle column; Enter opens editor; ESC returns to list. Cmd/Ctrl-F focuses search.
- **Drag-and-drop** is a first-class interaction (curating beattapes is the use case). Use library-native HTML5 drag, no react-dnd unless needed later.
- **No hover-tooltips** for things obvious from labels. Tooltip is only for icon-only buttons.

---

## 7. Density & spacing

- 4px base grid. All paddings and gaps are multiples of 4 (4, 8, 12, 16, 24, 32).
- Default page padding (inside a column): **16px**.
- Default gap between rows: **0** (rows are flush; visual separation comes from hover, not gaps).
- Default gap between metadata fields in right column: **8px vertical**.
- Track tab/section spacing in editor: **24px** between major sections.

---

## 8. What this doc explicitly does NOT prescribe

These belong to v0.1.0 polish or per-screen design sessions:

- Specific motion / animation timings (defer until v0.1.0)
- Sound design (none planned)
- Loading skeleton patterns (decide when first slow query exists)
- Dark/light theme toggle (BeatOS is dark-only at v0.1.0; light theme deferred)
- Internationalization / RTL (English only at v0.1.0)
- Onboarding illustration / brand mascot (deferred)
- Custom icon set (use `lucide-react` until v0.1.0)

If you find yourself designing one of these, stop and check whether it
should wait.

---

## 9. When to update this file

Update when:
- A real screen ships and reveals a token gap (e.g., we needed `--bg-row-dragover` and didn't have it)
- An accent color is finalized — replace the TBD line in §3
- A pattern repeats across 3+ screens and deserves codifying
- The user reverses a direction (e.g., decides to add light theme)

Do **not** update for:
- One-off page-specific styling
- Experiments that didn't ship
- Hypothetical future patterns
