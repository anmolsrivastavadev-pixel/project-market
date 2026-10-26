/* hand.js — frame-pure motion runtime with a craft layer.
   Every visual is a pure function of time t (seconds). No CSS animations,
   no Date.now(), no Math.random(): the same t always paints the same frame. */
(function () {
  const H = (window.H = {});
  const q = new URLSearchParams(location.search);
  H.W = +q.get('w') || 1920;
  H.H = +q.get('h') || 1080;
  H.fps = +q.get('fps') || 30;
  H.rendering = q.has('render');
  H.u = Math.min(H.W, H.H) / 100; // 1u = 1% of the short side
  const ar = H.W / H.H;
  H.format = ar > 1.3 ? 'wide' : ar > 0.95 ? 'square' : 'tall';
  H.duration = 8;
  H.marks = {};

  const root = document.documentElement;
  root.classList.add('fmt-' + H.format);
  root.style.setProperty('--W', H.W + 'px');
  root.style.setProperty('--H', H.H + 'px');
  root.style.setProperty('--u', H.u + 'px');

  /* ---------- math ---------- */
  H.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  H.lerp = (a, b, p) => a + (b - a) * p;
  H.prog = (t, start, dur) => H.clamp((t - start) / dur);
  const hash = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  H.rng = (seed) => { let a = hash(seed); return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const lat = (i, seed) => (hash(seed + ':' + i) / 4294967296) * 2 - 1;
  H.noise = (x, seed = 0) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return H.lerp(lat(i, seed), lat(i + 1, seed), s); };

  /* ---------- easing: a vocabulary, not a default ---------- */
  H.bezier = (x1, y1, x2, y2) => {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t, dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x; for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-5) break; t -= e / (dx(t) || 1e-6); } return sy(H.clamp(t)); };
  };
  H.ease = {
    linear: (p) => p,
    snap: H.bezier(0.2, 0.9, 0.1, 1),        // decisive arrival, long settle
    glide: H.bezier(0.45, 0, 0.2, 1),        // camera-ish, weighted both ends
    exit: H.bezier(0.55, 0, 1, 0.45),        // leaves fast, no settle
    ink: H.bezier(0.55, 0.05, 0.25, 1),      // pen: slow touch-down, fast pull, lift
    lazy: H.bezier(0.3, 0.1, 0.3, 1),        // secondary elements that trail
  };
  for (const k in H.ease) H.ease[k].id = k;
  // damped spring, closed form. Returns 0→1 with real overshoot.
  H.spring = (t, { k = 170, c = 14, m = 1 } = {}) => {
    if (t <= 0) return 0;
    const w = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m));
    if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  };

  /* ---------- timeline marks (read by the slop linter) ---------- */
  // anim(): eased progress for a named move, and it registers the move.
  H.anim = (name, t, start, dur, ease = 'snap', meta = {}) => {
    const fn = typeof ease === 'function' ? ease : H.ease[ease];
    if (!H.marks[name]) H.marks[name] = { name, start, dur, ease: fn.id || ease.name || 'custom', ...meta };
    return fn(H.prog(t, start, dur));
  };
  H.springAnim = (name, t, start, opts = {}, meta = {}) => {
    if (!H.marks[name]) H.marks[name] = { name, start, dur: opts.dur || 0.8, ease: `spring(${opts.k || 170},${opts.c || 14})`, ...meta };
    return H.spring(t - start, opts);
  };

  /* ---------- hand time ---------- */
  // Step time on twos/threes: hand-drawn layers update at 12 or 8 fps
  // while the camera and type stay smooth at full fps. The contrast reads as craft.
  H.twos = (t, n = 2) => Math.floor((t * H.fps) / n) * (n / H.fps);
  H.drawing = (t, n = 2, cycle = 3) => Math.floor((t * H.fps) / n) % cycle; // which of 3 "drawings"

  /* ---------- SVG defs: boil, ink edge, paper ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  H.svg = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); if (parent) parent.appendChild(e); return e; };
  function installDefs() {
    const s = H.svg('svg', { width: 0, height: 0, style: 'position:absolute' });
    const d = H.svg('defs', {}, s);
    // Filter regions are generous: a near-horizontal stroke has a tiny bbox and would be clipped.
    const region = { x: '-25%', y: '-300%', width: '150%', height: '700%' };
    for (let i = 0; i < 3; i++) {
      // line boil: three slightly different drawings cycled on twos, plus pen tooth
      const f = H.svg('filter', { id: 'boil-' + i, ...region }, d);
      H.svg('feTurbulence', { type: 'fractalNoise', baseFrequency: (0.022 * 10.8) / H.u, numOctaves: 2, seed: 7 + i * 13, result: 'n' }, f);
      H.svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: H.u * 0.32, xChannelSelector: 'R', yChannelSelector: 'G', result: 'b' }, f);
      H.svg('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.8, numOctaves: 1, seed: 3 + i, result: 'n2' }, f);
      H.svg('feDisplacementMap', { in: 'b', in2: 'n2', scale: H.u * 0.1, xChannelSelector: 'R', yChannelSelector: 'G' }, f);
    }
    // ink edge alone: high-frequency tooth so strokes aren't vector-clean
    const ink = H.svg('filter', { id: 'ink', ...region }, d);
    H.svg('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.8, numOctaves: 1, seed: 3, result: 'n' }, ink);
    H.svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: H.u * 0.12, xChannelSelector: 'R', yChannelSelector: 'G' }, ink);
    document.body.prepend(s);
  }
  H.boil = (el, t, n = 2) => { el.style.filter = `url(#boil-${H.drawing(t, n)})`; };

  /* ---------- hand-drawn strokes ---------- */
  const catmull = (pts) => {
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  };
  // A line a person would draw: wobble, slight bow, never pixel-straight.
  H.line = (a, b, { seed = 'l', wobble = 0.35, bow = 0.6, steps = 6 } = {}) => {
    const r = H.rng(seed), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    const bowAmt = (r() - 0.5) * 2 * bow * H.u, pts = [];
    for (let i = 0; i <= steps; i++) {
      const p = i / steps, off = Math.sin(p * Math.PI) * bowAmt + (i && i < steps ? (r() - 0.5) * wobble * H.u : 0);
      pts.push([a[0] + dx * p + nx * off, a[1] + dy * p + ny * off]);
    }
    return catmull(pts);
  };
  // Circling something in pen: overshoots the start, drifts, slightly tilted.
  H.scribbleCircle = (cx, cy, rx, ry, { seed = 'c', turns = 1.18, tilt = -6 } = {}) => {
    const r = H.rng(seed), a0 = -2.2 + r() * 0.6, n = 34, pts = [], tr = (tilt * Math.PI) / 180;
    for (let i = 0; i <= n; i++) {
      const p = i / n, a = a0 + p * Math.PI * 2 * turns, wob = 1 + H.noise(p * 5, seed) * 0.07, drift = p * 0.09;
      const x = Math.cos(a) * rx * (wob + drift), y = Math.sin(a) * ry * (wob - drift * 0.5);
      pts.push([cx + x * Math.cos(tr) - y * Math.sin(tr), cy + x * Math.sin(tr) + y * Math.cos(tr)]);
    }
    return catmull(pts);
  };
  // Arrow with a curved shaft and two unequal head strokes.
  H.arrow = (a, b, { seed = 'a', bend = 0.22 } = {}) => {
    const r = H.rng(seed), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const mid = [(a[0] + b[0]) / 2 - (dy / len) * len * bend, (a[1] + b[1]) / 2 + (dx / len) * len * bend], pts = [];
    for (let i = 0; i <= 10; i++) { const p = i / 10, q2 = 1 - p; pts.push([q2 * q2 * a[0] + 2 * q2 * p * mid[0] + p * p * b[0] + (i && i < 10 ? (r() - 0.5) * 0.3 * H.u : 0), q2 * q2 * a[1] + 2 * q2 * p * mid[1] + p * p * b[1]]); }
    const ang = Math.atan2(b[1] - mid[1], b[0] - mid[0]), h1 = H.u * (3.2 + r()), h2 = H.u * (2.6 + r());
    const head = (s, L) => H.line(b, [b[0] - Math.cos(ang + s) * L, b[1] - Math.sin(ang + s) * L], { seed: seed + s, bow: 0.15, steps: 3 });
    return { shaft: catmull(pts), head1: head(0.5, h1), head2: head(-0.42, h2) };
  };
  // Reveal a path like a pen drawing it.
  H.draw = (path, p) => {
    if (!path._len) { path._len = path.getTotalLength() + 2; path.style.strokeDasharray = path._len; }
    path.style.strokeDashoffset = path._len * (1 - H.clamp(p));
    path.style.opacity = p > 0 ? 1 : 0;
  };

  // Reveal handwriting left→right like a pen moving (pair with H.boil on threes).
  H.write = (el, p) => {
    el.style.visibility = p > 0 ? 'visible' : 'hidden';
    el.style.clipPath = `inset(-30% ${((1 - H.clamp(p)) * 100).toFixed(2)}% -30% -5%)`;
  };

  /* ---------- type ---------- */
  H.split = (el) => {
    if (el._chars) return el._chars;
    const out = [];
    const walk = (node) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const w of n.textContent.split(/(\s+)/)) {
            if (!w) continue;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); continue; }
            const word = document.createElement('span'); word.style.display = 'inline-block'; word.style.whiteSpace = 'nowrap';
            for (const ch of w) { const c = document.createElement('span'); c.textContent = ch; c.style.display = 'inline-block'; word.appendChild(c); out.push(c); }
            frag.appendChild(word);
          }
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(el);
    return (el._chars = out);
  };
  // Letters set by hand: jittered stagger, each lands with its own tiny tilt.
  H.typeIn = (name, el, t, start, { stagger = 0.028, dur = 0.7, seed = name, dy = 0.42, rot = 7, settle = 0.5, k = 210, c = 17 } = {}) => {
    const chars = H.split(el), r = H.rng(seed);
    if (!H.marks[name]) H.marks[name] = { name, start, dur: dur + stagger * chars.length, ease: `spring(${k},${c})`, kind: 'type', from: 'below' };
    let acc = start;
    chars.forEach((ch, i) => {
      const jit = 0.55 + r() * 0.9, tiltEnd = (r() - 0.5) * settle, tiltStart = (r() - 0.5) * 2 * rot;
      const p = H.spring(t - acc, { k, c }), o = H.clamp((t - acc) / 0.12);
      ch.style.opacity = o;
      ch.style.transform = `translateY(${((1 - p) * dy).toFixed(3)}em) rotate(${H.lerp(tiltStart, tiltEnd, H.clamp(p)).toFixed(2)}deg)`;
      acc += stagger * jit * (/\s/.test(ch.textContent) ? 2 : 1);
    });
  };

  /* ---------- camera ---------- */
  // An operator's hands: low-frequency drift + optional impulse shake.
  H.handheld = (t, { amp = 0.35, rot = 0.12, seed = 'cam', speed = 0.35 } = {}) => {
    const x = H.noise(t * speed, seed + 'x') * amp * H.u, y = H.noise(t * speed * 0.8, seed + 'y') * amp * H.u, r = H.noise(t * speed * 0.6, seed + 'r') * rot;
    return `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg)`;
  };
  H.impact = (t, at, { amp = 0.6, decay = 18, freq = 38 } = {}) => {
    const d = t - at; if (d < 0) return { x: 0, y: 0 };
    const e = Math.exp(-decay * d) * amp * H.u;
    return { x: Math.sin(d * freq) * e, y: Math.cos(d * freq * 1.3) * e * 0.7 };
  };

  /* ---------- print artifacts ---------- */
  // Misregistration: a second ink plate slightly off, re-registered on twos.
  H.misreg = (el, t, { color = 'rgba(210,69,43,.55)', amt = 0.18, seed = 'mr' } = {}) => {
    const r = H.rng(seed + H.drawing(t, 2, 4)), a = r() * Math.PI * 2, d = amt * H.u * (0.6 + r() * 0.4);
    el.style.textShadow = `${(Math.cos(a) * d).toFixed(2)}px ${(Math.sin(a) * d).toFixed(2)}px 0 ${color}`;
  };

  /* ---------- grain + paper overlays ---------- */
  function noiseTile(seed, size, contrast, base = 128) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), img = x.createImageData(size, size), r = H.rng(seed);
    for (let i = 0; i < img.data.length; i += 4) { const v = base + (r() - 0.5) * contrast; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0); return c.toDataURL();
  }
  let grainEl, grainTiles;
  function installOverlays(opts) {
    const st = document.getElementById('stage');
    if (opts.paper !== false) {
      const p = document.createElement('div');
      p.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:50;mix-blend-mode:multiply;opacity:${opts.paperOpacity ?? 0.6};background-image:url(${noiseTile('paper', 512, 36, 238)});background-size:${H.u * 30}px;filter:blur(${H.u * 0.05}px)`;
      st.appendChild(p);
      const v = document.createElement('div'); // light falloff, like a sheet under a desk lamp
      v.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:51;background:radial-gradient(120% 90% at 42% 38%,rgba(0,0,0,0) 55%,rgba(40,25,10,${opts.vignette ?? 0.16}) 100%)`;
      st.appendChild(v);
    }
    grainTiles = [0, 1, 2].map((i) => noiseTile('g' + i, 256, opts.grain ?? 70));
    grainEl = document.createElement('div');
    grainEl.style.cssText = `position:absolute;inset:-10%;pointer-events:none;z-index:60;mix-blend-mode:soft-light;opacity:${opts.grainOpacity ?? 0.5};background-size:${Math.round(H.u * 12)}px`;
    st.appendChild(grainEl);
  }
  function paintGrain(t) {
    if (!grainEl) return;
    const k = Math.floor((t * H.fps) / 2), r = H.rng('gp' + k);
    grainEl.style.backgroundImage = `url(${grainTiles[k % 3]})`;
    grainEl.style.backgroundPosition = `${Math.round(r() * 256)}px ${Math.round(r() * 256)}px`;
  }

  /* ---------- probe (for the linter) ---------- */
  H.probe = () => [...document.querySelectorAll('[data-text]')].map((el) => {
    let o = getComputedStyle(el).visibility === 'hidden' ? 0 : 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity;
    if (el._chars) o *= Math.min(...el._chars.map((c) => +c.style.opacity || 0)); // split text: wait for the last letter
    const r = el.getBoundingClientRect();
    return { id: el.dataset.text, words: el.textContent.trim().split(/\s+/).length, op: +o.toFixed(2), x: r.x, y: r.y, w: r.width, h: r.height, fontPx: parseFloat(getComputedStyle(el).fontSize) };
  });

  // Static audit for the linter: default fonts and the "AI gradient" look.
  H.audit = () => {
    const hue = (r, g, b) => { r /= 255; g /= 255; b /= 255; const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m; if (!d || M < 0.15) return -1; const h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
    const fonts = [...new Set([...document.querySelectorAll('[data-text]')].map((el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()))];
    const gradients = [];
    for (const el of [document.documentElement, document.body, ...document.body.querySelectorAll('*')]) {
      const bg = getComputedStyle(el).backgroundImage;
      if (!/gradient/.test(bg) || /radial-gradient\(120% 90%/.test(bg)) continue;
      const hs = [...bg.matchAll(/rgba?\((\d+), (\d+), (\d+)/g)].map((m) => hue(+m[1], +m[2], +m[3])).filter((h) => h >= 0);
      if (hs.filter((h) => h >= 215 && h <= 300).length >= 2) gradients.push(el.id || el.className || el.tagName);
    }
    return { fonts, gradients };
  };

  /* ---------- composition contract ---------- */
  // H.compose({ duration, setup(), scene(t), paper, grain })
  H.compose = (def) => {
    H.duration = def.duration;
    window.__ready = (async () => {
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      installDefs();
      installOverlays(def);
      if (def.setup) def.setup();
      def.scene(0); paintGrain(0);
      return { duration: def.duration, W: H.W, H: H.H, fps: H.fps };
    })();
    window.__frame = (t, probe) => { H.t = t; def.scene(t); paintGrain(t); return probe ? H.probe() : null; };
    window.__marks = () => Object.values(H.marks);
    if (!H.rendering) window.__ready.then(() => { // browser preview: loop, space pauses, ←/→ steps a frame
      let t0 = performance.now(), paused = false, t = 0;
      addEventListener('keydown', (e) => { if (e.code === 'Space') { paused = !paused; t0 = performance.now() - t * 1000; } if (e.code === 'ArrowRight') t += 1 / H.fps; if (e.code === 'ArrowLeft') t = Math.max(0, t - 1 / H.fps); });
      const loop = () => { if (!paused) t = ((performance.now() - t0) / 1000) % def.duration; t = Math.round(t * H.fps) / H.fps; window.__frame(t); requestAnimationFrame(loop); };
      loop();
    });
  };
})();
