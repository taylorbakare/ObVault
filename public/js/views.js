// views.js — page renderers. Each returns a DOM node for #view.

import { api, setToken, mediaUrl } from './api.js';
import { el, avatar, toast, icon, postCard, timeAgo } from './ui.js';

// ---- sign-in gate -----------------------------------------------------------
export async function gateView(state) {
  const demo = state.config.demoMode ? await api.demoAccounts() : { accounts: [] };
  const box = el('div', { class: 'gate-box' });

  if (state.config.googleClientId) {
    // real Google sign-in (only @oberlin.edu accounts pass server checks)
    const label = el('div', { class: 'label' }, 'Sign in with your Oberlin account');
    const btnWrap = el('div', { id: 'gsi-here' });
    box.append(label, btnWrap);
    const init = () => {
      if (!window.google) {
        const script = el('script', { src: 'https://accounts.google.com/gsi/client', async: '', onload: init, onerror: () => {
          btnWrap.append(el('p', { class: 'gate-demo-note' }, 'Google\u2019s sign-in script failed to load \u2014 check your connection.'));
        } });
        document.head.append(script);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: state.config.googleClientId,
        callback: async (r) => {
          try {
            const res = await api.googleLogin(r.credential);
            setToken(res.token);
            location.hash = '#/';
            location.reload();
          } catch (err) { toast(err.message); }
        }
      });
      window.google.accounts.id.renderButton(btnWrap, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', logo_alignment: 'center' });
    };
    init();
  } else if (demo.accounts.length) {
    box.append(
      el('div', { class: 'label' }, 'Preview with a sample account'),
      el('div', { class: 'demo-accs' },
        demo.accounts.map((a) => el('button', {
          class: 'demo-acc',
          onclick: async () => {
            try {
              const res = await api.demoLogin(a.email);
              setToken(res.token);
              window.dispatchEvent(new Event('obv:refresh'));
            } catch (err) { toast(err.message); }
          }
        },
          el('span', { class: 'avatar' }, avatar(a, 34)),
          el('span', { class: 'da-name' }, a.name),
          el('span', { class: 'da-year' }, a.classYear || '')))));
  }

  return el('div', { class: 'gate' },
    el('div', { class: 'gate-mark' }, 'Ob', el('span', { class: 'wm-accent' }, 'Vault')),
    el('p', { class: 'gate-tag' }, 'The student art archive. A quiet feed of work by Oberlin students and alumni — film, prose, prints, sound, and everything made in between.'),
    el('p', { class: 'gate-note' }, 'open to @oberlin.edu accounts'),
    box,
    demo.accounts.length ? el('p', { class: 'gate-demo-note' }, 'Demo mode: these are sample accounts for previewing. To open the vault to real Oberlin Google accounts, set GOOGLE_CLIENT_ID in your .env (see README) — demo sign-in switches itself off automatically.') : null
  );
}

// ---- feed -----------------------------------------------------------------------
export async function feedView(state, params) {
  const view = el('div');
  view.append(el('div', { class: 'wide' },
    el('h1', { class: 'page-title' }, 'The Feed'),
    el('p', { class: 'page-sub' }, 'Daily Oberlin Artistry Reel')));

  // const view = el('div');
  const tabs = el('div', { class: 'feed-tabs' },
    el('a', { class: 'tab' + (params.tab !== 'following' ? ' active' : ''), href: catHref(params.cat, null) }, 'Latest'),
    el('a', { class: 'tab' + (params.tab === 'following' ? ' active' : ''), href: catHref(params.cat, 'following') }, 'Following'));

  const chips = el('div', { class: 'chiprow' },
    el('a', { class: 'chip' + (params.cat ? '' : ' active'), href: tabHref(null, params.tab) }, 'All'),
    window.OBV_CATEGORIES.map((c) => el('a', {
      class: 'chip' + (params.cat === c ? ' active' : ''),
      href: tabHref(c, params.tab)
    }, c)));

  const col = el('div', { class: 'feed-col' });
  const list = el('div', { class: 'post-list' });
  const sentinel = el('div', { style: 'height:1px' });
  list.append(sentinel);
  col.append(tabs, chips, list);
  view.append(col);

  let before = null, done = false;
  const load = async () => {
    if (done) return;
    const spinner = el('div', { class: 'loading' }, el('span', { class: 'dot' }), el('span', { class: 'dot' }), el('span', { class: 'dot' }));
    list.insertBefore(spinner, sentinel);
    try {
      const q = new URLSearchParams();
      if (params.cat) q.set('category', params.cat);
      if (params.tab === 'following') q.set('tab', 'following');
      if (params.tag) q.set('tag', params.tag);
      if (before) q.set('before', before);
      const r = await api.feed('?' + q.toString());
      spinner.remove();
      if (!r.posts.length && !before) {
        list.insertBefore(el('div', { class: 'empty' },
          el('div', { class: 'e-mark' }, params.tab === 'following' ? 'Follow some artists first' : (params.tag ? ('Nothing tagged #' + params.tag) : 'The shelf is empty')),
          el('div', { class: 'e-sub' }, params.tab === 'following' ? 'Works from artists you follow will appear here.' : 'Be the first to add something.')), sentinel);
      }
      r.posts.forEach((p) => list.insertBefore(postCard(p, { me: state.me }), sentinel));
      before = r.nextBefore;
      done = !r.hasMore;
      if (done && r.posts.length) list.insertBefore(el('div', { class: 'feed-end' }, '\u00b7 that\u2019s everything, for now \u00b7'), sentinel);
    } catch (err) {
      spinner.remove();
      list.insertBefore(el('div', { class: 'empty' }, el('div', { class: 'e-sub' }, err.message)), sentinel);
    }
  };
  load();
  const sent = new IntersectionObserver((es) => { if (es[0].isIntersecting) load(); }, { rootMargin: '400px' });
  sent.observe(sentinel);
  return view;
}

function catHref(cat, tab) { return `#/?cat=${cat ? encodeURIComponent(cat) : ''}${tab ? `&tab=${tab}` : ''}`; }
function tabHref(cat, tab) { return catHref(cat, tab); }

// ---- one work (permalink) ----------------------------------------------------------
export async function postView(state, id) {
  const wrap = el('div');
  try {
    const { post, comments } = await api.post(id);
    const back = el('a', { class: 'backlink', href: '#/' }, icon('back'), 'back to the feed');
    const card = postCard(post, { me: state.me, showTools: true, openComments: true });
    wrap.append(back, card);
    // curate your own work into collections right from the permalink
    if (state.me && post.isMine) {
      const panel = el('div', { class: 'coll-picker' });
      const toggle = el('button', { class: 'coll-picker-btn' }, icon('stack'), 'Collections');
      const body = el('div', { class: 'coll-picker-body', style: 'display:none' });
      let loaded = false;
      const loadPanel = async () => {
        if (loaded) return; loaded = true;
        const mine = (await api.user(state.me.id)).collections;
        const list = el('div', null);
        const draw = (cols) => {
          list.textContent = '';
          cols.forEach((c) => {
            const inIt = (post.collections || []).some((x) => x.id === c.id);
            const b = el('button', { type: 'button', class: 'coll-pick-row' + (inIt ? ' in' : '') },
              el('span', { class: 'coll-pick-mark' }, inIt ? '\u2713' : ''), c.name,
              el('span', { class: 'coll-pick-count' }, c.postIds.length));
            b.addEventListener('click', async () => {
              try {
                if (inIt) { await api.removeFromCollection(c.id, post.id); toast('Removed from ' + c.name); }
                else { await api.addToCollection(c.id, post.id); toast('Added to ' + c.name); }
                post.collections = post.collections || [];
                post.collections = inIt ? post.collections.filter((x) => x.id !== c.id) : [...post.collections, { id: c.id, name: c.name }];
                draw(cols.map((x) => x.id === c.id ? { ...x, postIds: x.postIds + (inIt ? -1 : 1) } : x));
                // redraw the chips on the post card itself
                const oldRow = card.querySelector('.coll-row');
                const newRow = post.collections && post.collections.length
                  ? el('div', { class: 'coll-row' }, post.collections.map((x) =>
                      el('a', { class: 'coll-chip', href: `#/c/${x.id}`, title: 'Part of ' + x.name }, icon('stack'), x.name)))
                  : null;
                if (oldRow) oldRow.replaceWith(newRow || el('span'));
                else if (newRow) card.querySelector('.post-actions').before(newRow);
              } catch (err) { toast(err.message); }
            });
            list.append(b);
          });
        };
        draw(mine);
        const nameInput = el('input', { type: 'text', placeholder: 'New collection name', maxlength: '80', 'aria-label': 'New collection name' });
        const newForm = el('form', { class: 'coll-new-inline' }, nameInput, el('button', { class: 'btn btn-accent btn-small', type: 'submit' }, 'Create'));
        newForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!nameInput.value.trim()) return;
          try {
            const c = await api.createCollection({ name: nameInput.value });
            await api.addToCollection(c.id, post.id);
            post.collections = [...(post.collections || []), { id: c.id, name: c.name }];
            toast('Created and added');
            loaded = false; body.textContent = ''; loadPanel().then(() => {});
          } catch (err) { toast(err.message); }
        });
        body.append(el('div', { class: 'coll-picker-label' }, 'Your collections'), list, newForm);
      };
      toggle.addEventListener('click', async () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        toggle.classList.toggle('open', !open);
        if (!open) await loadPanel();
      });
      panel.append(toggle, body);
      wrap.append(panel);
    }
  } catch (err) {
    wrap.append(el('div', { class: 'empty' },
      el('div', { class: 'e-mark' }, 'This work has left the vault'),
      el('div', { class: 'e-sub' }, err.message),
      el('a', { class: 'backlink', href: '#/' }, icon('back'), 'back to the feed')));
  }
  return wrap;
}


// ---- archive (search) ------------------------------------------------------------
export async function archiveView(state, params) {
  const wrap = el('div', { class: 'wide' });
  wrap.append(
    el('h1', { class: 'page-title' }, 'The Archive'),
    el('p', { class: 'page-sub' }, 'Every work kept in the vault — search by artist, title, or description.'));

  const input = el('input', {
    type: 'text', class: 'archive-input', value: params.q || '',
    placeholder: 'e.g. riso, Maya, thesis, tape…', 'aria-label': 'Search the archive'
  });
  const count = el('p', { class: 'archive-count' });
  const grid = el('div', { class: 'works-grid' });
  const spinner = el('div', { class: 'loading' }, el('span', { class: 'dot' }), el('span', { class: 'dot' }), el('span', { class: 'dot' }));
  wrap.append(input, count, grid);

  let timer = null;
  let seq = 0;
  async function run() {
    const q = input.value.trim();
    const mine = ++seq;
    grid.append(spinner);
    try {
      const r = await api.feed('?q=' + encodeURIComponent(q));
      if (mine !== seq) return; // a newer search superseded this one
      spinner.remove();
      grid.textContent = '';
      count.textContent = r.posts.length
        ? r.posts.length + (r.posts.length === 1 ? ' work' : ' works')
        : '';
      if (!r.posts.length && q) {
        grid.append(el('div', { class: 'empty', style: 'grid-column: 1 / -1' },
          el('div', { class: 'e-mark' }, 'Nothing in the stacks for \u201c' + q + '\u201d'),
          el('div', { class: 'e-sub' }, 'Try a different spelling, or a broader word.')));
        return;
      }
      r.posts.forEach((p) => {
        const thumb = p.kind === 'image' && p.media
          ? el('img', { src: mediaUrl(p.media.filename), alt: p.title, loading: 'lazy' })
          : el('div', { class: 'txt' }, p.title);
        grid.append(el('a', { class: 'arch-item', href: '#/post/' + p.id },
          el('div', { class: 'work' }, thumb),
          el('div', { class: 'arch-cap' },
            el('span', null, p.title),
            el('span', { class: 'arch-cap-sub' }, p.author.name + (p.author.classYear ? ' ' + p.author.classYear : '')))));
      });
    } catch (err) {
      if (mine === seq) { spinner.remove(); count.textContent = ''; toast(err.message); }
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      const q = input.value.trim();
      location.hash = q ? '#/archive?q=' + encodeURIComponent(q) : '#/archive';
    }
  });
  run();
  setTimeout(() => input.focus(), 50);
  return wrap;
}

// ---- profile ---------------------------------------------------------------------
export async function profileView(state, id) {
  const wrap = el('div', { class: 'wide' });
  const isMe = state.me && (String(id) === 'me' || Number(id) === state.me.id);
  try {
    const { user, works, collections } = await api.user(isMe ? state.me.id : id);
    const followBtn = !isMe && state.me
      ? (() => {
        const b = el('button', { class: 'btn ' + (user.isFollowing ? 'btn-outline' : 'btn-accent') }, user.isFollowing ? 'Following' : 'Follow');
        b.addEventListener('click', async () => {
          const r = await api.follow(user.id);
          b.textContent = r.following ? 'Following' : 'Follow';
          b.className = 'btn ' + (r.following ? 'btn-outline' : 'btn-accent');
          wrap.querySelector('[data-followers]').textContent = `${r.followers} followers`;
        });
        return b;
      })()
      : null;

    const editBtn = isMe ? el('a', { class: 'btn btn-outline', href: '#/me/edit' }, 'Edit profile') : null;

    wrap.append(el('div', { class: 'profile-head' },
      el('div', { class: 'profile-top' },
        el('span', { class: 'avatar' }, avatar(user, 84)),
        el('div', null,
          el('div', { class: 'profile-name' }, user.name),
          el('div', { class: 'profile-meta' }, `${user.classYear || ''}${user.isModerator ? ' \u00b7 vault keeper' : ''}  \u00b7  @${user.handle}`)),
        el('div', { class: 'profile-actions' }, followBtn, editBtn)),
      user.bio ? el('p', { class: 'profile-bio' }, user.bio) : null,
      el('div', { class: 'profile-stats' },
        el('div', null, el('b', null, String(works.length)), ' works'),
        el('div', { 'data-followers': '' }, el('b', null, String(user.followers)), ' followers'),
        el('div', null, el('b', null, String(user.following)), ' following'),
        el('div', { 'data-coll-stat': '' }, el('b', null, String(collections.length)), collections.length === 1 ? ' collection' : ' collections'))));

    // ---- collections ------------------------------------------------------
    const collSection = el('div', { class: 'coll-section' });
    const collGrid = el('div', { class: 'coll-grid' });
    const redrawCollections = async () => {
      const fresh = (await api.user(isMe ? state.me.id : id)).collections;
      const stat = wrap.querySelector('[data-coll-stat]');
      if (stat) {
        stat.textContent = '';
        stat.append(el('b', null, String(fresh.length)), fresh.length === 1 ? ' collection' : ' collections');
      }
      collGrid.textContent = '';
      for (const c of fresh) {
        const firstPost = works.find((w) => w.id === c.postIds[0]);
        const cover = firstPost && firstPost.kind === 'image' && firstPost.media
          ? el('img', { src: mediaUrl(firstPost.media.filename), alt: '', loading: 'lazy' })
          : el('div', { class: 'coll-cover-txt' }, c.name.slice(0, 1));
        collGrid.append(el('a', { class: 'coll-card', href: `#/c/${c.id}` },
          el('div', { class: 'coll-cover' }, cover),
          el('div', { class: 'coll-card-name' }, c.name),
          el('div', { class: 'coll-card-count' }, c.postIds.length + (c.postIds.length === 1 ? ' work' : ' works'))));
      }
      if (isMe) collGrid.append(newCollectionCard());
    };
    const newCollectionCard = () => {
      const btn = el('button', { class: 'coll-card coll-new' }, '+ new collection');
      btn.addEventListener('click', () => {
        const name = el('input', { type: 'text', placeholder: 'Collection name', maxlength: '80', 'aria-label': 'Collection name' });
        const desc = el('input', { type: 'text', placeholder: 'A line about it (optional)', maxlength: '300', 'aria-label': 'Collection description' });
        const form = el('form', { class: 'coll-new-form' },
          name, desc,
          el('div', { class: 'coll-new-actions' },
            el('button', { class: 'btn btn-accent btn-small', type: 'submit' }, 'Create'),
            el('button', { class: 'btn btn-ghost btn-small', type: 'button' }, 'Cancel')));
        const card = el('div', { class: 'coll-card coll-new-form-card' }, form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!name.value.trim()) return;
          try {
            await api.createCollection({ name: name.value, description: desc.value });
            toast('Collection created');
            redrawCollections();
          } catch (err) { toast(err.message); }
        });
        form.querySelector('.btn-ghost').addEventListener('click', () => card.replaceWith(btn));
        btn.replaceWith(card);
        name.focus();
      });
      return btn;
    };
    collSection.append(el('div', { class: 'section-label' }, 'Collections'), collGrid);
    wrap.append(collSection);
    redrawCollections();

    // ---- works ------------------------------------------------------------
    wrap.append(el('div', { class: 'section-label' }, 'Works'));
    if (!works.length) {
      wrap.append(el('div', { class: 'empty' },
        el('div', { class: 'e-mark' }, 'Nothing in the vault yet'),
        el('div', { class: 'e-sub' }, isMe ? 'Your first work goes here.' : '')));
      return wrap;
    }
    const grid = el('div', { class: 'works-grid' });
    works.forEach((p) => {
      const thumb = p.kind === 'image' && p.media
        ? el('img', { src: mediaUrl(p.media.filename), alt: p.title, loading: 'lazy' })
        : el('div', { class: 'txt' }, p.title);
      grid.append(el('a', { class: 'work', href: `#/post/${p.id}`, title: p.title }, thumb,
        el('div', { class: 'work-cap' }, p.title)));
    });
    wrap.append(grid);
  } catch (err) {
    wrap.append(el('div', { class: 'empty' }, el('div', { class: 'e-sub' }, err.message)));
  }
  return wrap;
}

// ---- profile edit -------------------------------------------------------------------

// ---- one collection ------------------------------------------------------------
export async function collectionView(state, id) {
  const wrap = el('div', { class: 'wide' });
  try {
    const r = await api.collection(id);
    const { collection, owner, posts, isMine } = r;
    const back = el('a', { class: 'backlink', href: `#/u/${owner.id}` }, icon('back'), 'back to ' + owner.name);

    const head = el('div', { class: 'coll-head' },
      el('div', { class: 'coll-title-block' },
        el('h1', { class: 'page-title' }, collection.name),
        collection.description ? el('p', { class: 'page-sub' }, collection.description) : null,
        el('div', { class: 'coll-meta' },
          el('a', { class: 'coll-owner', href: `#/u/${owner.id}` }, avatar(owner, 22), owner.name),
          el('span', { class: 'coll-count' }, posts.length + (posts.length === 1 ? ' work' : ' works')))),
      isMine ? el('div', { class: 'coll-actions' },
        el('button', {
          class: 'btn btn-outline btn-small', onclick: async () => {
            const name = prompt('Rename collection', collection.name);
            if (!name || !name.trim()) return;
            try { await api.updateCollection(collection.id, { name }); window.dispatchEvent(new Event('obv:refresh')); }
            catch (err) { toast(err.message); }
          }
        }, 'Rename'),
        el('button', {
          class: 'btn btn-outline btn-small', onclick: async () => {
            if (!confirm('Remove this collection? The works stay in the vault.')) return;
            try { await api.deleteCollection(collection.id); location.hash = `#/u/${owner.id}`; }
            catch (err) { toast(err.message); }
          }
        }, 'Delete')) : null);

    wrap.append(back, head);
    if (!posts.length) {
      wrap.append(el('div', { class: 'empty' },
        el('div', { class: 'e-mark' }, 'This collection is waiting'),
        el('div', { class: 'e-sub' }, isMine ? 'Add work from any of your posts.' : '')));
      return wrap;
    }
    const grid = el('div', { class: 'works-grid' });
    for (const p of posts) {
      const thumb = p.kind === 'image' && p.media
        ? el('img', { src: mediaUrl(p.media.filename), alt: p.title, loading: 'lazy' })
        : el('div', { class: 'txt' }, p.title);
      const item = el('div', { class: 'coll-item-grid' },
        el('a', { class: 'work', href: `#/post/${p.id}`, title: p.title }, thumb));
      if (isMine) {
        item.append(el('button', {
          class: 'coll-remove', title: 'Remove from this collection',
          onclick: async (e) => {
            e.preventDefault();
            try {
              await api.removeFromCollection(collection.id, p.id);
              item.remove();
              const count = wrap.querySelector('.coll-count');
              if (count) count.textContent = String(posts.length - 1) + (posts.length - 1 === 1 ? ' work' : ' works');
            } catch (err) { toast(err.message); }
          }
        }, '\u00d7'));
      }
      grid.append(item);
    }
    wrap.append(grid);
  } catch (err) {
    wrap.append(el('div', { class: 'empty' },
      el('div', { class: 'e-mark' }, 'That collection has left the vault'),
      el('a', { class: 'backlink', href: '#/' }, icon('back'), 'back to the feed')));
  }
  return wrap;
}
export async function profileEditView(state) {
  if (!state.me) return el('div');
  // profile picture picker — uploads immediately, preview swaps in place
  const picPreview = el('span', { class: 'avatar avatar-edit' }, avatar(state.me, 72));
  const picInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/avif', style: 'display:none' });
  const picBtn = el('button', { type: 'button', class: 'btn btn-outline btn-small' }, 'Choose image');
  picBtn.addEventListener('click', () => picInput.click());
  picInput.addEventListener('change', async () => {
    const file = picInput.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('Keep it under 8 MB.'); return; }
    picPreview.innerHTML = '';
    picPreview.append(el('img', { src: URL.createObjectURL(file), alt: 'New profile picture', style: 'object-fit: cover', width: 72, height: 72 }));
    const fd = new FormData();
    fd.set('media', file);
    try {
      const r = await api.uploadAvatar(fd);
      state.me.avatarFile = r.avatarFile;
      toast('Picture updated');
    } catch (err) { toast(err.message); }
  });
  const picField = el('div', { class: 'field' },
    el('label', null, 'Profile picture'),
    el('div', { class: 'pic-row' }, picPreview, el('div', { class: 'pic-hint' },
      picBtn,
      el('span', { class: 'pic-note' }, 'Shown beside your work in the feed.')),
    picInput));

  const f = el('form', { class: 'form' },
    el('h1', null, 'Your profile'),
    el('p', { class: 'sub' }, 'How the vault sees you.'),
    picField,
    field('Name', el('input', { type: 'text', name: 'name', value: state.me.name || '' })),
    field('Class year', el('input', { type: 'text', name: 'classYear', value: state.me.classYear || '', placeholder: "'27" })),
    field('Bio', el('textarea', { name: 'bio', placeholder: 'What you make, and why. Or just your medium and a mood.' }, state.me.bio || '')),
    el('div', { class: 'form-actions' },
      el('button', { class: 'btn btn-accent', type: 'submit' }, 'Save'),
      el('a', { class: 'btn btn-ghost', href: '#/me' }, 'Cancel'),
      el('div', { class: 'form-error' })));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(f);
    try {
      await api.updateMe(Object.fromEntries(data));
      toast('Saved');
      window.dispatchEvent(new Event('obv:refresh'));
    } catch (err) { f.querySelector('.form-error').textContent = err.message; }
  });
  return f;
}

function field(label, input) {
  return el('div', { class: 'field' }, el('label', null, label), input);
}

// ---- opportunities ---------------------------------------------------------------------
export async function opportunitiesView(state) {
  const wrap = el('div', { class: 'opp-layout' });
  wrap.append(
    el('h1', { class: 'page-title' }, 'Opportunities'),
    el('p', { class: 'page-sub' }, 'Casting calls, open exhibitions, and collaborations — posted by students, for students.'));

  const list = el('div', null);
  wrap.append(list);

  const { opportunities: opps } = await api.opportunities();
  if (!opps.length) {
    list.append(el('div', { class: 'empty' }, el('div', { class: 'e-mark' }, 'No calls right now'), el('div', { class: 'e-sub' }, 'Post one below if you\u2019re looking for someone.')));
  }
  opps.forEach((o) => {
    const isMine = state.me && o.isMine;
    const interestedBtn = el('button', { class: 'btn btn-small ' + (o.interestedByMe ? 'btn-accent' : 'btn-outline') },
      `${o.interestedCount} interested`);
    if (state.me) interestedBtn.addEventListener('click', async () => {
      const r = await api.interested(o.id);
      interestedBtn.textContent = `${r.count} interested`;
      interestedBtn.className = 'btn btn-small ' + (r.interested ? 'btn-accent' : 'btn-outline');
    });

    const actions = el('div', { class: 'opp-actions' },
      state.me ? el('a', { class: 'btn btn-outline btn-small', href: `mailto:${o.contact}` }, 'Contact') : null,
      interestedBtn);
    if (isMine || (state.me && state.me.isModerator)) {
      actions.append(
        el('button', { class: 'btn btn-ghost btn-small', onclick: async () => {
          await api.updateOpportunity(o.id, { status: o.status === 'open' ? 'closed' : 'open' });
          location.reload();
        } }, o.status === 'open' ? 'Mark filled' : 'Reopen'),
        el('button', { class: 'btn btn-ghost btn-small', onclick: async () => {
          if (!confirm('Remove this call?')) return;
          await api.deleteOpportunity(o.id);
          location.reload();
        } }, 'Delete'));
    }

    list.append(el('div', { class: 'opp' + (o.status !== 'open' ? ' closed' : '') },
      el('div', { class: 'opp-top' },
        el('span', { class: 'opp-type' }, o.type),
        el('span', { class: 'opp-status' }, o.status === 'open' ? 'open' : 'filled'),
        el('span', { class: 'opp-deadline' }, o.deadline ? `due ${o.deadline}` : '')),
      el('div', { class: 'opp-title' }, o.title),
      el('div', { class: 'opp-body' }, o.body),
      o.roles && o.roles.length ? el('div', { class: 'opp-roles' }, o.roles.map((r) => el('span', null, r))) : null,
      el('div', { class: 'opp-foot' },
        el('a', { href: `#/u/${o.author.id}`, style: 'font-size:13px;color:var(--muted)' }, `posted by ${o.author.name} ${timeAgo(o.createdAt)} ago`),
        el('span', { class: 'spacer' }), actions)));
  });

  // post a call
  const form = el('form', { class: 'form', style: 'padding-top:10px' },
    el('h1', { style: 'font-size:24px' }, 'Post a call'),
    el('p', { class: 'sub' }, 'Looking for actors, artists, musicians, hands?'),
    field('Title', el('input', { type: 'text', name: 'title', placeholder: 'ACTORS WANTED — thesis film', required: '' })),
    field('What you\u2019re looking for', el('textarea', { name: 'body', required: '', placeholder: 'Who, what, when, and why someone should say yes.' })),
    field('Type', el('select', { name: 'type' },
      el('option', { value: 'casting' }, 'Casting / performers'),
      el('option', { value: 'collaboration' }, 'Collaboration'),
      el('option', { value: 'exhibition' }, 'Exhibition / show'),
      el('option', { value: 'employment' }, 'Paid work'),
      el('option', { value: 'other' }, 'Other'))),
    field('Roles (comma separated)', el('input', { type: 'text', name: 'roles', placeholder: 'Lead actor, boom operator' })),
    field('Deadline', el('input', { type: 'text', name: 'deadline', placeholder: 'Nov 30' })),
    field('Contact', el('input', { type: 'text', name: 'contact', placeholder: 'you@oberlin.edu' })),
    el('div', { class: 'form-actions' }, el('button', { class: 'btn btn-accent', type: 'submit' }, 'Post the call'), el('div', { class: 'form-error' })));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.createOpportunity(Object.fromEntries(new FormData(form)));
      location.reload();
    } catch (err) { form.querySelector('.form-error').textContent = err.message; }
  });
  wrap.append(form);
  return wrap;
}

// ---- add work ------------------------------------------------------------------------------
export async function composeView(state) {
  let kind = 'image';
  const f = el('form', { class: 'form' },
    el('h1', null, 'Add Your Work'),
    el('p', { class: 'sub' }, 'The vault takes images, audio, video, PDFs (scripts, scores, books), and writing.'));

  const kinds = [['image', 'Image'], ['audio', 'Audio'], ['video', 'Video'], ['pdf', 'PDF / Script'], ['text', 'Writing']];
  const picker = el('div', { class: 'field' },
    el('label', null, 'What is it?'),
    el('div', { class: 'kind-picker' }, kinds.map(([k, label]) => {
      const b = el('button', { type: 'button', class: 'kind-opt' + (k === kind ? ' active' : '') }, label);
      b.addEventListener('click', () => {
        kind = k;
        picker.querySelectorAll('.kind-opt').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        fileWrap.style.display = k === 'text' ? 'none' : 'block';
      });
      return b;
    })));

  const fileInput = el('input', { type: 'file', accept: 'image/*,audio/*,video/*,application/pdf', style: 'display:none' });
  const drop = el('div', { class: 'dropzone' }, 'Drop a file here, or click to choose');
  const fileWrap = el('div', { class: 'field' }, el('label', null, 'The work itself'), drop, fileInput);
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault(); drop.classList.remove('drag');
    if (e.dataTransfer.files.length) fileInput.files = e.dataTransfer.files;
    showName();
  });
  fileInput.addEventListener('change', showName);
  function showName() {
    const file = fileInput.files[0];
    if (file) drop.append(el('div', { class: 'fname' }, `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`));
  }

  const catSel = el('select', { name: 'category', required: '' },
    el('option', { value: '' }, 'Choose a category…'),
    window.OBV_CATEGORIES.map((c) => el('option', { value: c }, c)));

  f.append(picker, fileWrap,
    field('Title', el('input', { type: 'text', name: 'title', required: '', placeholder: 'Give it a name' })),
    field('Category', catSel),
    field('About it', el('textarea', { name: 'description', placeholder: 'Materials, process, a line about why it exists. (For writing posts, the work itself goes here.)' })),
    field('Tags (comma separated)', el('input', { type: 'text', name: 'tags', placeholder: '35mm, thesis, winter' })),
    el('div', { class: 'form-actions' }, el('button', { class: 'btn btn-accent', type: 'submit' }, 'Add to the vault'), el('div', { class: 'form-error' })));

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = f.querySelector('.form-error');
    errBox.textContent = '';
    if (kind === 'text' && !f.description.value.trim()) {
      errBox.textContent = 'Paste or write the piece itself in “About it”.';
      return;
    }
    if (kind !== 'text' && !fileInput.files.length) {
      errBox.textContent = 'Choose a file (or switch to “Writing”).';
      return;
    }
    const fd = new FormData();
    fd.set('kind', kind);
    if (fileInput.files.length) fd.set('media', fileInput.files[0]);
    for (const k of ['title', 'category', 'description', 'tags']) fd.set(k, f.elements[k].value);
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Adding…';
    try {
      const p = await api.createPost(fd);
      location.hash = `#/post/${p.id}`;
    } catch (err) {
      errBox.textContent = err.message;
      btn.disabled = false; btn.textContent = 'Add to the vault';
    }
  });
  return f;
}
