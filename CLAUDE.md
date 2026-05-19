# Dots & Boxes — CLAUDE.md
# Project handoff context. Read this at the start of every session.

---

## What This Project Is

A browser-based Dots & Boxes game deployed as a PWA at **theapptestsite.com** (Netlify).
Players take turns drawing lines between dots. Completing a box scores a point. Most boxes wins.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, SVG rendering |
| Stats backend | Supabase (anon key, RLS enabled) |
| Hosting | Netlify (deployed via zip drag-drop) |
| PWA | manifest.json + sw.js (cache: dots-and-boxes-v4) |

---

## File Structure

```
game/
├── CLAUDE.md
├── index.html          ← all CSS + HTML structure
├── game.js             ← all game logic, rendering, AI, UI handlers
├── ai-worker.js        ← Web Worker for hard/expert minimax AI
├── sw.js               ← service worker (bump cache version on each deploy)
├── manifest.json       ← PWA manifest
├── icon-192.png
├── icon-512.png
├── game.zip            ← deploy artifact (rebuild after every change)
├── serve.bat           ← local dev server launcher
└── avatars/            ← square profile images (18 total)
    alien.png, astronaut.png, aviator.png, cactus.png, cat.png,
    flame.png, fox.png, ghost.png, lighting.png, ninja (no ext — check),
    obot.png (check name), owl.png, pirate.png, princess.png,
    samurai.png, scuba.png, trash panda.png, wave.png
```

---

## Deployment

**Always use netlify.com/drop with the zip** — dragging to the Deploys tab of an existing site
often serves stale files. Drop creates a fresh site, then reassign the custom domain.

Rebuild zip before every deploy:
```powershell
cd "C:\Users\nedna\OneDrive\Desktop\game"
Remove-Item game.zip
Compress-Archive -Path 'index.html','game.js','ai-worker.js','sw.js','manifest.json','icon-192.png','icon-512.png','avatars' -DestinationPath 'game.zip' -Force
```

**Bump `sw.js` cache version** (dots-and-boxes-v4 → v5 etc.) with every deploy that changes
`index.html` or `game.js`, otherwise PWA-installed users get stale cached files.

---

## Splash Screen Setup

Players configure before each session:
- Name (up to 12 chars)
- Color (color picker — drives edge colors, panel borders, avatar ring)
- Avatar (tap preview image → grid of 18 options from `avatars/`)
- Mode: 2 Players or vs Computer
- Difficulty (AI mode only): Easy / Medium / Hard / Expert
- Grid size: 3×3 through 7×7

---

## AI Difficulty Levels

| Level | Strategy |
|---|---|
| Easy | Takes free boxes; otherwise 40% greedy, 60% random |
| Medium | Full greedy — takes free boxes, avoids gifting 3-sided boxes |
| Hard | Minimax with alpha-beta pruning (depth 3–5 by grid size) |
| Expert | Deeper minimax (depth 4–7 by grid size), uses ai-worker.js Web Worker |

---

## Scoring Model

Scoring is just "most boxes wins" — raw box count, no time component.
(The sigmoid scoring in the Commute App is a different project.)

---

## Supabase Stats

- Table: `players` — columns: `name`, `games_played`, `games_won`, `games_by_grid` (jsonb)
- RLS: **enabled** — policies allow select (all) and upsert (matching name)
- Anon key is embedded in game.js (publishable/safe for client-side)
- Stats save only for named human players (not AI, not blank names)
- `games_by_grid` tracks wins/played per grid size key (e.g. `"5"`)

---

## Rendering Model

- SVG with named layers: `layer-dots`, `layer-boxes`, `layer-edges`, `layer-hover`
- Edge colors match the claiming player's chosen color
- Boxes filled with semi-transparent player color
- Hover preview shows current player's color at 45% opacity
- Hit detection is distance-based (`Math.hypot`) to avoid corner ambiguity

---

## Turn Logic

- Turns **always alternate** — no go-again on box completion (intentional design choice)
- Undo: 5-second window after each move; snapshot taken before move is applied
- Handoff overlay shown in 2-player mode between turns

---

## Game-Over Overlay

Semi-transparent (board visible behind it). Four buttons:
- **Rematch** — restart same settings
- **New Game** — back to splash
- **Stats** — open Supabase leaderboard
- **View Board** — dismiss overlay, inspect final board

---

## Known Issues / Open Work

- `ninja` avatar has no file extension — may show broken image; rename to `ninja.png`
- `obot.png` may be a typo for `robot.png` — verify filename
- Avatar images not cached by service worker (loads from network; fine when online)
- Expert AI runs minimax synchronously for small grids — Web Worker only used by hard mode currently; wire expert to worker too for large grids
- Stats accessible from splash screen (link) and game-over overlay (button)

---

## Architecture Decisions — Do Not Re-Debate

- **Turns always alternate** — no go-again, even on box completion
- **Netlify Drop (not Deploys tab)** — Drop is reliable; Deploys tab serves stale files
- **Vanilla JS + SVG** — no framework, no canvas; SVG layers are clean and debuggable
- **Supabase RLS on** — anon key is safe client-side; RLS prevents cross-player writes
- **One zip includes avatars/ folder** — static assets served by Netlify, no CDN needed
