# MetroForge Design Tokens

Extracted from real source (read-only audit). No values invented.

**Primary sources**
- `apps/desktop/src/tokens.css` — Concept A token system + legacy aliases
- `apps/desktop/src/styles.css` — consumes tokens; body / shell / component geometry

## Surfaces / backgrounds

| Token | Value | Role |
|-------|-------|------|
| `--bg-app` | `#080d14` | App root / body |
| `--bg-sidebar` | `#0a1018` | Sidebar + status strip |
| `--bg-surface` | `#0d141d` | Panel base |
| `--bg-surface-raised` | `#111a25` | Elevated panels |
| `--bg-surface-hover` | `#152131` | Hover / active fill |
| `--bg-input` | `#080d13` | Inputs |

Legacy aliases in `tokens.css`: `--bg-root`, `--bg`, `--bg-panel`, `--surface`, `--panel`, etc. map to the above.

## Borders

| Token | Value |
|-------|-------|
| `--border-subtle` | `#1b2a39` |
| `--border-normal` | `#26394b` |
| `--border-focus` | `#258cff` |
| `--border-strong` | `#344b63` |
| `--border` (alias) | `var(--border-normal)` |

Component borders in `styles.css` are typically `1px solid var(--border)` / `var(--border-subtle)`.

## Text

| Token | Value |
|-------|-------|
| `--text-primary` | `#e8edf3` |
| `--text-secondary` | `#9aa9b8` |
| `--text-muted` | `#667789` |
| `--text-inverse` | `#061018` |

Aliases: `--text`, `--text-dim`, `--muted`.

Body default (`styles.css`): `font-size: 12.5px`, `line-height: 1.4`, `color: var(--text-primary)`.

## Accent / semantic

| Token | Value |
|-------|-------|
| `--accent` | `#258cff` |
| `--accent-hover` | `#399cff` |
| `--accent-soft` | `rgba(37, 140, 255, 0.12)` |
| `--accent-pressed` | `#1a74d9` |
| `--nav-active-bg` | `rgba(37, 140, 255, 0.32)` |
| `--nav-active-fg` | `#f2f7fc` |
| `--success` | `#3dba7a` |
| `--warning` | `#d4a017` |
| `--danger` | `#e06c75` |
| `--info` | `#258cff` |

Soft variants: `--*-soft` at ~12% alpha. Glow tokens neutralized: `--glow-cyan/amber/violet: none`.

Legacy cyan/blue aliases (`--accent-cyan`, `--accent-blue`, …) point at `--accent`.

## Spacing scale

| Token | Value |
|-------|-------|
| `--space-1` … `--space-8` | `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px` |

Many layouts still use rem fractions in `styles.css` (e.g. panel padding `0.65rem–0.8rem`, content gutters ~`0.45rem`).

## Radius

| Token | Value |
|-------|-------|
| `--radius-sm` | `4px` |
| `--radius-md` | `6px` |
| `--radius-lg` | `8px` |
| `--radius` (alias) | `var(--radius-md)` |
| `--radius-xl` | alias → `--radius-lg` (capped) |

Buttons use `--radius-sm`; panels use `--radius-md`.

## Shadows / motion

| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.35)` |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.35)` |
| `--ease-fast` | `100ms ease` |
| `--ease` | `160ms ease` |
| `--ease-slow` | `220ms ease` |

## Typography

| Token | Value |
|-------|-------|
| `--font-ui` | `Inter, Geist, 'Segoe UI', system-ui, -apple-system, sans-serif` |
| `--font-display` | same as `--font-ui` |
| `--font-mono` | `'Cascadia Code', 'JetBrains Mono', Consolas, ui-monospace, monospace` |

Observed sizes in `styles.css` (approx):
- Body: `12.5px`
- Brand title: ~`0.82rem`
- Nav group labels: `0.62rem` uppercase
- Nav items: ~`0.76–0.8rem`
- Status strip: `0.64rem` mono
- Screen titles (`h2`): larger section headings via `.screen-header`

## Shell metrics

| Token | Value | Used by |
|-------|-------|---------|
| `--topbar-h` | `44px` | `.app` grid row 1 |
| `--sidebar-w` | `216px` | expanded sidebar column |
| `--sidebar-w-collapsed` | `52px` | icon rail |
| `--status-h` | `26px` | status strip row |
| `--inspector-w` | `280px` | editor inspectors |

`.app` grid (`styles.css`):
```
grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
grid-template-rows: var(--topbar-h) minmax(0, 1fr) var(--status-h);
```

At `max-width: 1366px`, status hint hides; initial sidebar may collapse via `matchMedia` in `App.tsx`.

## Component geometry (styles.css)

| Element | Observed |
|---------|----------|
| Default `button` | `padding: 0.4rem 0.7rem`; `border: 1px solid var(--border)`; `border-radius: var(--radius-sm)` |
| Primary buttons | fill `var(--accent)` |
| Focus | `outline: 2px solid var(--focus)` (+ offset 2px) |
| Scrollbars | 8px thin; thumb `var(--border-normal)` |
| Panel L0/L1/L2 | solid fills; `1px` borders; radius `--radius-md`; padding ~`0.65–0.8rem` |
| Status bar | height via `--status-h`; mono; `gap: 0.28rem` |
| Asset cards | bordered tiles in `.asset-grid` |
| Editor workspace | 3-region: left rail / canvas / inspector |

## Effects policy (current)

- Prefer **border separation** over large shadows
- Glow disabled (`--glow-*: none`, `--border-glow: transparent`)
- No glassmorphism tokens

## API key display policy (UI)

Settings / Providers show key presence only as **configured** / **not set** via `getConfig().envKeys.*` booleans — never secret values (`SettingsScreen.tsx`, `ProvidersScreen.tsx`).
