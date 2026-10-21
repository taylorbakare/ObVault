// main.js — shell: bootstrap, hash router, drawer, theme

import { api, setToken } from './api.js';
import { el, avatar, toast } from './ui.js';
import { gateView, feedView, postView, profileView, profileEditView, opportunitiesView, composeView, archiveView, collectionView } from './views.js';

const state = { me: null, categories: [], config: {} };

// ---- drawer ----------------------------------------------------------------
const drawer = document.getElementById('drawer');
const scrim = document.getElementById('scrim');
function openDrawer() { drawer.classList.add('open'); scrim.classList.add('show'); drawer.setAttribute('aria-hidden', 'false'); }
function closeDrawer() { drawer.classList.remove('open'); scrim.classList.remove('show'); drawer.setAttribute('aria-hidden', 'true'); }
document.getElementById('menuBtn').addEventListener('click', openDrawer);
drawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeDrawer));
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
scrim.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

// ---- theme -------------------------------------------------------------------
const themeBtn = document.getElementById('themeBtn');
function applyThemeIcon() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  themeBtn.innerHTML = dark
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 13.5A8 8 0 1 1 10.5 4 6.5 6.5 0 0 0 20 13.5z"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/></svg>';
  themeBtn.setAttribute('aria-label', 'Switch to ' + (dark ? 'light' : 'dark') + ' mode');
}
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { document.cookie = 'obv-theme=' + next + '; max-age=2592000; path=/; SameSite=Lax'; } catch (e) { /* sandboxed */ }
  applyThemeIcon();
});
applyThemeIcon();

// ---- sign out --------------------------------------------------------------------
document.getElementById('signOutBtn').addEventListener('click', async () => {
  try { await api.logout(); } catch (e) { /* session already gone */ }
  setToken(null);
  location.hash = '#/';
  location.reload();
});

// ---- router ---------------------------------------------------------------------
async function route() {
  const view = document.getElementById('view');
  const raw = location.hash.slice(1) || '/';
  const [path, query] = raw.split('?');
  const params = new URLSearchParams(query || '');

  // every route requires signing in — the vault is members-only
  if (!state.me) {
    view.textContent = '';
    view.append(await gateView(state));
    return;
  }

  let m;
  let node = null;
  try {
    if (path === '/' || path === '') {
      node = await feedView(state, {
        cat: params.get('cat') || '',
        tab: params.get('tab') || '',
        tag: params.get('tag') || ''
      });
    } else if ((m = path.match(/^\/post\/(\d+)$/))) {
      node = await postView(state, Number(m[1]));
    } else if (path === '/me/edit') {
      node = await profileEditView(state);
    } else if ((m = path.match(/^\/(?:u\/)?(me|\d+)$/))) {
      node = await profileView(state, m[1]);
    } else if ((m = path.match(/^\/c\/(\d+)$/))) {
      node = await collectionView(state, Number(m[1]));
    } else if (path === '/archive') {
      node = await archiveView(state, { q: params.get('q') || '' });
    } else if (path === '/opportunities') {
      node = await opportunitiesView(state);
    } else if (path === '/new') {
      node = await composeView(state);
    }
  } catch (err) {
    node = el('div', { class: 'empty' }, el('div', { class: 'e-sub' }, err.message));
  }

  view.textContent = '';
  if (!node) {
    node = el('div', { class: 'empty' },
      el('div', { class: 'e-mark' }, 'Lost in the stacks'),
      el('div', { class: 'e-sub' }, 'There\u2019s nothing at this address.'),
      el('a', { class: 'backlink', href: '#/' }, 'back to the feed'));
  }
  view.append(node);
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', route);
window.addEventListener('obv:refresh', async () => { await boot(); });

// ---- drawer category links --------------------------------------------------------
function fillDrawer() {
  const cats = document.getElementById('drawerCats');
  cats.textContent = '';
  window.OBV_CATEGORIES.forEach((c) => {
    cats.append(el('a', { href: `#/?cat=${encodeURIComponent(c)}` }, c));
  });
}

// ---- bootstrap --------------------------------------------------------------------
async function boot() {
  try {
    const b = await api.bootstrap();
    state.me = b.me;
    state.config = b.config;
    window.OBV_CATEGORIES = b.categories;
    fillDrawer();

    const meAvatar = document.getElementById('meAvatar');
    if (state.me) {
      meAvatar.hidden = false;
      meAvatar.textContent = '';
      meAvatar.append(avatar(state.me, 34));
    }
    route();
  } catch (err) {
    toast('Could not reach the vault — is the server running?');
    document.getElementById('view').append(
      el('div', { class: 'empty' }, el('div', { class: 'e-sub' }, err.message)));
  }
}
boot();
