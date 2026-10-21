# ObVault

A quiet, feed-first archive for artwork by Oberlin students and alumni — photography, film, music, prose, theater, prints, and everything made in between. Students scroll a single large column of work, follow artists they love, leave notes, and find opportunities (casting calls, exhibitions, collaborations).

- **Feed-first** — you land on art, not on headers and menus
- **Archive search** — one page that searches the whole vault by artist, title, description, or tag, updating as you type
- **PDFs** — scripts, scores, and books post as sideways-flipping page decks (rendered in-browser with PDF.js, no download needed)
- **Collections** — artists group their own work into named collections on their profile; every post shows which collections it belongs to (in the feed and on its page), and you curate from the post itself
- **Instagram-style profiles** — grid of works, bio, follow
- **Likes, comments, shareable permalinks**
- **Opportunities board** — casting calls, open exhibitions, collaborations
- **Categories** kept tidy by a student moderator group
- **Light & dark mode** — warm paper by day, dim studio by night
- **Members-only** — sign-in restricted to `@oberlin.edu` accounts

---

## Run it locally (VS Code)

Requires **Node.js 18 or newer** (check with `node -v`).

1. Open this folder in VS Code
2. Open the terminal (`` Ctrl+` ``)
3. Install and start:

```bash
npm install
npm start
```

4. Open **http://localhost:3000**

The first run seeds the vault with sample artists, works (images, generated audio, writing), comments and opportunity calls so you can see how a full vault feels.

For auto-restart while editing code: `npm run dev`.

To reset the vault to its sample content: `npm run seed` (this wipes users, posts, and uploads).

---

## Authentication

### Quick preview — demo mode (default)

When no Google credentials are configured, the sign-in screen lists **sample accounts** (Maya, Theo, Priya…). Click one to explore. This is clearly labeled as a demo and exists so you can develop and preview locally.

### Real sign-in — Oberlin Google accounts (recommended for launch)

ObVault verifies Google sign-ins server-side and only admits accounts on the **oberlin.edu** hosted domain with a verified email. To enable:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (free)
2. **APIs & Services → OAuth consent screen** — set it up (external), and list `oberlin.edu` as a test user domain if you are not part of Oberlin's Workspace
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type *Web application*
4. Add your authorized origins (e.g. `http://localhost:3000`, and your deployed URL)
5. Copy the client ID into a `.env` file (copy `.env.example` to `.env`):

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

6. Restart the server. The Google button replaces the demo accounts automatically — demo mode switches itself off the moment `GOOGLE_CLIENT_ID` is set.

> Students sign in with the same Google account they use for their `@oberlin.edu` mail. Alumni can be admitted the same way as long as their Oberlin account stays active.

---

## Structure

```
obvault/
├── server.js          Express app: API routes, auth, uploads
├── lib/
│   ├── store.js       JSON-file data store (data/db.json)
│   ├── seed.js        Sample content (npm run seed)
│   └── wav.js         Tiny synth for the sample audio posts
├── seed-media/        Hand-made SVG artworks for the sample vault
├── public/            The frontend (no build step)
│   ├── index.html
│   ├── css/style.css
│   └── js/            api.js · ui.js · views.js · main.js
├── data/              created at runtime (the database)
└── uploads/           created at runtime (artwork files)
```

## Notes & honest limitations

- **Storage is a JSON file** (`data/db.json`) with atomic writes. Great for a class, club, or a few hundred users on one machine. If ObVault grows, replace `lib/store.js` with SQLite or Postgres — the rest of the code only talks to that module.
- **Uploads** live in `uploads/` (images, audio, video up to 80 MB). They are served only to signed-in members.
- **Moderation** — mark trusted students as moderators (edit `isModerator` in `lib/store.js` users, or set it in `data/db.json`). Moderators can recategorize and remove any work, mirroring the student-group operations in your plan.
- **Categories** live in `lib/store.js` (`CATEGORIES`) — edit the list there.
- Sessions are bearer tokens kept in the browser; media requests carry the token in the URL query (`?t=…`). For a public production launch, put the app behind HTTPS.
- The Google sign-in flow is implemented end-to-end, but you must test it with your own Oberlin account before relying on it.

## Putting it online

The site is a plain Node app, so it runs on any host that runs Node. The JSON
store and uploaded files must live on a **persistent disk** — that's what the
`STORAGE_DIR` env var is for (point it at wherever your host mounts its volume;
the app puts `data/` and `uploads/` under it).

Three good options, easiest first:

**Railway** (~$5/mo, simplest)
1. Push this folder to a GitHub repo.
2. Sign up at railway.app, "New Project" → "Deploy from GitHub repo", pick the repo.
3. In Settings → Variables add `GOOGLE_CLIENT_ID` (see below) and `NODE_ENV=production`.
4. Settings → Volumes → mount a volume at `/storage`, and set `STORAGE_DIR=/storage`.
5. Settings → Networking → generate a domain (you get `something.up.railway.app`).

**Fly.io** (generous free tier, needs a credit card)
1. Install the Fly CLI, `fly auth signup`.
2. `fly launch` (say no to their Postgres — storage is the volume in fly.toml), then `fly deploy`.
3. `fly secrets set GOOGLE_CLIENT_ID=xxx` — done. You get `obvault.fly.dev`.

**Render** (blueprint included)
1. Push to GitHub. In Render: New → Blueprint, pick the repo — `render.yaml`
   sets up the service, env vars, and a persistent disk automatically.
2. Add `GOOGLE_CLIENT_ID` when prompted (it's marked sync: false).
3. Note: Render's free tier sleeps the site between visits; the ~$7 starter plan stays awake.

### Google sign-in for production

Before real students can sign in, create your OAuth credentials:
1. Go to console.cloud.google.com → create a project (any name).
2. APIs & Services → OAuth consent screen → External, fill in app name + support email.
   You do not need verification for basic Google Sign-In.
3. Credentials → Create credentials → OAuth client ID → Web application.
4. Add "Authorized JavaScript origins": `http://localhost:3000` **and** your
   live URL (e.g. `https://obvault.fly.dev`).
5. Copy the client ID into `.env` locally and into your host's env vars as
   `GOOGLE_CLIENT_ID`. Set `NODE_ENV=production` — that turns demo mode off
   (only real @oberlin.edu accounts get in).

Only accounts ending in `@oberlin.edu` are accepted, enforced server-side by
checking the hosted domain on Google's token info.

### A real domain (optional)

Any of these hosts gives you a free subdomain. For `obvault.com`-style branding,
buy a domain (~$10-15/yr at Namecheap, Cloudflare, etc.) and point it at the host
per their docs (usually one CNAME record). Add the final `https://yourdomain`
URL to the Google authorized origins too.

### When the vault outgrows JSON files

The whole data layer is one file (`lib/store.js`), so swapping the JSON store
for Postgres/SQLite later is contained to that file. The current setup is
happiest for one server, one collective, up to a few thousand works — plenty
for a college archive's first years.
