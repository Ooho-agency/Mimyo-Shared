/* Mimyo homepage v3: the 3D device appears once, in the "Inside Mimyo" walkthrough. One contained section: each step highlights its part, the visitor can drag to turn the device, and the steps play on their own until the visitor takes over. */
(async () => {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  /* native scrolling (no smooth-scroll library) */
  window.storyScrollTo = el => {
    const r = el.getBoundingClientRect(); const y = scrollY + r.top - innerHeight/2 + r.height/2;
    lenis ? lenis.scrollTo(y, { duration:1.4 }) : scrollTo({ top:y, behavior:reduce ? 'auto' : 'smooth' });
  };
  const scrollToY = y => lenis ? lenis.scrollTo(y, { duration:1.6 }) : scrollTo({ top:y, behavior:reduce ? 'auto' : 'smooth' });

  /* ---------- renderer ---------- */
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true; renderer.autoClear = false;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .95;
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(300, 600, 500); scene.add(key);
  const fillL = new THREE.DirectionalLight('#e6eef6', .55); fillL.position.set(-400, 100, 200); scene.add(fillL);
  scene.add(new THREE.HemisphereLight('#ffffff', '#e7dccf', .4));
  const D = 1000, FOV = 28;
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth/innerHeight, 10, 6000); camera.position.set(0, 0, D);
  const halfH = Math.tan(THREE.MathUtils.degToRad(FOV/2)) * D;
  const wpp = () => 2*halfH / innerHeight;   // world units per CSS pixel at z = 0

  const dev = new THREE.Group(); dev.rotation.order = 'XYZ'; scene.add(dev);
  const inner = new THREE.Group(); dev.add(inner);
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e4), clipList = [clipPlane];

  /* contact shadow */
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  { const g = sc.getContext('2d'); const gr = g.createRadialGradient(64,64,0,64,64,64); gr.addColorStop(0,'rgba(70,52,40,.55)'); gr.addColorStop(1,'rgba(70,52,40,0)'); g.fillStyle = gr; g.fillRect(0,0,128,128); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(sc), transparent:true, depthWrite:false }));
  shadow.renderOrder = -1; scene.add(shadow);

  /* ---------- materials ---------- */
  const MILK = '#ECE2C2', MILK_DEEP = '#E2D6B6', BLUSH = '#DCAB9C';
  const P = THREE.MeshPhysicalMaterial;
  const LOOK = {
    clear:   () => new P({ color:'#ffffff', roughness:.05, metalness:0, transparent:true, opacity:.2, clearcoat:1, clearcoatRoughness:.04, envMapIntensity:1.6, depthWrite:false }),
    teat:    () => new P({ color:'#F1ECDB', roughness:.5, clearcoat:.25, clearcoatRoughness:.5, sheen:.35, sheenColor:new THREE.Color('#fff8ec') }),
    valve:   () => new P({ color:'#E9C4AE', roughness:.35, clearcoat:.6 }),
    pouch:   () => new P({ color:MILK, roughness:.55, clearcoat:.2, clearcoatRoughness:.6, sheen:.3, sheenColor:new THREE.Color('#fffaf0') }),
    colour:  () => new P({ color:BLUSH, roughness:.58, clearcoat:.12, clearcoatRoughness:.5 }),
    seat:    () => new P({ color:'#F3EFE8', roughness:.5 }),
    storage: () => new P({ color:'#DCC6B2', roughness:.6 }),
    storage2:() => new P({ color:'#D3BCA7', roughness:.6 }),
  };
  const CAPC = { clear:'#C9D5DE', teat:MILK_DEEP, valve:'#C99A80', pouch:MILK_DEEP, colour:'#B9948A', seat:'#D7D0C4', storage:'#BFA996', storage2:'#B49E8B' };
  function ghostMat(color){
    return new THREE.ShaderMaterial({
      uniforms:{ uColor:{ value:new THREE.Color(color) }, uOpacity:{ value:1 } },
      vertexShader:`varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader:`uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; void main(){ float f = 1. - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uColor, (.04 + .75*pow(f, 2.2))*uOpacity);
        #include <colorspace_fragment>
      }`,
      transparent:true, depthWrite:false, side:THREE.DoubleSide,
    });
  }

  /* ---------- parts ---------- */
  const DEF = {
    V12_CAPUCHON:{ look:'colour', exp:[0,268,0], f:true },  V12_BAGUE:{ look:'colour', exp:[0,202,0], f:true },
    V12_TETINE_L:{ look:'teat', exp:[0,128,0], f:true },     V12_VALVE_UMBRELLA_PULLIN:{ look:'valve', exp:[0,92,0], f:true },
    V12_SUPPORT_VALVE_VERNAY:{ look:'seat', exp:[0,62,0], f:true }, V12_CORPS_PRINCIPAL:{ look:'clear', exp:[0,0,0], f:true },
    V12_FOND:{ look:'colour', exp:[0,-46,0], f:true },       V12_POCHE_250ML:{ look:'pouch', exp:[96,-12,0], f:true },
    V12_BAGUE_POCHE:{ look:'colour', exp:[96,18,0], f:true },
    V12_CAPUCHON_CONSERVATION:{ look:'storage', exp:[96,40,0], asm:[0,-52,0] },
    V12_ANNEAU_CONSERVATION_MOIS:{ look:'storage2', exp:[96,64,0], asm:[0,-52,0] },
    V12_ANNEAU_CONSERVATION_JOURS:{ look:'storage', exp:[96,84,0], asm:[0,-52,0] },
  };
  const FOCUS = [['V12_TETINE_L'], ['V12_VALVE_UMBRELLA_PULLIN','V12_SUPPORT_VALVE_VERNAY'], ['V12_POCHE_250ML','V12_BAGUE_POCHE'], ['V12_CAPUCHON_CONSERVATION','V12_ANNEAU_CONSERVATION_MOIS','V12_ANNEAU_CONSERVATION_JOURS']];
  const parts = [], byName = {};
  const bin = Uint8Array.from(atob(MODEL.b64), c => c.charCodeAt(0));
  const buf = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  MODEL.meta.forEach(m => {
    const d = DEF[m.name]; if (!d) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(new Float32Array(buf, m.p, m.vc*3)), 3));
    const n8 = new Int8Array(buf, m.n, m.vc*3), nf = new Float32Array(m.vc*3); for (let i = 0; i < nf.length; i++) nf[i] = n8[i]/127;
    g.setAttribute('normal', new THREE.BufferAttribute(nf, 3));
    g.setIndex(new THREE.BufferAttribute(m.i32 ? new Uint32Array(buf, m.i, m.ic) : new Uint16Array(buf, m.i, m.ic), 1));
    g.computeBoundingBox();
    const center = g.boundingBox.getCenter(new THREE.Vector3()), size = g.boundingBox.getSize(new THREE.Vector3());
    g.translate(-center.x, -center.y, -center.z); g.computeBoundingSphere();
    const look = LOOK[d.look](); look.clippingPlanes = clipList;
    const mesh = new THREE.Mesh(g, look);
    if (d.look === 'clear') mesh.renderOrder = 5;
    const cap = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color:CAPC[d.look], side:THREE.BackSide, clippingPlanes:clipList })); cap.visible = false; mesh.add(cap);
    inner.add(mesh);
    const p = { name:m.name, d, mesh, cap, look, ghost:ghostMat('#8E8379'), center, size,
      asm:new THREE.Vector3(...(d.asm || [0,0,0])), exp:new THREE.Vector3(...d.exp), vis:d.f ? 1 : 0, g:0 };
    parts.push(p); byName[m.name] = p;
  });

  /* pouch: dense lathe so it can crumple; teat: solid milk core; valve flex */
  const pouch = byName.V12_POCHE_250ML, teat = byName.V12_TETINE_L, valve = byName.V12_VALVE_UMBRELLA_PULLIN;
  let pouchSrc, teatSrc, valveSrc, milkSrc, milkCore;
  {
    const src = pouch.mesh.geometry.attributes.position.array, ax = -pouch.center.x, az = -pouch.center.z, bins = new Map();
    for (let i = 0; i < src.length; i += 3){ const y = Math.round(src[i+1]*2)/2; bins.set(y, Math.max(bins.get(y) || 0, Math.hypot(src[i]-ax, src[i+2]-az))); }
    const ys = [...bins.keys()].sort((a,b) => a-b), y0 = ys[0], y1 = ys[ys.length-1];
    const rAt = y => { let lo = ys[0], hi = ys[ys.length-1]; for (const k of ys){ if (k <= y) lo = k; if (k >= y){ hi = k; break; } } return lo === hi ? bins.get(lo) : bins.get(lo) + (bins.get(hi)-bins.get(lo))*(y-lo)/(hi-lo); };
    const pts = [new THREE.Vector2(0, y0)]; for (let y = y0; y <= y1 + 1e-6; y += .75) pts.push(new THREE.Vector2(rAt(y), y));
    const lathe = new THREE.LatheGeometry(pts, 112); lathe.translate(ax, 0, az); lathe.computeVertexNormals(); lathe.computeBoundingSphere();
    pouch.mesh.geometry = lathe; pouch.cap.geometry = lathe; pouchSrc = lathe.attributes.position.array.slice();
  }
  {
    teatSrc = teat.mesh.geometry.attributes.position.array.slice();
    const s = teatSrc, cy = teat.center.y, ax = -teat.center.x, az = -teat.center.z, bins = new Map();
    for (let i = 0; i < s.length; i += 3){ const y = Math.round(s[i+1] + cy); bins.set(y, Math.min(bins.get(y) ?? 1e9, Math.hypot(s[i]-ax, s[i+2]-az))); }
    const pts = [new THREE.Vector2(0, 6 - cy)]; let prev = 23;
    for (let y = 6; y <= 53; y++){ let r = bins.has(y) ? bins.get(y) : prev; if (y < 16) r = Math.min(r, 25.5); r = Math.min(r, prev + 1.5); prev = r; pts.push(new THREE.Vector2(Math.max(.4, r*.96 - .3), y - cy)); }
    pts.push(new THREE.Vector2(0, 53.5 - cy));
    const g = new THREE.LatheGeometry(pts, 72); g.translate(ax, 0, az); g.computeVertexNormals(); milkSrc = g.attributes.position.array.slice();
    milkCore = new THREE.Mesh(g, new P({ color:MILK, roughness:.5, clippingPlanes:clipList }));
    milkCore.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color:MILK_DEEP, side:THREE.BackSide, clippingPlanes:clipList })));
    teat.mesh.add(milkCore);
    valveSrc = valve.mesh.geometry.attributes.position.array.slice();
  }
  const POUCH_TOP = -24, POUCH_BOT = -145, C_MAX = .9;
  const prof = (t, c) => c * (1 - smooth(.74, .97, t)) * (.5 + .5*smooth(0, .25, t));
  const radial = (th, t, c) => { const k = prof(t, c); const n = .55*Math.cos(2*th + 3.2*t + 1.3) + .3*Math.sin(3*th - 6.5*t + .7) + .14*Math.sin(5*th + 10*t) + .06*Math.sin(7*th - 17*t); return Math.max(.05, 1 - k*(.32 + .68*Math.pow(clamp(.5 + .5*n), 1.2))); };
  const VOL = (() => { const o = []; for (let i = 0; i <= 60; i++){ const c = C_MAX*i/60; let s = 0, n = 0; for (let a = 0; a < 40; a++) for (let b = 0; b <= 30; b++){ const r = radial(a/40*2*Math.PI, b/30, c); s += r*r; n++; } o.push([c, s/n]); } const v0 = o[0][1], v1 = o[o.length-1][1]; return o.map(([c, v]) => [c, (v - v1)/(v0 - v1)]); })();
  const collapseFor = f => { for (let i = 1; i < VOL.length; i++) if (VOL[i][1] <= f){ const [c0,v0] = VOL[i-1], [c1,v1] = VOL[i]; return c0 + (c1-c0)*(v0-f)/(v0-v1 || 1); } return C_MAX; };
  let lastC = -1;
  function deformPouch(ml){
    const c = collapseFor(ml/250); if (Math.abs(c - lastC) < 1e-4) return; lastC = c;
    const pos = pouch.mesh.geometry.attributes.position, a = pos.array, s = pouchSrc, ax = -pouch.center.x, az = -pouch.center.z, cy = pouch.center.y;
    for (let i = 0; i < a.length; i += 3){
      const x = s[i], y = s[i+1], z = s[i+2];
      if (y + cy > POUCH_TOP + 2){ a[i] = x; a[i+1] = y; a[i+2] = z; continue; }
      const t = clamp((y + cy - POUCH_BOT)/(POUCH_TOP - POUCH_BOT)), k = radial(Math.atan2(z-az, x-ax), t, c);
      a[i] = ax + (x-ax)*k; a[i+1] = y + c*6*(1-t)*(1-t); a[i+2] = az + (z-az)*k;
    }
    pos.needsUpdate = true; pouch.mesh.geometry.computeVertexNormals();
  }
  function deformTeat(k){
    const cy = teat.center.y, ax = -teat.center.x, az = -teat.center.z;
    for (const [arr, src] of [[teat.mesh.geometry.attributes.position, teatSrc], [milkCore.geometry.attributes.position, milkSrc]]){
      const a = arr.array;
      for (let i = 0; i < a.length; i += 3){ const w = smooth(24, 40, src[i+1] + cy); const r = 1 - .2*k*w; a[i] = ax + (src[i]-ax)*r; a[i+2] = az + (src[i+2]-az)*r; a[i+1] = src[i+1] + 3.2*k*w; }
      arr.needsUpdate = true;
    }
  }
  function deformValve(o){
    const pos = valve.mesh.geometry.attributes.position, a = pos.array, s = valveSrc, cy = valve.center.y, ax = -valve.center.x, az = -valve.center.z;
    for (let i = 0; i < a.length; i += 3){ const r = Math.hypot(s[i]-ax, s[i+2]-az); a[i+1] = s[i+1] + (r > 4 && s[i+1] + cy > 3 ? o*(r-4)*.32 : 0); }
    pos.needsUpdate = true;
  }

  /* decals: graduations (back), mark + tagline (front, above the opening), embossed logo on the teat collar */
  const bodyR = y => 33.0 + (-10 - y)*.0175;
  function svgImg(svg, fill){ return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/fill="black"/g, `fill="${fill}"`)); }); }
  function band(part, { rTop, rBot, y0, y1, arc, facing, canvas }){
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const geo = new THREE.CylinderGeometry(rTop, rBot, y1 - y0, 96, 1, true, facing - arc/2, arc); geo.translate(0, (y0 + y1)/2 - part.center.y, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map:tex, transparent:true, roughness:.55, depthWrite:false, clippingPlanes:clipList, polygonOffset:true, polygonOffsetFactor:-2 }));
    m.renderOrder = 6; part.mesh.add(m); return m;
  }
  (async () => {
    const body = byName.V12_CORPS_PRINCIPAL, collar = byName.V12_BAGUE, ink = '#9C7B68';
    { const W = 512, H = 2048, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      const yT = -14, yB = -126, Y = mm => H*(yT - mm)/(yT - yB), yo = ml => -118 + (ml - 30)/220*92, cx = W/2;
      g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 5; g.textBaseline = 'middle';
      g.beginPath(); g.moveTo(cx, Y(yo(250) + 4)); g.lineTo(cx, Y(yo(30) - 4)); g.stroke();
      g.font = '500 58px "Helvetica Neue",Arial'; g.textAlign = 'left';
      for (let ml = 30; ml <= 250; ml += 10){ const y = Y(yo(ml)), M = ml % 30 === 0 || ml === 250; g.beginPath(); g.moveTo(cx + 6, y); g.lineTo(cx + (M ? 70 : 34), y); g.stroke(); if (M) g.fillText(ml, cx + 26, y - 34); }
      g.textAlign = 'right'; for (let oz = 1; oz <= 8; oz++){ const y = Y(yo(oz*29.57)); g.beginPath(); g.moveTo(cx - 6, y); g.lineTo(cx - 70, y); g.stroke(); g.fillText(oz, cx - 26, y + 36); }
      band(body, { rTop:bodyR(yT) + .12, rBot:bodyR(yB) + .12, y0:yB, y1:yT, arc:.95, facing:-Math.PI/2, canvas:c }); }
    { const W = 1024, H = 576, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      const img = await svgImg(LOGO_MARK, ink), lw = 300, lh = lw*img.height/img.width; g.drawImage(img, (W - lw)/2, 40, lw, lh);
      g.fillStyle = ink; g.textAlign = 'center'; g.font = '500 44px "Helvetica Neue",Arial';
      g.fillText('La santé de demain se', W/2, 40 + lh + 62); g.fillText('prépare dès la naissance', W/2, 40 + lh + 116);
      band(body, { rTop:bodyR(-17) + .12, rBot:bodyR(-45) + .12, y0:-45, y1:-17, arc:.95, facing:Math.PI/2, canvas:c }); }
    { const W = 2048, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      const img = await svgImg(LOGO_FULL, '#000'), lh = 150, lw = lh*img.width/img.height; g.drawImage(img, (W - lw)/2, (H - lh)/2, lw, lh);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgba(120,80,70,.3)'; g.fillRect(0, 0, W, H);
      band(collar, { rTop:32.5, rBot:33.1, y0:-9, y1:7, arc:1.5, facing:Math.PI/2, canvas:c }); }
  })();

  /* framing: assembled (feeding) vs fully exploded extents */
  const box = (useExp, withStorage) => { const b = new THREE.Box3(); parts.forEach(p => { if (!p.d.f && !withStorage) return; const c = p.center.clone().add(p.d.f ? (useExp ? p.exp : new THREE.Vector3()) : p.asm.clone().add(p.exp)); const h = p.size.clone().multiplyScalar(.5); b.expandByPoint(c.clone().sub(h)); b.expandByPoint(c.clone().add(h)); }); return b; };
  const bA = box(false, false), bE = box(true, true);
  const cA = bA.getCenter(new THREE.Vector3()), cE = bE.getCenter(new THREE.Vector3());
  const sA = bA.getSize(new THREE.Vector3()), sE = bE.getSize(new THREE.Vector3());

  /* ---------- walkthrough state ---------- */
  const SEC = $('#parts'), view = $('#pview'), anchor = $('#a-parts'), pin = $('#ppin');
  const BASE = { rot:0, sway:0, flip:0, cap:1, cut:0, exp:0, vis:1, ml:210, feed:0 };
  const KEYS = Object.keys(BASE);
  const tabs = $$('#ptabs button'), bars = tabs.map(b => b.querySelector('.bar'));
  const AUTO = 7;   // seconds per step while the walkthrough plays on its own
  let sel = 0, manual = false, seen = false, autoT = 0;
  const drag = { y:0, p:0, ty:0, tp:0, active:false, x0:0, y0:0, moved:0 };
  const takeOver = () => { if (!manual){ manual = true; SEC.classList.add('manual'); } };
  function select(i, byUser){
    sel = i; autoT = 0; drag.ty = 0; drag.tp = 0;   // turn back to face the part
    if (byUser) takeOver();
    tabs.forEach((b, j) => { b.parentElement.classList.toggle('on', j === i); b.setAttribute('aria-pressed', j === i); });
  }
  tabs.forEach((b, i) => b.addEventListener('click', () => select(i, true)));

  /* drag to turn; a tap on a part selects it */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const groupOf = n => FOCUS.findIndex(g => g.includes(n));
  function pick(e){
    ndc.set(e.clientX/innerWidth*2 - 1, -(e.clientY/innerHeight)*2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(parts.filter(p => p.mesh.visible && groupOf(p.name) >= 0).map(p => p.mesh), false)[0];
    if (hit) select(groupOf(parts.find(p => p.mesh === hit.object).name), true);
  }
  view.addEventListener('pointerdown', e => { drag.active = true; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.moved = 0; view.setPointerCapture(e.pointerId); view.classList.add('grabbing'); });
  view.addEventListener('pointermove', e => {
    if (!drag.active) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.ty += dx*.01; if (e.pointerType === 'mouse') drag.tp = clamp(drag.tp + dy*.006, -.7, .7);
    if (drag.moved > 6) takeOver();
  });
  view.addEventListener('pointerup', e => { if (!drag.active) return; drag.active = false; view.classList.remove('grabbing'); if (drag.moved < 6) pick(e); });
  view.addEventListener('pointercancel', () => { drag.active = false; view.classList.remove('grabbing'); });

  /* ---------- feed (how it works) ---------- */
  const drops = Array.from({ length:16 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), new P({ color:MILK, roughness:.2, clearcoat:1, transparent:true })); m.visible = false; scene.add(m); return { m, life:0, v:new THREE.Vector3() }; });
  let phase = 0, dropT = 0;

  /* ---------- state smoothing ---------- */
  const cur = { ...BASE, x:0, y:0, s:1 }, focusW = [0,0,0,0];
  let first = true;
  const v3 = new THREE.Vector3(), tmp = new THREE.Vector3();
  const clock = new THREE.Clock();

  function frame(){
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    const r = view.getBoundingClientRect(), onScreen = r.bottom > 0 && r.top < innerHeight;
    if (!seen && Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) > r.height*.5) seen = true;   // explode once the panel is half in view
    const S = { ...BASE, rot:.18, sway:manual ? 0 : .4, exp:seen ? 1 : 0 };
    const k = first || reduce ? 1 : 1 - Math.exp(-dt*12), ke = first || reduce ? 1 : 1 - Math.exp(-dt*2.6); first = false;
    KEYS.forEach(n => cur[n] = lerp(cur[n], S[n], n === 'exp' ? ke : k));
    // the device sits in the viewer panel and scrolls with it (no lag)
    const a = anchor.getBoundingClientRect();
    cur.x = a.left + a.width/2; cur.y = a.top + a.height/2; cur.w = a.width; cur.h = a.height;

    // steps play on their own until the visitor clicks or drags
    if (onScreen && seen && !manual && !reduce && cur.exp > .9){ autoT += dt; if (autoT >= AUTO) select((sel + 1) % FOCUS.length, false); }
    bars.forEach((b, i) => b.style.transform = `scaleX(${i === sel && !manual ? clamp(autoT/AUTO) : 0})`);
    drag.y = lerp(drag.y, drag.ty, k*.7); drag.p = lerp(drag.p, drag.tp, k*.7);

    // focus weights: the selected step's part is highlighted, the rest is ghosted
    let fmax = 0, fi = -1;
    FOCUS.forEach((_, i) => { const w = cur.exp > .9 && i === sel ? 1 : 0; focusW[i] = lerp(focusW[i], w, k*.6); if (focusW[i] > fmax){ fmax = focusW[i]; fi = i; } });
    const storV = Math.max(focusW[3], 0);

    // size: fit the device (assembled ↔ exploded extents) inside the anchor box
    const e = ease(clamp(cur.exp));
    const devH = lerp(sA.y, sE.y, e), devW = lerp(Math.max(sA.x, sA.z), sE.x, e);
    let s = Math.min(cur.h*wpp()/devH, cur.w*wpp()/devW*1.0);
    const zoom = 1 + .1*fmax; s *= zoom;
    const vis = ease(clamp(cur.vis));
    dev.scale.setScalar(Math.max(.0001, s*(.6 + .4*vis)));
    dev.visible = vis > .01;
    inner.position.copy(cA).lerp(cE, e).multiplyScalar(-1);

    // place
    let wx = (cur.x - innerWidth/2)*wpp(), wy = -(cur.y - innerHeight/2)*wpp() - (1 - vis)*40;
    // drift the focused part toward the middle of the anchor
    if (fi >= 0 && fmax > .01){
      const fp = new THREE.Vector3(); FOCUS[fi].forEach(n => fp.add(tmp.copy(byName[n].center).add(byName[n].exp))); fp.multiplyScalar(1/FOCUS[fi].length).add(inner.position);
      wx -= fp.x*s*.3*fmax; wy -= fp.y*s*.3*fmax;
    }
    dev.position.set(wx, wy, 0);
    const yaw = -Math.PI/2 + cur.rot + drag.y + (reduce ? 0 : cur.sway*.22*Math.sin(t*.45)) + (fmax > .01 && fi === 3 ? .9*focusW[3] : 0);
    dev.rotation.set(drag.p, yaw, 0);

    // parts: explode offsets, cap on/off, storage cap only at its stop
    parts.forEach(p => {
      let target = p.d.f ? 1 : storV;
      if (p.name === 'V12_CAPUCHON') target *= clamp(cur.cap) * (1 - storV);
      p.vis = lerp(p.vis, target, k);
      p.mesh.visible = p.vis > .01;
      p.mesh.scale.setScalar(.001 + .999*ease(clamp(p.vis)));
      const lift = p.name === 'V12_CAPUCHON' ? (1 - clamp(cur.cap))*60 : 0;
      if (p.d.f) p.mesh.position.copy(p.center).addScaledVector(p.exp, e);
      else p.mesh.position.copy(p.center).add(p.asm).add(p.exp);
      p.mesh.position.y += lift;
      // ghost the parts that are not in focus
      const mine = fi >= 0 && FOCUS[fi].includes(p.name);
      p.g = lerp(p.g, fmax > .02 && !mine ? fmax : 0, k);
      const gh = p.g > .5;
      p.mesh.material = gh ? p.ghost : p.look;
      p.ghost.uniforms.uOpacity.value = .3;
      p.mesh.children.forEach(ch => ch.visible = !gh && (ch !== p.cap || (cur.cut > .05 && p.d.look !== 'clear')));
    });
    if (milkCore) milkCore.visible = teat.mesh.material === teat.look;

    // section cut
    const cutE = ease(clamp(cur.cut));
    clipPlane.constant = cutE < .002 ? 1e4 : lerp(260*s, -1, cutE);

    // milk and feed
    deformPouch(cur.ml);
    let squeeze = 0, open = 0;
    if (cur.feed > .5 && !reduce){
      phase = (phase + dt/1.3) % 1;
      if (phase < .45) squeeze = Math.sin(phase/.45*Math.PI); else open = Math.sin((phase - .45)/.55*Math.PI);
      dropT -= dt; if (squeeze > .45 && dropT <= 0){ dropT = .08; spawnDrop(s); }
    }
    deformTeat(squeeze*clamp(cur.feed)); deformValve(open*clamp(cur.feed));
    drops.forEach(d => { if (d.life <= 0) return; d.life -= dt/.9; d.v.y -= 40*s*dt; d.m.position.addScaledVector(d.v, dt); d.m.scale.setScalar(s*Math.max(.01, Math.sin(clamp(d.life)*Math.PI))); d.m.material.opacity = clamp(d.life*2); if (d.life <= 0) d.m.visible = false; });


    // shadow under the device
    dev.updateMatrixWorld();
    const bottom = new THREE.Box3().setFromObject(byName.V12_FOND.mesh);
    shadow.position.set(dev.position.x, bottom.min.y - 6*s, -40);
    shadow.scale.set(150*s, 26*s, 1);
    shadow.material.opacity = .55 * vis * (1 - ease(clamp(cur.flip))) * (1 - e) * (1 - cutE*.4);
    shadow.visible = shadow.material.opacity > .01;

    // numbered pin beside the highlighted part (same numbers as the steps)
    if (fi >= 0 && fmax > .3 && onScreen){
      const fp = new THREE.Vector3(); FOCUS[fi].forEach(n => { byName[n].mesh.getWorldPosition(tmp); fp.add(tmp); }); fp.multiplyScalar(1/FOCUS[fi].length).project(camera);
      const off = Math.max(...FOCUS[fi].map(n => byName[n].size.x))/2*s/wpp() + 26;
      pin.style.transform = `translate(${(fp.x*.5 + .5)*innerWidth - r.left + off}px, ${(-fp.y*.5 + .5)*innerHeight - r.top}px)`;
      if (pin.textContent !== (fi + 1) + '.') pin.textContent = (fi + 1) + '.';
      pin.style.opacity = clamp((fmax - .3)/.4);
    } else pin.style.opacity = 0;

    // draw only inside the viewer panel, so the section stays self-contained
    renderer.setScissorTest(false); renderer.clear();
    if (onScreen){ renderer.setScissorTest(true); renderer.setScissor(r.left, innerHeight - r.bottom, r.width, r.height); renderer.render(scene, camera); }
    requestAnimationFrame(frame);
  }
  function spawnDrop(s){
    const d = drops.find(d => d.life <= 0); if (!d) return;
    teat.mesh.localToWorld(d.m.position.set(0, teat.size.y/2 + 3, 0));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(dev.quaternion);
    d.v.copy(up).multiplyScalar((30 + Math.random()*16)*s).add(new THREE.Vector3((Math.random() - .5)*14*s, 0, (Math.random() - .5)*14*s));
    d.life = 1; d.m.visible = true;
  }

  let rT = 0;
  const relayout = () => { clearTimeout(rT); rT = setTimeout(() => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); }, 80); };
  addEventListener('resize', relayout); addEventListener('copychange', relayout); addEventListener('load', relayout);
  new ResizeObserver(relayout).observe(document.body);
  if (lenis){ const raf = time => { lenis.raf(time); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
  requestAnimationFrame(frame);
  window.__story = { byName, cur, select };
})().catch(err => { console.error(err); });
