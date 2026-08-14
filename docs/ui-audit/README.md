# UI audit pack

Share this folder for MetroForge desktop redesign review.

## Files

| File | Purpose |
|------|---------|
| **SCREENSHOT_INDEX.md** | Human-readable screenshot table |
| **SCREENSHOT_INDEX.json** | Machine-readable index |
| **metroforge-contact-sheet.png** | CRITICAL screens at a glance |
| **screenshots/*.png** | Full-window Electron captures |
| **CHATGPT_REDESIGN_BRIEF.md** | Layout/token brief + paste prompt |
| **layouts/*.svg** | Schematic wireframes (pre-capture) |
| **index.html** | Browser viewer for SVG layouts |

## Rerun capture

```powershell
pnpm --filter @metroforge/desktop build
pnpm exec playwright install chromium   # once
node scripts/capture-ui-screenshots.mjs
node scripts/build-contact-sheet.mjs
```

Skip live generation (faster):

```powershell
$env:METROFORGE_SCREENSHOT_SKIP_GENERATION=1
node scripts/capture-ui-screenshots.mjs
```

## Project used

`GeneratedGames/a-wind-swept-marsh-kingdom-with-a-hidden-crypt` (real TINY_TEST project).
