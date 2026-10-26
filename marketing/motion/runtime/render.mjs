#!/usr/bin/env node
// render.mjs — seek every frame of a hand.js composition in headless Chromium,
// encode for X, then run the slop linter and write a contact sheet.
//   node render.mjs comp.html [--sizes 1920x1080,1080x1080,1080x1350] [--fps 30] [--out dir] [--workers n] [--strict] [--draft]
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { resolve, basename, join } from 'node:path';
import { mkdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const valued = ['--sizes', '--fps', '--out', '--workers'];
const comp = resolve(argv.find((a, i) => !a.startsWith('--') && !valued.includes(argv[i - 1])) || 'index.html');
const fps = +opt('fps', 30);
const sizes = opt('sizes', '1920x1080,1080x1080').split(',').map((s) => s.split('x').map(Number));
const outDir = resolve(opt('out', 'out'));
const draft = argv.includes('--draft'), strict = argv.includes('--strict');
mkdirSync(outDir, { recursive: true });
const name = basename(comp).replace(/\.html?$/, '');

const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'] });
let failed = false;

const workers = +opt('workers', Math.max(1, Math.min(4, os.cpus().length - 1)));
const x264 = (o) => ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'slow',
  '-crf', draft ? '22' : '16', '-profile:v', 'high', '-level', '4.2', '-g', String(fps * 2), '-bf', '2',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', ...o];

for (const [W, Hh] of sizes) {
  const tag = `${name}-${W}x${Hh}`, out = join(outDir, tag + '.mp4');
  const url = `${pathToFileURL(comp)}?w=${W}&h=${Hh}&fps=${fps}&render=1`;
  const errors = [], seen = {}; let frame0 = null, marks = [], info;
  const open = async () => {
    const page = await browser.newPage({ viewport: { width: W, height: Hh }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    info = await page.evaluate(() => window.__ready);
    return page;
  };
  const first = await open();
  const audit = await first.evaluate(() => H.audit());
  const N = Math.round(info.duration * fps), chunk = Math.ceil(N / workers);
  process.stdout.write(`${tag}: ${N} frames × ${workers} workers `);
  // Each worker seeks its own range of frames in its own tab and encodes a segment.
  // Lossless PNG for finals, near-lossless JPEG for drafts.
  const segs = await Promise.all([...Array(workers)].map(async (_, w) => {
    const a = w * chunk, b = Math.min(N, a + chunk); if (a >= b) return null;
    const page = w === 0 ? first : await open();
    const cdp = await page.context().newCDPSession(page);
    const seg = join(outDir, `.${tag}.${w}.mp4`);
    // bt709 matrix + tags: without them RGB→YUV uses bt601 and every color shifts on phones.
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', ...x264([seg])], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = a; f < b; f++) {
      const probe = await page.evaluate(([t, p]) => window.__frame(t, p), [f / fps, f % 2 === 0]);
      if (probe) {
        if (f === 0) frame0 = probe;
        for (const p of probe) {
          const s = (seen[p.id] ||= { id: p.id, words: p.words, vis: 0, edge: 0, minFont: Infinity });
          const inFrame = p.x > -2 && p.y > -2 && p.x + p.w < W + 2 && p.y + p.h < Hh + 2;
          if (p.op > 0.85 && inFrame && p.w > 0) {
            s.vis += 2 / fps;
            s.minFont = Math.min(s.minFont, p.fontPx);
            const m = Math.min(W, Hh) * 0.045; // keep 4.5% clear of edges (X UI chrome + crops)
            if (p.x < m || p.y < m || p.x + p.w > W - m || p.y + p.h > Hh - m) s.edge += 2 / fps;
          }
        }
      }
      const shot = await cdp.send('Page.captureScreenshot', draft ? { format: 'jpeg', quality: 92, optimizeForSpeed: true } : { format: 'png', optimizeForSpeed: true });
      if (!ff.stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      if ((f - a) % fps === 0) process.stdout.write('.');
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    if (w === 0) marks = await page.evaluate(() => window.__marks());
    await page.close();
    return seg;
  }));
  const list = join(outDir, `.${tag}.txt`);
  writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
  execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i "${list}" -f lavfi -i anullsrc=r=48000:cl=stereo -shortest -c:v copy -c:a aac -b:a 128k -movflags +faststart "${out}"`);
  for (const s of [...segs.filter(Boolean), list]) unlinkSync(s);

  // ---------- slop linter ----------
  const issues = [], warn = (sev, rule, msg) => issues.push({ sev, rule, msg });
  if (errors.length) warn('fail', 'page-error', errors.join(' | '));
  const short = Math.min(W, Hh);
  if (!frame0 || !frame0.some((p) => p.op > 0.85)) warn('fail', 'cold-open', 'Frame 0 shows no readable text. X autoplays muted and frame 0 is the thumbnail: open on the hook, already composed.');
  for (const s of Object.values(seen)) {
    const need = 0.5 + s.words * 0.3;
    if (s.vis < need) warn('fail', 'read-time', `"${s.id}" is fully readable for ${s.vis.toFixed(2)}s; ${s.words} words need ≥ ${need.toFixed(1)}s.`);
    if (s.edge > 0.3) warn('warn', 'safe-area', `"${s.id}" sits within 4.5% of the frame edge for ${s.edge.toFixed(1)}s.`);
    if (s.minFont < short * 0.032) warn('warn', 'tiny-type', `"${s.id}" is ${Math.round(s.minFont)}px; below ${Math.round(short * 0.032)}px it is unreadable in a phone feed.`);
  }
  const generic = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Open Sans', 'Arial', 'Helvetica', 'system-ui', '-apple-system', 'sans-serif'];
  for (const f of audit.fonts) if (generic.includes(f)) warn('warn', 'default-font', `"${f}" on readable copy is the default-AI look. Use the brand face or a characterful display face.`);
  if (audit.gradients.length) warn('warn', 'ai-gradient', `Blue→purple gradient on ${audit.gradients.slice(0, 3).join(', ')}. Use the brand's flat colors and texture instead.`);
  if (marks.length >= 4) {
    const byEase = {}; marks.forEach((m) => (byEase[m.ease] = (byEase[m.ease] || 0) + 1));
    const [topEase, topN] = Object.entries(byEase).sort((a, b) => b[1] - a[1])[0];
    if (topN / marks.length > 0.6) warn('warn', 'ease-monoculture', `${topN}/${marks.length} moves use "${topEase}". Give arrivals, exits, camera and ink different curves.`);
    const durs = marks.map((m) => m.dur), mean = durs.reduce((a, b) => a + b) / durs.length;
    const cv = Math.sqrt(durs.reduce((a, d) => a + (d - mean) ** 2, 0) / durs.length) / mean;
    if (cv < 0.25) warn('warn', 'metronome', `Move durations barely vary (cv ${cv.toFixed(2)}). Mix quick snaps (0.2s) with slow settles (1s+).`);
    const starts = {}; marks.forEach((m) => { const k = Math.round(m.start * fps); starts[k] = (starts[k] || 0) + 1; });
    const pile = Object.entries(starts).find(([, n]) => n >= 3);
    if (pile) warn('warn', 'unison', `${pile[1]} moves start on frame ${pile[0]}. Offset them by 2–4 frames so the eye is led, not flooded.`);
    const dirs = marks.filter((m) => m.from).map((m) => m.from);
    if (dirs.length >= 3 && dirs.every((d) => d === dirs[0])) warn('warn', 'same-entrance', `Every entrance comes from "${dirs[0]}". Vary the verb: draw on, stamp, slide, type, cut.`);
    let covered = 0; for (let f = 0; f < N; f++) { const t = f / fps; if (marks.some((m) => m.kind !== 'camera' && t >= m.start && t <= m.start + m.dur)) covered++; }
    if (covered / N > 0.88) warn('warn', 'no-rest', `Something moves in ${Math.round((covered / N) * 100)}% of frames. Let key frames hold so they can be read.`);
  }
  if (info.duration > 140) warn('fail', 'x-length', 'Over 2:20, X will reject this for most accounts.');
  const mb = statSync(out).size / 1e6;
  if (mb > 512) warn('fail', 'x-size', `${mb.toFixed(0)}MB exceeds X's 512MB cap.`);

  // contact sheet: 12 evenly spaced frames, for the visual self-review
  const sheet = join(outDir, tag + '-sheet.png'), poster = join(outDir, tag + '-frame0.png');
  execSync(`ffmpeg -y -loglevel error -i "${out}" -vf "fps=12/${info.duration},scale=${W >= Hh ? 480 : 320}:-1,tile=4x3:padding=6:color=white" -frames:v 1 "${sheet}"`);
  execSync(`ffmpeg -y -loglevel error -i "${out}" -frames:v 1 "${poster}"`);
  writeFileSync(join(outDir, tag + '.report.json'), JSON.stringify({ out, W, H: Hh, fps, duration: info.duration, mb: +mb.toFixed(2), issues, marks, text: Object.values(seen) }, null, 2));
  console.log(` ${mb.toFixed(1)}MB`);
  if (!issues.length) console.log('  ✓ slop linter: clean');
  for (const i of issues) console.log(`  ${i.sev === 'fail' ? '✗' : '!'} [${i.rule}] ${i.msg}`);
  console.log(`  sheet: ${sheet}`);
  if (issues.some((i) => i.sev === 'fail') || (strict && issues.length)) failed = true;
}
await browser.close();
process.exit(failed ? 1 : 0);
