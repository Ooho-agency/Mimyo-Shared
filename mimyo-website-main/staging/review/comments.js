// Mimyo staging review layer: pins, threads and statuses on top of a review version (/v1/, /v2/, ...).
// staging/build.sh injects it into the staging copies only; the site's own pages never load it.
(() => {
  if (window.__mimyoReview) return;
  window.__mimyoReview = true;

  const seg = location.pathname.split('/').filter(Boolean);
  const VERSION = /^(v\d+|draft)$/.test(seg[0] || '') ? seg[0] : null;
  if (!VERSION) return;
  const PAGE = seg.slice(1).join('/') || 'index.html';
  const ICON = {
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };
  const STATUS = { open: 'Open', discuss: 'To discuss', resolved: 'Resolved' };
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  const S = {
    me: null, versions: [], comments: [],
    on: ls.get('mimyo-review.on') !== '0',
    mode: false, panel: false, tab: 'open', scope: 'page',
    active: null, // open thread id
    draft: null,  // { el, anchor } while writing a new comment
    error: '',
  };

  // ---------- API ----------
  async function api(path, opts = {}) {
    const res = await fetch('/api/' + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'content-type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong (' + res.status + ').');
    return data;
  }
  const load = async () => { S.comments = (await api('comments?version=' + VERSION)).comments; };

  // ---------- Anchors ----------
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const textOf = el => norm(el.innerText || el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent).slice(0, 200);

  function cssPath(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        parts.unshift('#' + CSS.escape(el.id));
        return parts.join(' > ');
      }
      let i = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.localName === el.localName) i++;
      parts.unshift(el.localName + ':nth-of-type(' + i + ')');
      el = el.parentElement;
    }
    return ['body'].concat(parts).join(' > ');
  }

  // Comment on the meaningful element: a whole SVG rather than one of its paths.
  function pickTarget(el) {
    const svg = el.closest && el.closest('svg');
    if (svg) { let top = svg; while (top.parentElement && top.parentElement.closest('svg')) top = top.parentElement.closest('svg'); el = top; }
    return el === document.body || el === document.documentElement ? null : el;
  }

  const found = new Map();
  function findEl(a) {
    if (!a) return null;
    let el = null;
    try { el = document.querySelector(a.path); } catch (e) {}
    if (el && a.text && !textOf(el).startsWith(a.text.slice(0, 24))) {
      const byText = a.tag && [...document.getElementsByTagName(a.tag)].find(n => textOf(n) === a.text);
      if (byText) el = byText;
    }
    if (!el && a.text && a.tag) el = [...document.getElementsByTagName(a.tag)].find(n => textOf(n) === a.text) || null;
    return el;
  }

  // Hidden, or under an open modal (e.g. the professionals gate) it isn't part of.
  function visiblePoint(el, a) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return null;
    const modal = [...document.querySelectorAll('[aria-modal="true"]')].find(m => !m.hidden && m.getBoundingClientRect().height > 0);
    if (modal && !modal.contains(el)) return null;
    return { x: r.left + a.x * r.width, y: r.top + a.y * r.height, r };
  }

  // ---------- DOM ----------
  const host = document.createElement('div');
  host.id = 'mimyo-review';
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS_TEXT()}</style>
    <div class="pins"></div>
    <div class="hl" hidden></div>
    <div class="hint" hidden>Click any element to comment on it. <kbd>Esc</kbd> to cancel</div>
    <div class="pop" hidden></div>
    <aside class="panel" hidden></aside>
    <div class="bar" role="toolbar" aria-label="Review comments"></div>`;
  const $ = s => root.querySelector(s);
  const pinsEl = $('.pins'), hl = $('.hl'), hint = $('.hint'), pop = $('.pop'), panel = $('.panel'), bar = $('.bar');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => norm(n).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const isPhone = () => innerWidth < 640;

  function ago(iso) {
    const d = new Date(iso), s = (Date.now() - d) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 7 * 86400) return Math.floor(s / 86400) + ' d ago';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  const threads = () => S.comments.filter(c => !c.parentId && !(c.deleted && !replies(c.id).length));
  const replies = id => S.comments.filter(c => c.parentId === id && !c.deleted);
  const byId = id => S.comments.find(c => c.id === id);
  const versionName = () => (S.versions.find(v => v.id === VERSION) || {}).name || VERSION;
  const pageLabel = p => ({ 'index.html': 'Home', 'professionals.html': 'Professionals', 'contact.html': 'Contact' }[p] || p);

  // ---------- Toolbar ----------
  function renderBar() {
    const open = threads().filter(t => t.status !== 'resolved').length;
    const latest = S.versions.filter(v => v.id !== 'draft').pop();
    const opts = S.versions.length ? S.versions : [{ id: VERSION, name: VERSION }];
    bar.className = 'bar' + (S.on ? '' : ' off');
    bar.innerHTML = S.on ? `
      <button class="who" data-act="me" title="${esc(S.me ? 'Signed in as ' + (S.me.email || S.me.name) : 'Signing in…')}">${esc(initials(S.me && S.me.name))}</button>
      <label class="ver${latest && latest.id !== VERSION ? ' old' : ''}"><span class="sr">Version</span>
        <select data-act="version">${opts.map(v => `<option value="${esc(v.id)}"${v.id === VERSION ? ' selected' : ''}${v.label ? ` title="${esc(v.label)}"` : ''}>${esc(v.name || v.id)}${latest && v.id === latest.id ? ' (latest)' : ''}</option>`).join('')}</select></label>
      <button class="icon" data-act="toggle" title="Hide comments" aria-label="Hide comments">${ICON.eye}</button>
      <button class="list${S.panel ? ' on' : ''}" data-act="panel" aria-expanded="${S.panel}">${ICON.list}<span class="t">Comments</span><b>${open}</b></button>
      <button class="add${S.mode ? ' on' : ''}" data-act="mode">${S.mode ? ICON.close + '<span class="t">Cancel</span>' : ICON.add + '<span class="t">Comment</span><kbd>C</kbd>'}</button>`
      : `<button class="icon" data-act="toggle" title="Show comments" aria-label="Show comments">${ICON.eyeOff}</button>`;
  }

  // ---------- Pins ----------
  function renderPins() {
    pinsEl.innerHTML = '';
    found.clear();
    if (!S.on) return;
    const showResolved = S.panel && S.tab === 'resolved';
    for (const t of threads()) {
      if (t.page !== PAGE) continue;
      const el = findEl(t.anchor);
      found.set(t.id, el);
      if (t.status === 'resolved' && !showResolved && S.active !== t.id) continue;
      const b = document.createElement('button');
      b.className = 'pin s-' + t.status + (S.active === t.id ? ' active' : '');
      b.dataset.id = t.id;
      b.textContent = t.id;
      b.title = '#' + t.id + ' · ' + t.authorName;
      pinsEl.appendChild(b);
    }
    if (S.draft) {
      const b = document.createElement('div');
      b.className = 'pin draft';
      b.textContent = '+';
      b.dataset.draft = '1';
      pinsEl.appendChild(b);
    }
    place();
  }

  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); }); };
  function place() {
    for (const b of pinsEl.children) {
      const el = b.dataset.draft ? S.draft.el : found.get(+b.dataset.id);
      const a = b.dataset.draft ? S.draft.anchor : byId(+b.dataset.id).anchor;
      const p = visiblePoint(el, a);
      b.style.display = p ? '' : 'none';
      if (p) b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    }
    placePop();
  }

  // ---------- Thread / new comment popover ----------
  function anchorPoint() {
    if (S.draft) return visiblePoint(S.draft.el, S.draft.anchor);
    const t = S.active && byId(S.active);
    return t ? visiblePoint(found.get(t.id), t.anchor) : null;
  }
  function placePop() {
    if (pop.hidden || isPhone()) { pop.style.left = pop.style.top = ''; return; }
    const p = anchorPoint();
    const w = pop.offsetWidth, h = pop.offsetHeight, m = 12;
    let x = p ? p.x + 22 : innerWidth - w - 24, y = p ? p.y - 20 : 80;
    if (x + w > innerWidth - m) x = p ? p.x - w - 22 : innerWidth - w - m;
    x = Math.max(m, x);
    y = Math.min(Math.max(m, y), innerHeight - h - 76);
    pop.style.left = x + 'px';
    pop.style.top = Math.max(m, y) + 'px';
  }

  function nameField() {
    if (!S.me || S.me.named) return '';
    return `<label class="f"><span>Your name, shown on your comments</span><input name="name" value="${esc(S.me.name)}" autocomplete="off" data-1p-ignore data-lpignore="true" required></label>`;
  }

  function renderPop() {
    if (S.draft) {
      pop.hidden = false;
      pop.dataset.thread = '';
      pop.innerHTML = `<form class="new" data-form="new">
        <div class="ph"><span class="ref">${esc(S.draft.anchor.text || '<' + S.draft.anchor.tag + '>')}</span><button type="button" class="x" data-act="close" aria-label="Close">${ICON.close}</button></div>
        ${nameField()}
        <textarea name="body" rows="3" placeholder="Add a comment" required></textarea>
        ${S.error ? `<p class="err">${esc(S.error)}</p>` : ''}
        <div class="row"><span class="kb">⌘↵ to post</span><button type="button" class="ghost" data-act="close">Cancel</button><button class="primary">Post</button></div>
      </form>`;
      placePop();
      const f = pop.querySelector(S.me && !S.me.named ? 'input' : 'textarea');
      setTimeout(() => f && f.focus({ preventScroll: true }), 0);
      return;
    }
    const t = S.active && byId(S.active);
    if (!t) { pop.hidden = true; pop.innerHTML = ''; pop.dataset.thread = ''; return; }
    const keep = pop.dataset.thread === String(t.id) && pop.querySelector('form[data-form="reply"] textarea');
    const typed = keep ? keep.value : '';
    const focused = keep && root.activeElement === keep;
    const el = found.get(t.id);
    pop.hidden = false;
    pop.dataset.thread = t.id;
    pop.innerHTML = `
      <div class="ph"><b>#${t.id}</b><span class="ref">${esc(t.anchor && t.anchor.text || '')}</span><button type="button" class="x" data-act="close" aria-label="Close">${ICON.close}</button></div>
      <div class="status" role="group" aria-label="Status">${Object.keys(STATUS).map(s => `<button class="s-${s}${t.status === s ? ' on' : ''}" data-act="status" data-status="${s}" aria-pressed="${t.status === s}">${STATUS[s]}</button>`).join('')}</div>
      ${t.statusBy && t.status !== 'open' ? `<p class="by s-${t.status}">${STATUS[t.status]} by ${esc(t.statusBy)} · ${ago(t.statusAt)}</p>` : ''}
      ${t.page === PAGE && !el ? '<p class="warn">The element this comment was placed on is no longer on the page.</p>' : ''}
      <div class="msgs">${[t].concat(replies(t.id)).map(msg).join('')}</div>
      <form data-form="reply">
        ${nameField()}
        <textarea name="body" rows="2" placeholder="${t.status === 'resolved' ? 'Reply to reopen' : 'Reply'}" required></textarea>
        ${S.error ? `<p class="err">${esc(S.error)}</p>` : ''}
        <div class="row"><span class="kb">⌘↵ to send</span><button class="primary">Reply</button></div>
      </form>`;
    const ta = pop.querySelector('textarea[name="body"]');
    ta.value = typed;
    if (focused) ta.focus({ preventScroll: true });
    placePop();
  }

  function msg(c) {
    const mine = S.me && c.authorId === S.me.id;
    const device = c.anchor && c.anchor.vw ? (c.anchor.vw < 640 ? ' · on phone' : c.anchor.vw < 1024 ? ' · on tablet' : '') : '';
    return `<div class="msg${c.authorId === 'claude' ? ' claude' : ''}">
      <span class="av">${esc(initials(c.authorName))}</span>
      <div><p class="meta"><b title="${esc(c.authorEmail)}">${esc(c.authorName)}</b> · ${ago(c.createdAt)}${device}${mine && !c.deleted ? ` · <button class="link" data-act="delete" data-id="${c.id}">Delete</button>` : ''}</p>
      <p class="body">${c.deleted ? '<i>Deleted</i>' : esc(c.body)}</p></div></div>`;
  }

  // ---------- List panel ----------
  function renderPanel() {
    panel.hidden = !(S.on && S.panel);
    if (panel.hidden) return;
    const all = threads().filter(t => S.scope === 'all' || t.page === PAGE);
    const n = s => all.filter(t => t.status === s).length;
    const list = all.filter(t => t.status === S.tab).sort((a, b) => b.id - a.id);
    panel.innerHTML = `
      <div class="ph"><b>Comments on ${esc(versionName())}</b><button class="x" data-act="panel" aria-label="Close">${ICON.close}</button></div>
      <div class="tabs">${Object.keys(STATUS).map(s => `<button class="${S.tab === s ? 'on' : ''}" data-act="tab" data-tab="${s}">${STATUS[s]} <b>${n(s)}</b></button>`).join('')}</div>
      <div class="scope"><button class="${S.scope === 'page' ? 'on' : ''}" data-act="scope" data-scope="page">This page</button><button class="${S.scope === 'all' ? 'on' : ''}" data-act="scope" data-scope="all">All pages</button></div>
      <div class="items">${list.length ? list.map(t => {
        const r = replies(t.id).length, missing = t.page === PAGE && found.has(t.id) && !found.get(t.id);
        return `<button class="item${S.active === t.id ? ' on' : ''}" data-act="open" data-id="${t.id}">
          <span class="av">${esc(initials(t.authorName))}</span>
          <span class="txt"><span class="meta"><b>${esc(t.authorName)}</b> · ${ago(t.createdAt)}${S.scope === 'all' ? ' · ' + esc(pageLabel(t.page)) : ''}</span>
          <span class="body">${t.deleted ? '<i>Deleted</i>' : esc(t.body)}</span>
          <span class="ref">#${t.id}${t.anchor && t.anchor.text ? ' · ' + esc(t.anchor.text) : ''}</span>
          ${r || missing ? `<span class="meta">${r ? r + (r > 1 ? ' replies' : ' reply') : ''}${r && missing ? ' · ' : ''}${missing ? 'element not found' : ''}</span>` : ''}</span></button>`;
      }).join('') : `<p class="empty">No ${STATUS[S.tab].toLowerCase()} comments${S.scope === 'page' ? ' on this page' : ''}.${S.tab === 'open' ? ' Press C to add one.' : ''}</p>`}</div>`;
  }

  function render() { renderBar(); renderPins(); renderPanel(); renderPop(); }

  // ---------- Comment mode ----------
  const ours = e => e.composedPath().includes(host);
  function setMode(on) {
    S.mode = on && S.on;
    hint.hidden = !S.mode;
    hl.hidden = true;
    document.documentElement.style.cursor = S.mode ? 'crosshair' : '';
    if (S.mode) { S.active = null; S.draft = null; if (isPhone()) S.panel = false; }
    render();
  }
  function onMove(e) {
    if (!S.mode || ours(e)) { hl.hidden = true; return; }
    const el = pickTarget(e.target);
    if (!el) { hl.hidden = true; return; }
    const r = el.getBoundingClientRect();
    Object.assign(hl.style, { transform: `translate(${r.left}px, ${r.top}px)`, width: r.width + 'px', height: r.height + 'px' });
    hl.hidden = false;
  }
  function swallow(e) { if (S.mode && !ours(e)) { e.stopPropagation(); if (e.type !== 'pointerdown' && e.type !== 'touchstart') e.preventDefault(); } }
  function onPick(e) {
    if (!S.mode || ours(e)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const el = pickTarget(e.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    S.draft = { el, anchor: {
      path: cssPath(el), tag: el.localName, text: textOf(el).slice(0, 120),
      x: r.width ? (e.clientX - r.left) / r.width : 0.5, y: r.height ? (e.clientY - r.top) / r.height : 0.5,
      vw: innerWidth,
    } };
    S.mode = false; hint.hidden = true; hl.hidden = true; document.documentElement.style.cursor = '';
    S.error = '';
    render();
  }
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend', 'dblclick', 'submit'].forEach(t => addEventListener(t, swallow, { capture: true, passive: false }));
  addEventListener('click', onPick, true);
  addEventListener('pointermove', onMove, { capture: true, passive: true });

  // ---------- Actions ----------
  function openThread(id, scroll) {
    const t = byId(id);
    if (!t) return;
    if (t.page !== PAGE) { location.href = '/' + VERSION + '/' + t.page + '#review-' + id; return; }
    S.active = id; S.draft = null; S.error = '';
    if (isPhone()) S.panel = false;
    render();
    const el = found.get(id);
    if (scroll && el) {
      const p = visiblePoint(el, t.anchor);
      if (!p || p.y < 60 || p.y > innerHeight - 120) scrollTo({ top: scrollY + (p ? p.y : el.getBoundingClientRect().top) - innerHeight / 3, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  async function saveName(form) {
    const input = form.querySelector('input[name="name"]');
    if (input) S.me = await api('me', { method: 'PUT', body: { name: input.value } });
  }

  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) {
      const pin = e.target.closest('.pin[data-id]');
      if (pin) openThread(+pin.dataset.id);
      return;
    }
    const act = b.dataset.act;
    try {
      if (act === 'toggle') { S.on = !S.on; ls.set('mimyo-review.on', S.on ? '1' : '0'); if (!S.on) { S.mode = false; S.active = null; S.draft = null; hint.hidden = hl.hidden = true; } render(); }
      else if (act === 'panel') { S.panel = !S.panel; if (S.panel && isPhone()) { S.active = null; S.draft = null; } render(); }
      else if (act === 'mode') setMode(!S.mode);
      else if (act === 'close') { S.active = null; S.draft = null; S.error = ''; render(); }
      else if (act === 'tab') { S.tab = b.dataset.tab; render(); }
      else if (act === 'scope') { S.scope = b.dataset.scope; render(); }
      else if (act === 'open') openThread(+b.dataset.id, true);
      else if (act === 'me') {
        const name = prompt('Your name, shown on your comments' + (S.me && S.me.email ? ' (' + S.me.email + ')' : ''), S.me ? S.me.name : '');
        if (name && name.trim()) { S.me = await api('me', { method: 'PUT', body: { name } }); render(); }
      } else if (act === 'status') {
        const t = byId(S.active);
        if (t && t.status !== b.dataset.status) { Object.assign(t, (await api('comments/' + t.id, { method: 'PATCH', body: { status: b.dataset.status } })).comment); render(); }
      } else if (act === 'delete') {
        if (!confirm('Delete this comment?')) return;
        await api('comments/' + b.dataset.id, { method: 'DELETE' });
        await load();
        if (S.active && !threads().some(t => t.id === S.active)) S.active = null;
        render();
      }
    } catch (err) { S.error = err.message; renderPop(); }
  });

  root.addEventListener('change', e => {
    if (e.target.dataset.act === 'version') location.href = '/' + e.target.value + '/' + PAGE;
  });

  root.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target, body = form.querySelector('textarea').value.trim();
    if (!body) return;
    const btn = form.querySelector('.primary');
    btn.disabled = true;
    try {
      await saveName(form);
      if (form.dataset.form === 'new') {
        const c = (await api('comments', { method: 'POST', body: { version: VERSION, page: PAGE, anchor: S.draft.anchor, body } })).comment;
        S.comments.push(c); S.draft = null; S.active = c.id; S.tab = 'open';
      } else {
        await api('comments', { method: 'POST', body: { parentId: S.active, body } });
        form.querySelector('textarea').value = '';
        await load();
      }
      S.error = '';
      render();
    } catch (err) { S.error = err.message; btn.disabled = false; renderPop(); }
  });

  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.matches('textarea')) { e.preventDefault(); e.target.form.requestSubmit(); }
    if (e.key === 'Escape') { e.stopPropagation(); S.active = null; S.draft = null; render(); }
  });

  addEventListener('keydown', e => {
    if (ours(e) || !S.on) return;
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if (e.key === 'Escape' && (S.mode || S.active || S.draft || S.panel)) {
      if (S.mode) setMode(false); else if (S.active || S.draft) { S.active = null; S.draft = null; render(); } else { S.panel = false; render(); }
    } else if ((e.key === 'c' || e.key === 'C') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault(); setMode(!S.mode);
    }
  }, true);

  addEventListener('scroll', schedule, { capture: true, passive: true });
  addEventListener('resize', () => { schedule(); renderPop(); }, { passive: true });
  setInterval(() => { if (S.on && pinsEl.children.length) place(); }, 800);

  // Others' comments show up without a reload.
  setInterval(async () => {
    if (document.visibilityState !== 'visible' || !S.on) return;
    const typing = pop.querySelector('textarea') && pop.querySelector('textarea').value;
    try { await load(); if (typing || S.draft) { renderBar(); renderPins(); renderPanel(); } else render(); } catch (e) {}
  }, 30000);

  // ---------- Start ----------
  function start() {
    document.body.appendChild(host);
    render();
    Promise.all([
      api('me').then(m => { S.me = m; }).catch(() => {}),
      fetch('/versions.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(v => { S.versions = v; }).catch(() => {}),
      load().catch(err => { S.error = err.message; }),
    ]).then(() => {
      render();
      const m = location.hash.match(/^#review-(\d+)$/);
      if (m) { history.replaceState(null, '', location.pathname + location.search); S.on = true; setTimeout(() => openThread(+m[1], true), 300); }
    });
  }
  addEventListener('hashchange', () => {
    const m = location.hash.match(/^#review-(\d+)$/);
    if (m) { history.replaceState(null, '', location.pathname + location.search); openThread(+m[1], true); }
  });
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);

  // ---------- Look ----------
  function CSS_TEXT() {
    return `
:host{all:initial}
*{box-sizing:border-box;margin:0;font:inherit;color:inherit}
.bar,.pop,.panel,.hint,.pin{font:14px/1.4 "Helvetica Neue",Helvetica,Arial,sans-serif;color:#39392F;-webkit-font-smoothing:antialiased;letter-spacing:0;text-transform:none}
button,select{cursor:pointer;background:none;border:0;padding:0}
svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
kbd{font:11px/1 "Helvetica Neue",Helvetica,Arial,sans-serif;border:1px solid currentColor;border-radius:5px;padding:2px 5px;opacity:.7}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
[hidden]{display:none!important}

.bar{position:fixed;right:16px;bottom:16px;display:flex;align-items:center;gap:4px;padding:5px;background:#fff;border-radius:999px;box-shadow:0 6px 30px rgba(57,57,47,.18),0 0 0 1px rgba(57,57,47,.08)}
.bar>button,.ver{display:flex;align-items:center;gap:7px;height:36px;padding:0 12px;border-radius:999px;white-space:nowrap}
.bar>button:hover,.ver:hover{background:#F2EEEC}
.bar .icon{width:36px;padding:0;justify-content:center}
.bar.off{padding:4px}
.who{width:36px;padding:0!important;justify-content:center;background:#93AEC5!important;color:#fff;font-weight:700;font-size:12px}
.ver select{appearance:none;-webkit-appearance:none;max-width:210px;text-overflow:ellipsis;font-size:13px;padding-right:14px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2339392F' stroke-width='1.5'/%3E%3C/svg%3E") right center/9px no-repeat}
.ver.old{background:#FBEFD9}
.list b{min-width:20px;height:20px;border-radius:999px;background:#F2EEEC;font-size:12px;font-weight:700;display:grid;place-items:center;padding:0 6px}
.list.on{background:#F2EEEC}
.add{background:#39392F!important;color:#fff;padding:0 14px!important}
.add.on{background:#8C4A3C!important}

.pins{position:fixed;inset:0;pointer-events:none}
.pin{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50% 50% 50% 4px;background:#39392F;color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;pointer-events:auto;box-shadow:0 0 0 2px #fff,0 4px 14px rgba(57,57,47,.35)}
.pin.s-discuss{background:#C98A2B}
.pin.s-resolved{background:#7E9C86}
.pin.active{box-shadow:0 0 0 2px #fff,0 0 0 5px #93AEC5,0 4px 14px rgba(57,57,47,.35)}
.pin.draft{background:#93AEC5;font-size:18px;pointer-events:none}
.hl{position:fixed;left:0;top:0;pointer-events:none;border:2px solid #93AEC5;background:rgba(147,174,197,.14);border-radius:6px}
.hint{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#39392F;color:#fff;padding:9px 16px;border-radius:999px;font-size:13px;white-space:nowrap;box-shadow:0 6px 24px rgba(0,0,0,.2)}
.hint kbd{margin-left:4px}

.pop,.panel{position:fixed;background:#fff;border-radius:18px;box-shadow:0 12px 50px rgba(57,57,47,.22),0 0 0 1px rgba(57,57,47,.08)}
.pop{width:340px;max-height:calc(100vh - 110px);overflow:auto;padding:14px}
.panel{right:16px;top:16px;bottom:76px;width:360px;display:flex;flex-direction:column;overflow:hidden}
.ph{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.panel .ph{padding:14px 14px 0}
.ph .ref{flex:1;min-width:0;font-size:12px;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.panel .ph b{flex:1}
.x{width:28px;height:28px;border-radius:999px;display:grid;place-items:center;margin-left:auto}
.x:hover{background:#F2EEEC}
.status{display:flex;gap:4px;background:#F6F3F2;border-radius:999px;padding:3px;margin-bottom:8px}
.status button{flex:1;height:28px;border-radius:999px;font-size:12px}
.status button.on{background:#fff;font-weight:700;box-shadow:0 1px 4px rgba(57,57,47,.15)}
.status button.s-discuss.on{color:#9A6618}
.status button.s-resolved.on{color:#4E7058}
.by{font-size:12px;margin-bottom:8px;opacity:.75}
.warn{font-size:12px;background:#FBEFD9;border-radius:10px;padding:8px 10px;margin-bottom:8px}
.msgs{display:flex;flex-direction:column;gap:12px;margin:6px 0 12px}
.msg{display:flex;gap:9px}
.av{flex:none;width:26px;height:26px;border-radius:50%;background:#93AEC5;color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center}
.msg.claude .av{background:#39392F}
.meta{font-size:12px;opacity:.7}
.meta b{opacity:1;font-weight:700}
.body{white-space:pre-wrap;overflow-wrap:anywhere}
.link{text-decoration:underline;font-size:12px}
form{display:flex;flex-direction:column;gap:8px}
.f{display:flex;flex-direction:column;gap:4px;font-size:12px}
input,textarea{width:100%;border:1px solid rgba(57,57,47,.2);border-radius:12px;padding:9px 11px;font-size:14px;background:#fff;resize:vertical;outline:none}
input:focus,textarea:focus{border-color:#93AEC5;box-shadow:0 0 0 3px rgba(147,174,197,.3)}
.row{display:flex;align-items:center;gap:6px}
.kb{flex:1;font-size:11px;opacity:.5}
.primary,.ghost{height:34px;padding:0 16px;border-radius:999px;font-weight:700;font-size:13px}
.primary{background:#39392F;color:#fff}
.primary:disabled{opacity:.5}
.ghost:hover{background:#F2EEEC}
.err{font-size:12px;color:#A3402F}
.tabs,.scope{display:flex;gap:4px;padding:10px 14px 0}
.tabs button,.scope button{height:30px;padding:0 11px;border-radius:999px;font-size:12px;border:1px solid rgba(57,57,47,.14)}
.tabs button.on,.scope button.on{background:#39392F;color:#fff;border-color:#39392F}
.tabs b{font-weight:700;opacity:.7;margin-left:2px}
.scope{padding-bottom:10px;border-bottom:1px solid rgba(57,57,47,.08)}
.scope button{border:0;background:#F6F3F2}
.items{overflow:auto;flex:1;padding:6px}
.item{display:flex;gap:9px;width:100%;text-align:left;padding:10px;border-radius:12px}
.item:hover,.item.on{background:#F6F3F2}
.txt{display:flex;flex-direction:column;gap:2px;min-width:0}
.item .body{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.item .ref{font-size:12px;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.empty{padding:24px 12px;text-align:center;font-size:13px;opacity:.6}

@media (max-width:639px){
  .bar{left:50%;right:auto;transform:translateX(-50%);bottom:12px;max-width:calc(100vw - 24px)}
  .bar .t,.add kbd{display:none}
  .bar>button,.ver{padding:0 10px}
  .ver select{max-width:96px}
  .pop,.panel{left:8px!important;right:8px;top:auto!important;bottom:66px;width:auto;max-height:70vh;border-radius:18px}
  .panel{height:70vh}
  .hint{white-space:normal;width:calc(100vw - 32px);text-align:center}
  .hint kbd{display:none}
  .kb{visibility:hidden}
}
`;
  }
})();
