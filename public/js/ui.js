// ui.js — small DOM helpers + shared components

import { api, mediaUrl } from './api.js';

// ---- basics -------------------------------------------------------------
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v; // trusted, hand-written markup only
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  if (s < 2592000) return `${Math.floor(s / 604800)}w`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function avatarSrc(user, size = 40) {
  const hue = (user && user.avatarHue) || 20;
  const initials = (user && user.name ? user.name : '?')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const sat = 30, light = 52;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="hsl(${hue}, ${sat}%, ${light}%)"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, serif" font-size="${size * 0.42}" fill="rgba(255,250,240,0.92)">${initials}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function avatar(user, size = 40) {
  // custom profile picture if the artist uploaded one, initials otherwise
  const src = user && user.avatarFile ? mediaUrl(user.avatarFile) : avatarSrc(user, size);
  return el('img', {
    src, alt: user ? user.name : '', loading: 'lazy',
    width: size, height: size, style: 'object-fit: cover'
  });
}

let toastTimer = null;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---- icons ----------------------------------------------------------------
const I = {
  heart: '<path d="M12 20.5S3.5 15.4 3.5 9.7C3.5 6.6 5.9 4.5 8.5 4.5c1.7 0 3 .8 3.5 2 .5-1.2 1.8-2 3.5-2 2.6 0 5 2.1 5 5.2 0 5.7-8.5 10.8-8.5 10.8z"/>',
  comment: '<path d="M21 12a8 8 0 0 1-8 8H4l2.5-2.5A8 8 0 1 1 21 12z"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 16V3"/><path d="M7 8l5-5 5 5"/>',
  play: '<path d="M7 5.5v13l11-6.5z"/>',
  pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'
};
export function icon(name, filled = false) {
  return el('span', { html: `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>` });
}

// ---- media renderers ---------------------------------------------------------
export function mediaBlock(post) {
  if (post.kind === 'image' && post.media) {
    return el('div', { class: 'post-media' },
      el('img', { src: mediaUrl(post.media.filename), alt: post.title, loading: 'lazy' }));
  }
  if (post.kind === 'video' && post.media) {
    return el('div', { class: 'post-media' },
      el('video', { src: mediaUrl(post.media.filename), controls: '', playsinline: '', preload: 'metadata' }));
  }
  if (post.kind === 'pdf' && post.media) return pdfPager(post);
  if (post.kind === 'audio' && post.media) return audioPlayer(post);
  // writing
  return el('div', { class: 'post-media writing' },
    el('p', { class: 'prose' }, post.description || '…'));
}

export function audioPlayer(post) {
  const peaks = (post.media && post.media.peaks) || Array.from({ length: 56 }, () => 0.5);
  const card = el('div', { class: 'post-media audio-card' });
  const audio = el('audio', { src: mediaUrl(post.media.filename), preload: 'metadata' });
  const btn = el('button', { class: 'play-btn', 'aria-label': 'Play' });
  const setIcon = () => (btn.firstChild ? btn.replaceChild(icon(audio.paused ? 'play' : 'pause'), btn.firstChild) : btn.append(icon(audio.paused ? 'play' : 'pause')));
  setIcon();
  btn.addEventListener('click', () => audio.paused ? audio.play() : audio.pause());
  audio.addEventListener('play', () => { document.querySelectorAll('audio').forEach((a) => { if (a !== audio) a.pause(); }); setIcon(); });
  audio.addEventListener('pause', setIcon);
  audio.addEventListener('ended', setIcon);

  const time = el('span', { class: 'audio-time' }, '—:—');
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const bars = peaks.map((p) => el('div', { class: 'bar', style: `height:${Math.max(6, Math.round(p * 100))}%` }));
  const wave = el('div', { class: 'waveform', role: 'slider', 'aria-label': 'Seek', tabindex: '0' }, ...bars);
  const paint = () => {
    const dur = audio.duration || 0;
    const cur = audio.currentTime || 0;
    const frac = dur ? cur / dur : 0;
    bars.forEach((b, i) => b.classList.toggle('lit', i / bars.length <= frac));
    if (dur) time.textContent = `${fmt(cur)} / ${fmt(dur)}`;
  };
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('loadedmetadata', paint);
  const seek = (e) => {
    const rect = wave.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (audio.duration) audio.currentTime = x * audio.duration;
  };
  wave.addEventListener('click', seek);
  wave.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  });

  card.append(
    audio,
    el('div', { class: 'audio-top' }, btn,
      el('div', { class: 'audio-title-block' },
        el('div', null, el('span', { class: 'cat-link' }, post.category), time))),
    wave
  );
  return card;
}


// ---- PDF pager: pages laid out horizontally, flipped through sideways -------
let pdfjsPromise = null;
function ensurePdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromise) pdfjsPromise = new Promise((resolve, reject) => {
    const script = el('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' });
    script.onload = async () => {
      try {
        // load the worker as a blob so the CDN's cross-origin URL never trips it up
        const r = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(await r.blob());
        resolve(window.pdfjsLib);
      } catch (e) { reject(e); }
    };
    script.onerror = () => reject(new Error('PDF viewer failed to load.'));
    document.head.append(script);
  });
  return pdfjsPromise;
}

export function pdfPager(post) {
  const wrap = el('div', { class: 'post-media pdf-wrap' });
  const counter = el('div', { class: 'pdf-count' }, '\u2026');
  const row = el('div', { class: 'pdf-row', role: 'region', tabindex: '0', 'aria-label': 'Read ' + post.title + ' page by page' });
  wrap.append(row, counter);

  ensurePdfJs().then(async (lib) => {
    let doc;
    try {
      doc = await lib.getDocument({ url: mediaUrl(post.media.filename) }).promise;
    } catch (e) {
      counter.remove();
      row.replaceWith(el('div', { class: 'post-desc' }, 'This document could not be opened.'));
      return;
    }
    counter.textContent = '1 / ' + doc.numPages;

    // render pages lazily, only when they scroll near the viewport of the row
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        const page = doc.getPage(Number(en.target.dataset.page)).then((p) => {
          const scale = (Math.min(row.clientWidth * 0.86, 760) / p.getViewport({ scale: 1 }).width) * 0.82;
          const vp = p.getViewport({ scale });
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const cv = en.target;
          cv.width = Math.round(vp.width * dpr);
          cv.height = Math.round(vp.height * dpr);
          cv.style.width = Math.round(vp.width) + 'px';
          cv.style.height = Math.round(vp.height) + 'px';
          p.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: dpr > 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        });
      }
    }, { root: row, rootMargin: '400px' });

    for (let i = 1; i <= doc.numPages; i++) {
      const cv = el('canvas', { class: 'pdf-page', 'data-page': String(i) });
      row.append(cv);
      io.observe(cv);
    }

    // page counter follows the page nearest the center of the row
    let t = null;
    row.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const mid = row.scrollLeft + row.clientWidth / 2;
        let best = 1, dist = Infinity;
        for (const cv of row.children) {
          const d = Math.abs(cv.offsetLeft + cv.offsetWidth / 2 - mid);
          if (d < dist) { dist = d; best = Number(cv.dataset.page); }
        }
        counter.textContent = best + ' / ' + doc.numPages;
      }, 60);
    }, { passive: true });
  });

  return wrap;
}

// ---- comments ------------------------------------------------------------------
function commentNode(post, c, me, { onCount }) {
  const node = el('div', { class: 'comment' },
    el('a', { class: 'avatar', href: `#/u/${c.author.id}` }, avatar(c.author, 26)),
    el('div', { class: 'comment-body' },
      el('b', { onclick: () => { location.hash = `#/u/${c.author.id}`; } }, c.author.name),
      c.body,
      el('span', { class: 'c-when' }, timeAgo(c.createdAt))));

  const remove = async () => {
    if (!confirm('Remove this comment?')) return;
    try {
      await api.deleteComment(c.id);
      node.remove();
      post.commentCount = Math.max(0, (post.commentCount || 1) - 1);
      onCount();
    } catch (err) { toast(err.message); }
  };
  if (me && (me.id === c.userId || me.isModerator)) {
    node.querySelector('.comment-body').append(el('button', { class: 'c-del', onclick: remove }, 'remove'));
  }
  return node;
}

function commentForm(post, { onCount }) {
  const input = el('input', { type: 'text', placeholder: 'Say something kind…', 'aria-label': 'Write a comment', maxlength: '600' });
  const form = el('form', { class: 'comment-form' }, input, el('button', { class: 'btn btn-ghost btn-small', type: 'submit' }, 'Post'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      const c = await api.addComment(post.id, body);
      form.before(commentNode(post, { ...c, author: window.OBV_ME }, window.OBV_ME, { onCount }));
      post.commentCount = (post.commentCount || 0) + 1;
      onCount();
    } catch (err) { toast(err.message); }
  });
  return form;
}

// ---- the post card ------------------------------------------------------------
export function postCard(post, { me, showTools = false, openComments = false } = {}) {
  window.OBV_ME = me || window.OBV_ME;
  const node = el('article', { class: 'post', 'data-testid': `post-${post.id}` });

  // head: avatar, name, meta
  const head = el('div', { class: 'post-head' },
    el('a', { class: 'avatar', href: `#/u/${post.author.id}` }, avatar(post.author, 38)),
    el('div', { class: 'post-by' },
      el('a', { class: 'name', href: `#/u/${post.author.id}` }, post.author.name),
      el('div', { class: 'when' }, `${post.author.classYear || ''}  ·  ${timeAgo(post.createdAt)}`)),
    el('div', { class: 'spacer' }));

  // moderator / owner tools (owners see them on the permalink, not every card)
  if (me && (me.isModerator || (post.isMine && showTools))) {
    const sel = el('select', { 'aria-label': 'Change category', onchange: async (e) => {
      try {
        await api.updatePost(post.id, { category: e.target.value });
        toast('Recategorized');
        const cat = node.querySelector('.cat-link'); if (cat) cat.textContent = e.target.value;
      } catch (err) { toast(err.message); }
    } },
      el('option', { value: post.category }, post.category),
      window.OBV_CATEGORIES.filter((c) => c !== post.category).map((c) => el('option', { value: c }, c)));
    head.append(el('div', { class: 'mod-tools' }, sel,
      el('button', {
        class: 'act', title: 'Remove work', onclick: async () => {
          if (!confirm('Take this work out of the vault?')) return;
          try { await api.deletePost(post.id); node.remove(); toast('Removed'); } catch (err) { toast(err.message); }
        }
      }, icon('trash'))));
  }

  const media = mediaBlock(post);

  const title = el('h3', { class: 'post-title' }, post.title);
  const catLink = el('a', { class: 'cat-link', href: `#/?cat=${encodeURIComponent(post.category)}` }, post.category);
  let desc = null;
  if (post.kind !== 'text' && post.description) {
    desc = el('p', { class: 'post-desc', onclick: () => desc.classList.toggle('expanded') }, post.description);
    desc.title = 'Click to expand';
  }
  const tags = post.tags && post.tags.length
    ? el('div', { class: 'post-tags' }, post.tags.map((t) => el('a', { href: `#/?tag=${encodeURIComponent(t)}` }, `#${t}`)))
    : null;

  // actions
  const likeBtn = el('button', {
    class: 'act' + (post.likedByMe ? ' liked' : ''),
    'aria-label': 'Like',
    onclick: async () => {
      if (!me) return;
      try {
        const r = await api.like(post.id);
        post.likedByMe = r.liked; post.likeCount = r.likeCount;
        likeBtn.classList.toggle('liked', r.liked);
        likeBtn.lastChild.textContent = String(r.likeCount);
      } catch (err) { toast(err.message); }
    }
  }, icon('heart', post.likedByMe), String(post.likeCount || 0));

  const commentCount = () => String(post.commentCount || 0);
  const commentBtn = el('button', {
    class: 'act', 'aria-label': 'Comments', onclick: () => toggleComments()
  }, icon('comment'), commentCount());

  const shareBtn = el('button', {
    class: 'act', 'aria-label': 'Share',
    onclick: async () => {
      const url = `${location.origin}${location.pathname}#/post/${post.id}`;
      try { await navigator.clipboard.writeText(url); toast('Link copied'); }
      catch (e) { toast(url); }
    }
  }, icon('share'), 'Share');

  const actions = el('div', { class: 'post-actions' }, likeBtn, commentBtn, shareBtn,
    el('a', { class: 'when-right', href: `#/post/${post.id}` }, timeAgo(post.createdAt)));

  const body = el('div', { class: 'post-body' }, catLink, title, desc, tags, actions);

  // ---- comments: one attached container, toggled open/closed -----------------
  let cArea = null;
  let openState = false;
  const onCount = () => { commentBtn.lastChild.textContent = commentCount(); };
  async function toggleComments(force) {
    const open = force != null ? force : !openState;
    if (open && !cArea) {
      try {
        const r = await api.post(post.id);
        cArea = el('div', { class: 'comments' });
        r.comments.forEach((c) => cArea.append(commentNode(post, c, me, { onCount })));
        cArea.append(commentForm(post, { onCount }));
        body.append(cArea);
      } catch (err) { toast(err.message); return; }
    }
    if (cArea) cArea.style.display = open ? 'block' : 'none';
    openState = open;
  }

  node.append(head, media, body);
  if (openComments) toggleComments(true);
  return node;
}
