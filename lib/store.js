// lib/store.js
// A tiny JSON-file data store. Zero native dependencies, single-process.
// Writes are serialized and atomic (temp file + rename), which is fine for a
// local deployment. For a large campus deployment, swap this module for a real
// database (Postgres/SQLite) - the rest of the code only talks to this API.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.env.STORAGE_DIR || path.join(__dirname, '..'), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  nextId: 1,
  users: [],
  posts: [],
  comments: [],
  likes: [],
  follows: [],
  opportunities: [],
  oppInterest: [],
  sessions: [],
  collections: []  // { id, userId, name, description, postIds: [], createdAt }
};

let state = null;
let writeChain = Promise.resolve();

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      ensureShape();
      return;
    } catch (e) {
      console.error('[store] db.json was corrupted, starting fresh:', e.message);
    }
  }
  state = JSON.parse(JSON.stringify(EMPTY));
  ensureShape();
}

// older data files predate collections — make sure the key exists
function ensureShape() {
  if (!Array.isArray(state.collections)) state.collections = [];
}

function save() {
  // serialize all writes through one promise chain; write atomically
  writeChain = writeChain.then(() => new Promise((resolve, reject) => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
    fs.rename(tmp, DB_FILE, (err) => (err ? reject(err) : resolve()));
  })).catch((e) => console.error('[store] save failed:', e.message));
  return writeChain;
}

function id() { return state.nextId++; }

// ---- users -------------------------------------------------------------
function users() { return state.users; }
function userById(userId) { return state.users.find((u) => u.id === userId) || null; }
function userByEmail(email) {
  return state.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
}
function upsertUser({ email, name, handle, classYear, isModerator }) {
  let u = userByEmail(email);
  if (u) return u;
  u = {
    id: id(),
    email,
    name: name || email.split('@')[0],
    handle: handle || email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, ''),
    bio: '',
    classYear: classYear || '',
    isModerator: !!isModerator,
    avatarHue: Math.floor(Math.random() * 360),
    createdAt: new Date().toISOString()
  };
  state.users.push(u);
  save();
  return u;
}
function updateUser(userId, patch) {
  const u = userById(userId);
  if (!u) return null;
  if (patch.name != null) u.name = patch.name;
  if (patch.bio != null) u.bio = patch.bio;
  if (patch.classYear != null) u.classYear = patch.classYear;
  save();
  return u;
}

// ---- sessions ----------------------------------------------------------
const crypto = require('crypto');
function createSession(userId, provider = 'google') {
  const token = crypto.randomBytes(24).toString('hex');
  state.sessions.push({ token, userId, provider, createdAt: new Date().toISOString() });
  save();
  return token;
}
function sessionInfo(token) { return state.sessions.find((x) => x.token === token) || null; }
function sessionUser(token) {
  const s = state.sessions.find((x) => x.token === token);
  return s ? userById(s.userId) : null;
}
function destroySession(token) {
  state.sessions = state.sessions.filter((x) => x.token !== token);
  save();
}

// ---- posts --------------------------------------------------------------
function posts() { return state.posts; }
function postById(postId) { return state.posts.find((p) => p.id === postId) || null; }
function createPost(data) {
  const p = {
    id: id(),
    userId: data.userId,
    kind: data.kind, // image | audio | video | text
    title: data.title,
    category: data.category,
    description: data.description || '',
    tags: data.tags || [],
    media: data.media || null, // { filename, mime, width, height, peaks }
    createdAt: data.createdAt || new Date().toISOString()
  };
  state.posts.push(p);
  save();
  return p;
}
function updatePost(postId, patch, patcher) {
  const p = postById(postId);
  if (!p) return null;
  if (patch.category && CATEGORIES.includes(patch.category)) p.category = patch.category;
  if (patch.title != null && patch.title.trim()) p.title = patch.title.trim();
  if (patch.description != null) p.description = patch.description;
  save();
  return p;
}
function deletePost(postId) {
  const p = postById(postId);
  state.posts = state.posts.filter((x) => x.id !== postId);
  state.comments = state.comments.filter((c) => c.postId !== postId);
  state.likes = state.likes.filter((l) => l.postId !== postId);
  for (const col of state.collections) {
    if (col.postIds.includes(postId)) col.postIds = col.postIds.filter((id2) => id2 !== postId);
  }
  save();
  return p; // caller deletes the media file
}

// ---- collections --------------------------------------------------------
function createCollection(userId, name, description) {
  const c = {
    id: id(),
    userId,
    name: String(name).trim().slice(0, 80),
    description: String(description || '').trim().slice(0, 300),
    postIds: [],
    createdAt: new Date().toISOString()
  };
  state.collections.push(c);
  save();
  return c;
}
function collectionsFor(userId) { return state.collections.filter((c) => c.userId === userId); }
function collectionById(cid) { return state.collections.find((c) => c.id === cid) || null; }
function updateCollection(cid, patch) {
  const c = collectionById(cid);
  if (!c) return null;
  if (patch.name != null && String(patch.name).trim()) c.name = String(patch.name).trim().slice(0, 80);
  if (patch.description != null) c.description = String(patch.description).trim().slice(0, 300);
  save();
  return c;
}
function deleteCollection(cid) {
  const c = collectionById(cid);
  state.collections = state.collections.filter((x) => x.id !== cid);
  save();
  return c;
}
function addToCollection(cid, postId) {
  const c = collectionById(cid);
  if (!c || c.postIds.includes(postId)) return c;
  c.postIds.push(postId);
  save();
  return c;
}
function removeFromCollection(cid, postId) {
  const c = collectionById(cid);
  if (!c) return c;
  c.postIds = c.postIds.filter((p) => p !== postId);
  save();
  return c;
}
function collectionsForPost(postId) { return state.collections.filter((c) => c.postIds.includes(postId)); }

// ---- comments / likes / follows ----------------------------------------
function commentsFor(postId) {
  return state.comments.filter((c) => c.postId === postId).sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
}
function addComment(postId, userId, body) {
  const c = { id: id(), postId, userId, body, createdAt: new Date().toISOString() };
  state.comments.push(c);
  save();
  return c;
}
function deleteComment(commentId) {
  const c = state.comments.find((x) => x.id === commentId);
  state.comments = state.comments.filter((x) => x.id !== commentId);
  save();
  return c;
}
function commentById(cid) { return state.comments.find((c) => c.id === cid) || null; }
function toggleLike(postId, userId) {
  const existing = state.likes.find((l) => l.postId === postId && l.userId === userId);
  if (existing) {
    state.likes = state.likes.filter((l) => l !== existing);
    save();
    return false;
  }
  state.likes.push({ postId, userId, createdAt: new Date().toISOString() });
  save();
  return true;
}
function likesFor(postId) { return state.likes.filter((l) => l.postId === postId); }
function userLiked(postId, userId) {
  return state.likes.some((l) => l.postId === postId && l.userId === userId);
}
function toggleFollow(followerId, followeeId) {
  const existing = state.follows.find((f) => f.followerId === followerId && f.followeeId === followeeId);
  if (existing) {
    state.follows = state.follows.filter((f) => f !== existing);
    save();
    return false;
  }
  state.follows.push({ followerId, followeeId, createdAt: new Date().toISOString() });
  save();
  return true;
}
function isFollowing(followerId, followeeId) {
  return state.follows.some((f) => f.followerId === followerId && f.followeeId === followeeId);
}
function followerIds(userId) { return state.follows.filter((f) => f.followeeId === userId).map((f) => f.followerId); }
function followingIds(userId) { return state.follows.filter((f) => f.followerId === userId).map((f) => f.followeeId); }

// ---- opportunities ------------------------------------------------------
const OPP_TYPES = ['casting', 'collaboration', 'exhibition', 'employment', 'other'];
function opportunities() { return state.opportunities; }
function oppById(oppId) { return state.opportunities.find((o) => o.id === oppId) || null; }
function createOpportunity(data) {
  const o = {
    id: id(),
    userId: data.userId,
    title: data.title,
    body: data.body,
    type: OPP_TYPES.includes(data.type) ? data.type : 'other',
    roles: (Array.isArray(data.roles)
      ? data.roles
      : String(data.roles || '').split(',')).map((r) => String(r).trim()).filter(Boolean).slice(0, 8),
    deadline: data.deadline || '',
    contact: data.contact || '',
    status: 'open',
    createdAt: new Date().toISOString()
  };
  state.opportunities.push(o);
  save();
  return o;
}
function deleteOpportunity(oppId) {
  const o = oppById(oppId);
  state.opportunities = state.opportunities.filter((x) => x.id !== oppId);
  state.oppInterest = state.oppInterest.filter((x) => x.oppId !== oppId);
  save();
  return o;
}
function toggleInterested(oppId, userId) {
  const existing = state.oppInterest.find((x) => x.oppId === oppId && x.userId === userId);
  if (existing) {
    state.oppInterest = state.oppInterest.filter((x) => x !== existing);
    save();
    return false;
  }
  state.oppInterest.push({ oppId, userId });
  save();
  return true;
}
function interestedCount(oppId) { return state.oppInterest.filter((x) => x.oppId === oppId).length; }
function isInterested(oppId, userId) { return state.oppInterest.some((x) => x.oppId === oppId && x.userId === userId); }

const CATEGORIES = [
  'Photography', 'Film & Video', 'Music', 'Sound & Audio Art', 'Prose', 'Poetry',
  'Theater & Plays', 'Painting', 'Drawing', 'Illustration', 'Printmaking',
  'Sculpture', 'Dance', 'Design', 'Textiles', 'Other'
];

module.exports = {
  load, save, id,
  users, userById, userByEmail, upsertUser, updateUser,
  createSession, sessionInfo, sessionUser, destroySession,
  posts, postById, createPost, updatePost, deletePost,
  commentsFor, addComment, deleteComment, commentById,
  toggleLike, likesFor, userLiked,
  toggleFollow, isFollowing, followerIds, followingIds,
  opportunities, oppById, createOpportunity, deleteOpportunity,
  toggleInterested, interestedCount, isInterested,
  createCollection, collectionsFor, collectionById, updateCollection, deleteCollection,
  addToCollection, removeFromCollection, collectionsForPost,
  CATEGORIES, OPP_TYPES, EMPTY, DB_FILE
};
