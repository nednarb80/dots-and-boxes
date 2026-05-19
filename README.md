# Dots & Boxes

A polished, mobile-first Dots and Boxes game built as a Progressive Web App (PWA). Play against an AI opponent or a friend on the same device.

**[Play it live →](https://brandencollins.com/dots)**

---

## Features

- **4 AI difficulty levels** — Easy, Medium, Hard, and Expert (minimax algorithm)
- **18 custom avatars** — pick your character before each game
- **Player stats** — wins, games played, and performance by grid size tracked via Supabase
- **Multiple grid sizes** — 2×2 through 6×6 (or larger)
- **PWA** — installable on iOS and Android, works offline
- **Audio** — sound feedback on moves and box captures
- **Dark theme** — clean, mobile-optimized UI

---

## Tech Stack

- Vanilla HTML / CSS / JavaScript — no framework dependencies
- [Supabase](https://supabase.com) — player stats (anonymous key, read/write via RLS)
- Web Workers — AI runs off the main thread via `ai-worker.js`
- Service Worker — offline caching via `sw.js`

---

## Project Structure

```
dots-and-boxes/
├── index.html          # Game UI, styles, and shell
├── game.js             # Game logic, AI, Supabase stats
├── ai-worker.js        # Minimax AI in a Web Worker
├── sw.js               # Service worker for PWA offline support
├── manifest.json       # PWA manifest
├── icon-192.png        # App icon (192px)
├── icon-512.png        # App icon (512px)
└── avatars/            # 18 character avatar images
```

---

## Running Locally

No build step required. Just serve the folder with any static file server:

```bash
# Using Python
python -m http.server 8000

# Using Node
npx serve .
```

Then open `http://localhost:8000` in your browser.

---

## Deploying

This is a static site — deploy anywhere:
- **Netlify** — drag and drop the folder
- **GitHub Pages** — enable in repo settings → Pages → Deploy from branch
- **Vercel** — connect the repo, zero config

---

## Supabase Setup

The game uses a `players` table for stats. If you fork this and want stats to work, create a table in your own Supabase project:

```sql
create table players (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  games_played int default 0,
  games_won int default 0,
  games_by_grid jsonb default '{}'
);

-- Allow public read/write (personal tool, no auth needed)
alter table players enable row level security;
create policy "public all" on players for all using (true) with check (true);
```

Then update `SUPABASE_URL` and `SUPABASE_KEY` in `game.js`.

---

## License

MIT — build on it.
