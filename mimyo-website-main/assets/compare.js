// How it works: breast ↔ Mimyo slider. Left of the handle = breast, right = Mimyo.
// Everything that changes sits left of ~56%, so it opens at 60% on the full breastfeeding picture.
(() => {
  if (!document.getElementById('cmp')) return;
  const box = document.getElementById('cmp'), range = box.querySelector('input'),
        lblL = box.querySelector('.lbl.l'), lblR = box.querySelector('.lbl.r'), START = 60;
  let drag = false, touched = false;
  const set = v => {
    v = Math.max(0, Math.min(100, v));
    box.style.setProperty('--pos', v + '%');
    range.value = v;
    range.setAttribute('aria-valuetext', `${Math.round(v)}% breast, ${Math.round(100 - v)}% Mimyo`);
    lblL.style.opacity = v < 18 ? 0 : 1;
    lblR.style.opacity = v > 82 ? 0 : 1;
  };
  range.addEventListener('input', () => set(+range.value));
  const at = e => { const r = box.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); };
  box.addEventListener('pointerdown', e => { drag = touched = true; box.classList.add('dragging'); box.setPointerCapture(e.pointerId); at(e); });
  box.addEventListener('pointermove', e => { if (drag) at(e); });
  const end = () => { drag = false; box.classList.remove('dragging'); };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  box.addEventListener('keydown', () => { touched = true; });
  set(START);
  // one-time nudge when it scrolls into view: sweep left to reveal Mimyo, then back
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    // sweep to Mimyo and hold a moment so the callouts are seen, then back to the breast
    const keys = [[0, START], [900, 16], [2600, 16], [3500, START]];
    const ease = x => x < .5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
    let t0;
    const step = now => {
      if (touched) return;
      t0 ??= now;
      const t = now - t0, i = keys.findIndex(k => k[0] > t);
      if (i === -1) return set(START);
      const [ta, va] = keys[i - 1], [tb, vb] = keys[i];
      set(va + (vb - va) * ease((t - ta) / (tb - ta)));
      requestAnimationFrame(step);
    };
    setTimeout(() => requestAnimationFrame(step), 400);
  }, { threshold: .6 });
  io.observe(box);
})();
