# Design Direction

> **Audience**: AI agents (and humans) generating BeatOS UI code.
> **Read this** before producing any frontend component, page, or styling token. If a generated UI does not match this direction, it is wrong even if the code is correct.

This is **direction**, not pixel-perfect spec. It tells you the shape of the right answer; it does not pre-decide every screen.

---

## 1. North star

**Visual reference**: **Spotify desktop app, dark theme.** When in doubt, ask "what would Spotify do here?" then adapt for BeatOS's producer use case.

**Mood keywords**: *darkroom · focused · dense-but-breathing · tactile · pro-tool*.

**Anti-patterns** (what BeatOS must NOT look like):
- Avoid: shadcn beige, Bootstrap drop-shadows, Material ripples, glassmorphism, pastel marketing palettes

---

## 2. Primary screen layout — 3-column

The main window is permanently divided into three vertical columns. The proportions are not absolute; the table below is the default.

```
┌──────────────────┬───────────────────────────────────┬─────────────────────┐
│                  │                                   │                     │
│   LEFT           │   MIDDLE                          │   RIGHT             │
│   ────           │   ──────                          │   ─────             │
│   Sources        │   Track list of selected list     │   Preview of        │
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
│   + Add source   │                                   │   Tags · License    │
│                  │                                   │   Description       │
│                  │                                   │                     │
└──────────────────┴───────────────────────────────────┴─────────────────────┘
   ~240px              flex: 1                           ~360px
```

### Column responsibilities

| Column | Contains | Source of truth | Selection state |
|---|---|---|---|
| **Left** | Two sections: **SOURCES** (registered storage folders + the synthetic "All Beats" row that aggregates every track across sources) and **LISTS** (user-created lists — genre folders, beattape collections). Right-click a source or list for Rename / Delete. | `source` table + `list` table. "All Beats" is a virtual selector that spans every source. | Selecting a source or list updates Middle. |
| **Middle** | Rows representing tracks in the selected source/list. Top of column: a filter chip bar (§6) further narrows the view. Header row is sortable. | `track` table filtered by selected source/list + active chips. | Selecting a row updates Right. Double-click opens the track editor (full-route — see §5). |
| **Right** | "Now focused" detail: large cover art, title, all metadata fields read-only. Edit button promotes to the editor. | Currently focused `track`. | Read-only here; edits happen in the editor. |

### Layout rules

- Columns are **always visible** at app width ≥ 1100px.
- Below 1100px (rare for a desktop pro tool, but supported): right column collapses to a peek-bar; below 800px left column collapses to icon rail. Mobile is **out of scope**.
- Column dividers are **1px subtle lines** (`var(--border-subtle)`), not gaps or shadows.
- Each column scrolls independently.

### What "Source" means here

A Source is a registered folder on disk that contains audio files. The catalog (tracks, lists, search) is **unified across all sources** — switching between sources never hides tracks from other sources, it just filters the visible set. Lists especially are pure organization, never tied to which physical folder a track lives in.

### What "Beattape" means here

A Beattape is just a user-created list whose membership the user curates manually (drag-drop tracks in). It maps to the same table as a genre list — the only difference is intent (genre = browse filter; beattape = packaged release); UI may show beattape lists with a different icon (📦) and a "Export tape" action.

---

## 3. Color tokens

Start from Spotify's dark palette, then nudge toward BeatOS personality. **These are defaults. Tune the accent later; do not tune the dark grays.**

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

**Rule**: every color used in code must come from a token. Inline hex in JSX is a smell. The token names above are the canonical CSS variable names.

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

- **Default font** Inter (free, broad weight range, ships well in Electron); **numeric font** JetBrains Mono for tabular figures in BPM/duration columns.
- **Never** use the OS default font or serif faces.

---

## 5. Component patterns

### Track row (middle column)

- Height: **64px** — two-line layout: title on top, `Producer` subtitle underneath.
- Cover thumb: **48×48** at row left, 4px radius. Cover doubles as the play surface: hover or current-track state reveals a dark scrim + play button centered on the thumbnail; no standalone play column.
- Columns: Cover · Title/Producer · BPM · Key · Genre · Updated. All **left-aligned**.
- `Updated` column renders absolute `YYYY-MM-DD` — relative dates were rejected as too noisy at this density.
- Column widths are **user-resizable** via drag handles between adjacent columns. Session-scoped; not persisted across launches (see §10).
- Hover: background → `--bg-row-hover`, no border.
- Selected: background → `--bg-row-selected`, **left 3px accent bar inside the row** (not a full border).
- Double-click opens the editor.
- Right-click opens a context menu (edit, add to list, remove from list, delete from catalog, reveal in Finder/Explorer).
- Drag handle visible only on hover, lives on the cover (not the row body — prevents accidental drag-start when clicking row interior).

### Editor (when double-click a row)

- **Default**: full-route navigation (replaces Middle + Right with an editor view). This avoids modal layering complexity.
- Layout: 2-column grid — 200×200 `CoverDropZone` on the left, form fields on the right (Title, BPM/Key/Genre, Mood/Producer/License, Tags, Description), full-width audio file rows below.
- Audio files render as a single full-width section with **5 rows** (4 audio role variants + Stems). Each row: role label · filename · filesize · hover-actions. Empty audio rows always render with "+ Add file" for discoverability.
- Cover drag-out: the 200×200 cover is a native OS drag source — drag it into Finder / another app and the underlying file is dragged. Library row thumbs are NOT drag sources (would conflict with dnd-kit drop targets).
- Unsaved-changes dialog (Save / Discard / Cancel) guards every navigation exit (Cancel, ESC, route change).
- ESC closes / returns to list.

### Buttons

| Variant | Use | Style |
|---|---|---|
| Primary | The single most important action on screen (Save, Inject, Confirm) | `--accent` background, white text, 32px height, 6px radius |
| Secondary | Common actions (Add asset, Switch source) | Transparent bg, `--text-primary`, 1px `--border-subtle` border |
| Ghost | In-row actions, icon-only buttons | No background, `--text-secondary`; on hover `--text-primary` + `--bg-row-hover` |
| Destructive | Delete, Discard | `--danger` text on `--bg-elevated`; click confirms via inline prompt, not a modal |

- **No text-shadow, no inner-shadow, no gradient on buttons.**
- Border radius: **6px everywhere** (buttons, cards, rows). Only the cover art preview is **8px**. Avoid pill shapes except for tag chips.

### Cover art

- Right column cover: max **320×320**, 8px radius, subtle `0 8px 24px rgba(0,0,0,0.4)` drop-shadow.
- Editor cover (`CoverDropZone`): **200×200**, 8px radius. Doubles as a native OS drag source for the underlying file.
- Row thumbnail: **48×48**, 4px radius, no shadow. Overlay scrim + play button on hover or when this row is the current player track.
- When no cover: a flat `--bg-elevated` square with a centered music-note glyph in `--text-tertiary`.

> **Exception (2026-06-01, right detail panel)**: the right column (`TrackDetailPanel`) uses a realistic **jacket + pulled-out vinyl** composition with **square corners** (the circular disc/label are the only round shapes) — it does NOT follow the 320×320 / 8px-radius rule above, nor the §5 "6px radius everywhere" rule. The disc slides out on hover and slides + spins while the focused track is playing (`prefers-reduced-motion` disables the spin). BPM/Key render as LCD stat bars (mono + glow), genre/mood/tags as square chips, sections split by etched dividers. See `docs/superpowers/plans/2026-06-01-right-panel-vinyl.md`.

### Empty states

- Each list view has a meaningful empty state, not "No items found":
  - "All Beats" empty → "Drop a `.wav` here, or click + Add Track"
  - User list empty → "Drag tracks from All Beats to start curating this list"
  - Filtered view with no matches → "No tracks match your filters"
- Empty-state typography: H2 + 13px body + a single ghost button.

### Fixed-slot rows with dashed empty state

When a section has a known, finite set of slots (FILES, LICENSE TIERS,
default-tier templates in Settings), render every slot every time —
filled slots show a solid border, unfilled slots show a dashed border.
Each row uses the same shape: a fixed-width left label (`w-[100px]` or
`w-[140px]`), the editable content in the middle, an action affordance
on the right (`+ Add file` / trash / nothing). The shared visual
language tells the user "this slot exists by design; you just haven't
filled it yet" — a producer-of-MP3-only doesn't see WAV as a feature
gap, they see it as an unused option.

---

## 6. Filtering, sorting, and pickers

### Filter chip bar

A horizontal chip bar at the top of the middle column. Begins with `+ Add filter`; clicking opens a Radix Popover with two views: **field list** → **field-specific picker**. The two views share one Popover (Radix does not nest popovers — flatten into one with internal view state).

- **AND across fields**: `Producer=X AND Genre=Y`.
- **OR within a multi-value field**: `Genre IN (Trap, Lo-fi)`.
- The sidebar Source/List selection is the **primary** filter; chips narrow further within it. Removing all chips returns to the source/list base set.
- Active filter state is **session-scoped** (see §10).

### Sortable column headers

The `TableHeader` row at the top of the middle column has clickable column titles. Click toggles asc → desc → (next column resets).

- **Only one active sort column at a time.** The active column shows a direction indicator (`↑` / `↓`).
- Default sort: `updated_at DESC` for source / All Beats views; list-position ASC for user list views (sentinel preserves manual curation order).
- Sort state is session-scoped.

### `ChipMultiSelect` picker

Used for vocabulary-based fields (Genre, Mood) and free-add fields (Producer). Renders selected values as removable chips; a `+` trigger opens a Radix Popover with the option list.

- Producer is **free-add** — type a new value in the popover, it joins the local picker state and persists on Save.
- Genre and Mood are **vocab-only** — pulled from `genres.ts` / `moods.ts`. English `en` is the canonical stored key; any Chinese `zh` label is display-only.
- `maxSelections={1}` collapses the component into a single-select dropdown trigger (shows current value, no chip bar) — use this for fields that are conceptually single-value but should share the picker UX.

### `KeyPickerPopover` (Splice-style)

Replaces a plain text input for `key_signature`. Radix Popover anchored to a trigger button that reads "Add key" when empty or the formatted value when set.

- **Flat / Sharp tabs** at the top.
- Note grid: alteration row (sharps or flats) above the naturals row, with the E–F and B–C gaps preserved.
- **Major / Minor parallel buttons** at the bottom.
- Clear + Close actions.
- **No default mode.** Major or Minor must be picked explicitly — partial selections (note without mode) are discarded on Close. No half-state ever reaches the DB.
- Display convention: major keys render with sharps, minor keys with flats. Normalized storage format: `"F# minor"` / `"Eb major"`. Legacy values are preserved until the user commits a fresh pick.

---

## 7. Bottom player bar

A Spotify-pattern player bar pinned to the bottom of `AppShell` as a `flex-shrink-0` footer. A single `<audio>` element is owned by the player store; no component creates its own audio element.

### Surfaces

- **Transport**: Play / Pause / Prev / Next, Seek scrubber, Volume + Mute, Shuffle, Repeat.
- **Role switcher**: dropdown that picks between the 4 audio role variants (`tagged_wav` / `untagged_wav` / `tagged_mp3` / `untagged_mp3`). Default priority: `tagged_wav > untagged_wav > tagged_mp3 > untagged_mp3`. Switching role replays from start.
- **Subtitle**: `producer · BPM · Key` (em-dash placeholder for nulls). Producer is per-track.

### Queue rules

- The queue is a **snapshot of the visible view at play-start** — All Beats / Source / List / Search results, in their current sort order at that instant.
- Queue does **NOT** auto-update when the user navigates to a different view mid-playback. "Add to queue" is out of scope.

### Hard rules

- **No global Space shortcut** — out of scope.
- **No persistence across restarts** — player state resets on launch (see §10).
- Library row thumbs control playback via the cover overlay (§5 Track row), not a separate play column.

---

## 8. Interactions

| Action | Trigger | Result |
|---|---|---|
| Switch source / list | Click row in left column | Middle re-renders; right column shows previously-selected track if it's still in the new view, else first row |
| Focus a track | Click row | Right column updates |
| Open editor | Double-click row, or Enter on focused row | Navigate to editor |
| Add tracks to user list | Drag row(s) from middle → list in left | Tracks join target list (multi-list membership allowed); multi-select via cmd/ctrl-click or shift-click |
| Remove from user list | Right-click → Remove from this list | Track leaves the list, stays in the catalog |
| Delete from catalog | Right-click → Delete (in "All Beats" view only) | Confirm inline; track + asset rows removed |
| Drag cover out of editor | Drag the 200×200 cover into Finder / another app | Native OS drag of the underlying file |
| Inject | Editor → Inject button | Inject flow per charter §8 Flow 3 |

- **Keyboard**: Up/Down moves focus in middle column; Enter opens editor; ESC returns to list. Cmd/Ctrl-F focuses search.
- **Drag-and-drop** is first-class (curating beattapes). Use `@dnd-kit/core` for in-app drag (Playwright `_electron` cannot drive native HTML5 drag); native OS drag is reserved for cover drag-out only.
- **No hover-tooltips** for things obvious from labels. Tooltip is only for icon-only buttons.

---

## 9. Density & spacing

- 4px base grid. All paddings and gaps are multiples of 4 (4, 8, 12, 16, 24, 32).
- Default page padding (inside a column): **16px**.
- Default gap between rows: **0** (rows are flush; visual separation comes from hover, not gaps).
- Default gap between metadata fields in right column: **8px vertical**.
- Track tab/section spacing in editor: **24px** between major sections.

---

## 10. No-persistence pattern

Several pieces of UI state are deliberately **session-scoped** — they reset on every app launch. This is intentional simplicity; do not add persistence without an explicit user request.

- Column widths in the Library table
- Sort column + direction
- Active filter chips
- Player state (current track, queue, volume, shuffle, repeat)
- Multi-select state in the track list

The catalog itself (tracks, assets, lists, sources, settings) is persisted in SQLite. The line is: **organizational data is persisted; transient view state is not.**

---

## 11. What this doc explicitly does NOT prescribe

These belong to v0.1.0 polish or per-screen design sessions:

- Specific motion / animation timings (defer until v0.1.0)
- Sound design (none planned)
- Loading skeleton patterns (decide when first slow query exists)
- Dark/light theme toggle (BeatOS is dark-only at v0.1.0; light theme deferred)
- Internationalization / RTL (English only at v0.1.0)
- Onboarding illustration / brand mascot (deferred)
- Custom icon set (use `lucide-react` until v0.1.0)
- Persistence of session view state (see §10)

If you find yourself designing one of these, stop and check whether it should wait.

---

## 12. When to update this file

Update when: a real screen ships and reveals a token gap (e.g., needed `--bg-row-dragover`); a pattern repeats across 3+ screens and deserves codifying; the user reverses a direction (e.g., adds light theme, or asks for persistence on something currently session-scoped).

Do **not** update for: one-off page-specific styling; experiments that didn't ship; hypothetical future patterns; per-version changelog entries (that's `CHANGELOG.md`).
