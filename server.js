// server.js — ObVault
// Express backend + static frontend. Run with: npm start  (then open localhost:3000)
//
// Authentication:
//   Real setup  — Google Sign-In verified server-side; only accounts on the
//                 oberlin.edu hosted domain (email verified) get in. Set
//                 GOOGLE_CLIENT_ID in .env (see README).
//   Demo mode   — When GOOGLE_CLIENT_ID is unset you can pick a sample account
//                 from the sign-in screen. It is clearly labeled and turns off
//                 automatically the moment you configure real sign-in.

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const store = require('./lib/store');
const { seedIfEmpty } = require('./lib/seed');

// ---- load .env if present (no dependency needed) --------------------------
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* .env is optional */ }
})();

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
// Demo sign-in is an explicit, labeled local preview tool. It is on by default
// only for local development (no NODE_ENV=production), and must be turned on
// deliberately anywhere else. It switches itself off the moment real Google
// sign-in is configured.
const DEMO_MODE = !GOOGLE_CLIENT_ID && (
  process.env.DEMO_MODE === 'on' ||
  (process.env.DEMO_MODE !== 'off' && process.env.NODE_ENV !== 'production')
);
const ALLOWED_DOMAIN = 'oberlin.edu';

// ---------------------------------------------------------------- setup ---
store.load();
seedIfEmpty();

const UPLOADS = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Only these MIME types may enter the vault, and each is stored under a
// server-derived extension — user-supplied filenames are never trusted.
const UPLOAD_TYPES = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav',
  'audio/ogg': '.ogg', 'audio/webm': '.weba', 'audio/aac': '.aac', 'audio/x-m4a': '.m4a',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'application/pdf': '.pdf'
};
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + (UPLOAD_TYPES[file.mimetype] || '.bin'))
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|gif|webp|avif)$/.test(file.mimetype); // no svg: avatars are photos
    cb(ok ? null : new Error('Profile pictures must be PNG, JPG, GIF, or WebP.'), ok);
  }
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + (UPLOAD_TYPES[file.mimetype] || '.bin'))
  }),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(UPLOAD_TYPES[file.mimetype] ? null : new Error('Unsupported file type'), !!UPLOAD_TYPES[file.mimetype]);
  }
});

// ---------------------------------------------------------------- auth ----
const SESSION_TTL_DAYS = 30;

function currentUser(req) {
  const auth = req.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const user = store.sessionUser(token);
  if (!user) return null;
  // demo tokens stop working as soon as real sign-in is configured
  const session = store.sessionInfo(token);
  if (GOOGLE_CLIENT_ID && session && session.provider === 'demo') return null;
  if (session && Date.now() - new Date(session.createdAt).getTime() > SESSION_TTL_DAYS * 864e5) {
    store.destroySession(token);
    return null;
  }
  return user;
}
function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Sign in to continue.' });
  req.user = u;
  next();
}
function requireModerator(req, res, next) {
  if (!req.user.isModerator) return res.status(403).json({ error: 'Moderators only.' });
  next();
}

function publicUser(u, viewer) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    handle: u.handle,
    bio: u.bio,
    classYear: u.classYear,
    isModerator: u.isModerator,
    avatarHue: u.avatarHue,
    avatarFile: u.avatarFile || null,
    followers: store.followerIds(u.id).length,
    following: store.followingIds(u.id).length,
    works: store.posts().filter((p) => p.userId === u.id).length,
    isFollowing: viewer ? store.isFollowing(viewer.id, u.id) : false
  };
}

function publicPost(p, viewer) {
  if (!p) return null;
  const author = store.userById(p.userId);
  return {
    ...p,
    author: publicUser(author, viewer),
    likeCount: store.likesFor(p.id).length,
    likedByMe: viewer ? store.userLiked(p.id, viewer.id) : false,
    commentCount: store.commentsFor(p.id).length,
    isMine: viewer ? viewer.id === p.userId : false
  };
}

// ---------------------------------------------------------------- routes --

app.get('/api/bootstrap', (req, res) => {
  const me = currentUser(req);
  res.json({
    me: me ? publicUser(me, me) : null,
    categories: store.CATEGORIES,
    config: {
      demoMode: DEMO_MODE,
      googleClientId: GOOGLE_CLIENT_ID
    }
  });
});

// --- demo sign-in (sample accounts only; disabled once Google is configured)
app.get('/api/demo-accounts', (req, res) => {
  if (!DEMO_MODE) return res.json({ demoMode: false, accounts: [] });
  const accounts = store.users().slice(0, 6).map((u) => ({ name: u.name, email: u.email, classYear: u.classYear }));
  res.json({ demoMode: true, accounts });
});

app.post('/api/auth/demo', (req, res) => {
  if (!DEMO_MODE) return res.status(404).json({ error: 'Demo sign-in is off.' });
  const email = String(req.body.email || '').toLowerCase();
  const u = store.userByEmail(email);
  if (!u) return res.status(404).json({ error: 'No sample account with that email.' });
  const token = store.createSession(u.id, 'demo');
  res.json({ token, user: publicUser(u, u) });
});

// --- real Google sign-in: verify the ID token server-side
app.post('/api/auth/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(404).json({ error: 'Google sign-in is not configured.' });
  try {
    const credential = String(req.body.credential || '');
    const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`).then((r) => r.json());
    if (info.error || !info.email) throw new Error('Invalid credential');
    if (info.aud !== GOOGLE_CLIENT_ID) throw new Error('Credential was not issued for this app');
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new Error('Bad issuer');
    if (String(info.email_verified) !== 'true') throw new Error('Email not verified');
    if ((info.hd || '').toLowerCase() !== ALLOWED_DOMAIN) throw new Error('Only @oberlin.edu accounts can join ObVault');
    const u = store.upsertUser({ email: info.email, name: info.name || info.email.split('@')[0] });
    const token = store.createSession(u.id, 'google');
    res.json({ token, user: publicUser(u, u) });
  } catch (e) {
    res.status(401).json({ error: e.message || 'Sign-in failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const auth = req.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) store.destroySession(token);
  res.json({ ok: true });
});

// --- profile
app.post('/api/users/me/avatar', requireAuth, avatarUpload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image first.' });
  const old = req.user.avatarFile;
  req.user.avatarFile = req.file.filename;
  store.save();
  // only remove the old file if no post in the vault still references it
  if (old && old !== req.file.filename &&
      !store.posts().some((p) => p.media && p.media.filename === old)) {
    fs.unlink(path.join(UPLOADS, old), () => {});
  }
  res.json({ ok: true, avatarFile: req.user.avatarFile });
});

app.patch('/api/users/me', requireAuth, (req, res) => {
  const { name, bio, classYear } = req.body || {};
  const u = store.updateUser(req.user.id, { name, bio, classYear });
  res.json(publicUser(u, u));
});

app.get('/api/users/:id', requireAuth, (req, res) => {
  const viewer = req.user;
  const u = store.userById(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'No such artist.' });
  const works = store.posts()
    .filter((p) => p.userId === u.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((p) => publicPost(p, viewer));
  res.json({ user: publicUser(u, viewer), works });
});

app.post('/api/users/:id/follow', requireAuth, (req, res) => {
  const target = store.userById(Number(req.params.id));
  if (!target || target.id === req.user.id) return res.status(400).json({ error: 'Cannot follow.' });
  const following = store.toggleFollow(req.user.id, target.id);
  res.json({ following, followers: store.followerIds(target.id).length });
});

// --- feed
app.get('/api/feed', requireAuth, (req, res) => {
  const viewer = currentUser(req);
  const { tab, category, tag, author, q, before } = req.query;
  let list = store.posts().slice();
  if (category && store.CATEGORIES.includes(category)) list = list.filter((p) => p.category === category);
  if (tag) list = list.filter((p) => (p.tags || []).includes(String(tag).toLowerCase()));
  if (q) {
    // search across title, description, tags, and the artist's name/handle
    const needle = String(q).toLowerCase().trim();
    if (needle) list = list.filter((p) => {
      const a = store.userById(p.userId);
      const haystack = [p.title, p.description, (p.tags || []).join(' '),
        a ? a.name + ' ' + a.handle : ''].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }
  if (tab === 'following' && viewer) {
    const ids = store.followingIds(viewer.id);
    list = list.filter((p) => ids.includes(p.userId));
  }
  if (author) list = list.filter((p) => p.userId === Number(author));
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (before) list = list.filter((p) => p.createdAt < before);
  const page = list.slice(0, 10);
  const last = page.length ? page[page.length - 1].createdAt : null;
  res.json({ posts: page.map((p) => publicPost(p, viewer)), nextBefore: last, hasMore: list.length > page.length });
});

app.get('/api/posts/:id', requireAuth, (req, res) => {
  const viewer = req.user;
  const p = store.postById(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'This work is no longer in the vault.' });
  const comments = store.commentsFor(p.id).map((c) => ({
    ...c, author: publicUser(store.userById(c.userId), viewer),
    isMine: viewer ? c.userId === viewer.id : false
  }));
  res.json({ post: publicPost(p, viewer), comments });
});

app.post('/api/posts', requireAuth, upload.single('media'), (req, res) => {
  const { title, category, description, tags, kind } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'A title helps others find your work.' });
  if (!store.CATEGORIES.includes(category)) return res.status(400).json({ error: 'Pick a category.' });
  let k = kind;
  if (req.file) {
    if (req.file.mimetype.startsWith('image/')) k = 'image';
    else if (req.file.mimetype.startsWith('audio/')) k = 'audio';
    else if (req.file.mimetype.startsWith('video/')) k = 'video';
    else if (req.file.mimetype === 'application/pdf') k = 'pdf';
  } else if (k !== 'text') {
    return res.status(400).json({ error: 'Attach a file, or choose "writing" to post text.' });
  }
  const media = req.file ? { filename: req.file.filename, mime: req.file.mimetype } : null;
  const p = store.createPost({
    userId: req.user.id,
    kind: k,
    title: String(title).trim().slice(0, 120),
    category,
    description: String(description || '').slice(0, 2000),
    tags: String(tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 6),
    media
  });
  res.status(201).json(publicPost(p, req.user));
});

app.patch('/api/posts/:id', requireAuth, (req, res) => {
  const p = store.postById(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found.' });
  if (p.userId !== req.user.id && !req.user.isModerator) return res.status(403).json({ error: 'Not yours to change.' });
  const updated = store.updatePost(p.id, req.body || {});
  res.json(publicPost(updated, req.user));
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const p = store.postById(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found.' });
  if (p.userId !== req.user.id && !req.user.isModerator) return res.status(403).json({ error: 'Not yours to remove.' });
  store.deletePost(p.id);
  if (p.media && p.media.filename) {
    fs.unlink(path.join(UPLOADS, p.media.filename), () => {});
  }
  res.json({ ok: true });
});

// --- likes & comments
app.post('/api/posts/:id/like', requireAuth, (req, res) => {
  const p = store.postById(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found.' });
  const liked = store.toggleLike(p.id, req.user.id);
  res.json({ liked, likeCount: store.likesFor(p.id).length });
});

app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const p = store.postById(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found.' });
  const body = String((req.body || {}).body || '').trim().slice(0, 600);
  if (!body) return res.status(400).json({ error: 'Write something first.' });
  const c = store.addComment(p.id, req.user.id, body);
  res.status(201).json({ ...c, author: publicUser(req.user, req.user), isMine: true });
});

app.delete('/api/comments/:id', requireAuth, (req, res) => {
  const c = store.commentById(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Not found.' });
  if (c.userId !== req.user.id && !req.user.isModerator) return res.status(403).json({ error: 'Not yours to remove.' });
  store.deleteComment(c.id);
  res.json({ ok: true });
});

// --- opportunities
app.get('/api/opportunities', requireAuth, (req, res) => {
  const viewer = req.user;
  const list = store.opportunities()
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((o) => ({
      ...o,
      author: publicUser(store.userById(o.userId), viewer),
      interestedCount: store.interestedCount(o.id),
      interestedByMe: viewer ? store.isInterested(o.id, viewer.id) : false,
      isMine: viewer ? o.userId === viewer.id : false
    }));
  res.json({ opportunities: list });
});

app.post('/api/opportunities', requireAuth, (req, res) => {
  const { title, body, type, roles, deadline, contact } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Give the call a title.' });
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'Describe what you are looking for.' });
  const o = store.createOpportunity({
    userId: req.user.id,
    title: String(title).trim().slice(0, 140),
    body: String(body).slice(0, 3000),
    type, roles, deadline, contact
  });
  res.status(201).json(o);
});

app.patch('/api/opportunities/:id', requireAuth, (req, res) => {
  const o = store.oppById(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Not found.' });
  if (o.userId !== req.user.id && !req.user.isModerator) return res.status(403).json({ error: 'Not yours.' });
  if (req.body.status) o.status = req.body.status === 'closed' ? 'closed' : 'open';
  store.save();
  res.json(o);
});

app.delete('/api/opportunities/:id', requireAuth, (req, res) => {
  const o = store.oppById(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Not found.' });
  if (o.userId !== req.user.id && !req.user.isModerator) return res.status(403).json({ error: 'Not yours.' });
  store.deleteOpportunity(o.id);
  res.json({ ok: true });
});

app.post('/api/opportunities/:id/interested', requireAuth, (req, res) => {
  const o = store.oppById(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Not found.' });
  const on = store.toggleInterested(o.id, req.user.id);
  res.json({ interested: on, count: store.interestedCount(o.id) });
});

// --- media (behind sign-in, like everything else). <img>/<audio> tags can't
// send Authorization headers, so the token may also arrive as ?t=
app.get('/uploads/:file', (req, res, next) => {
  const auth = req.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query.t || null);
  const u = token ? store.sessionUser(token) : null;
  if (!u) return res.status(401).json({ error: 'Sign in to view work from the vault.' });
  const file = path.basename(req.params.file);
  const ext = path.extname(file).toLowerCase();
  const mime = Object.keys(UPLOAD_TYPES).find((k) => UPLOAD_TYPES[k] === ext) || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', 'sandbox');
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(path.join(UPLOADS, file), (err) => { if (err && !res.headersSent) next(); });
});

app.use((err, req, res, next) => { // eslint-disable-line
  console.error('[server]', err.message);
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message || 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`\n  ObVault is running →  http://localhost:${PORT}\n`);
  if (DEMO_MODE) console.log('  (demo mode: sign in with a sample account — set GOOGLE_CLIENT_ID in .env for real Oberlin accounts)\n');
});
