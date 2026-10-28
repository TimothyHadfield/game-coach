// The coach in real browsers (WebKit for phones, Chromium for laptops), one browser at a time.
//   node test/coach-ui.mjs http://127.0.0.1:PORT/.../demo.html [--shots dir]
// Each size walks the demo tour: the bubble stays on screen and off its target, the ring sits on the
// target; Back/Next/Skip work; a waiting step moves on by itself; the tour comes back after a reload;
// the offer shows once; the rules sheet is readable (15 px+ text, no sideways scroll) and closes with Esc;
// reduced motion turns the animations off. No console errors.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(join(homedir(), '.claude/tools/') + 'x.js');
const pw = require('playwright');

const args = process.argv.slice(2);
const url = args.find(a => a.startsWith('http'));
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const SIZES = [
  ['320x568', 'webkit', 320, 568, true], ['393x659', 'webkit', 393, 659, true], ['659x393', 'webkit', 659, 393, true],
  ['1280x800', 'chromium', 1280, 800, false], ['1440x900', 'chromium', 1440, 900, false],
];
const geo = () => {
  const b = document.querySelector('.coach-bubble'), r = document.querySelector('.coach-ring');
  if (!b) return null;
  const bb = b.getBoundingClientRect(), rr = r && r.style.display !== 'none' ? r.getBoundingClientRect() : null;
  const tx = b.querySelector('.coach-text'), lh = parseFloat(getComputedStyle(tx).lineHeight) || 21;
  const read = b.scrollHeight - tx.offsetHeight + Math.min(tx.offsetHeight, 2 * lh);   // title + 2 lines + buttons
  const room = rr ? Math.max(rr.top - 18, innerHeight - rr.bottom - 18) : innerHeight;
  return { b: { l: bb.left, t: bb.top, r: bb.right, bt: bb.bottom }, ring: rr && { l: rr.left, t: rr.top, r: rr.right, bt: rr.bottom }, vw: innerWidth, vh: innerHeight, side: b.dataset.side, idx: window.__T.index, text: b.textContent,
    // ...and the buttons are whole inside the note, and the text shows at least 2 lines (or all of it)
    read, room, readable: b.clientHeight >= Math.min(b.scrollHeight, read) - 1 && b.querySelector('.coach-row').getBoundingClientRect().bottom <= bb.bottom + 0.5
      && tx.clientHeight >= Math.min(tx.scrollHeight, 2 * lh) - 1 };
};
for (const [name, eng, w, h, mobile] of SIZES) {
  const browser = await pw[eng].launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile && eng !== 'webkit' ? true : undefined, hasTouch: mobile, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(url); await page.waitForTimeout(300);
    check(await page.locator('.coach-offer').count() === 1, `${name}: first visit shows the offer`);
    if (shots) await page.screenshot({ path: `${shots}/${name}-offer.png` });
    // 1.2.0: place 'auto' keeps the card off the bottom tab bar and off the avoided Play button, on screen
    const og = await page.evaluate(() => {
      const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const o = document.querySelector('.coach-offer'), b = o.getBoundingClientRect();
      // measure from the computed position (the slide-in may still be moving the box)
      const cs = getComputedStyle(o), h = o.offsetHeight;
      const top = cs.top !== 'auto' && o.style.top !== 'auto' ? parseFloat(cs.top) : innerHeight - parseFloat(cs.bottom) - h;
      return { o: { l: b.left, t: top, r: b.right, b: top + h }, tabs: r('.tabs'), go: r('#go'), vh: innerHeight, vw: innerWidth, place: o.dataset.place };
    });
    const hits = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    check(!hits(og.o, og.tabs) && !hits(og.o, og.go) && og.o.t >= 0 && og.o.b <= og.vh + 0.5,
      `${name}: the offer covers neither the tab bar nor the Play button (${og.place}: ${Math.round(og.o.t)}-${Math.round(og.o.b)}, tabs from ${Math.round(og.tabs.t)}, Play ${Math.round(og.go.t)}-${Math.round(og.go.b)})`);
    await page.click('.coach-offer [data-o="yes"]'); await page.waitForTimeout(250);
    let bad = 0, steps = 0, sawTall = false;
    for (let k = 0; k < 12; k++) {
      await page.waitForTimeout(150);
      const g = await page.evaluate(geo);
      if (!g) break;
      steps++;
      const on = g.b.l >= -0.5 && g.b.t >= -0.5 && g.b.r <= g.vw + 0.5 && g.b.bt <= g.vh + 0.5;
      const coverPx = g.ring && g.b.l < g.ring.r && g.b.r > g.ring.l ? Math.max(0, Math.min(g.b.bt, g.ring.bt) - Math.max(g.b.t, g.ring.t)) : 0;
      // only a target that leaves no readable room may be overlapped, and only at its edge, by what is missing
      const cover = coverPx > 0 && !(g.side === 'over' && coverPx <= Math.max(0, g.read - g.room) + 2);
      // readable: the title, at least 2 lines of text (or all of it) and the buttons show without scrolling
      if (!on || cover || !g.readable) { bad++; console.log('   step', g.idx, JSON.stringify(g)); }
      if (g.idx === 7) {
        sawTall = true;
        check(g.readable, `${name}: a tall target still gets a readable note (${Math.round(g.b.bt - g.b.t)} px tall, needs ${Math.round(g.read)})`);
        if (shots) await page.screenshot({ path: `${shots}/${name}-tall.png` });
      }
      if (shots && (k === 2 || k === 4)) await page.screenshot({ path: `${shots}/${name}-step${k}.png` });
      if (g.idx === 5) {                       // waits for the Play tap: there is no Next button
        check(await page.locator('.coach-bubble [data-coach="next"]').count() === 0, `${name}: a waiting step has no Next`);
        await page.click('#go');
        continue;
      }
      if (g.idx === 3 && k === 3) {            // Back once, then forward again
        await page.click('.coach-bubble [data-coach="back"]'); await page.waitForTimeout(120);
        check((await page.evaluate(() => window.__T.index)) === 2, `${name}: Back goes to the step before`);
      }
      if (g.idx === 4) {                       // reload in the middle: the tour comes back at the same step
        await page.reload(); await page.waitForTimeout(400);
        check((await page.evaluate(() => window.__T.active && window.__T.index)) === 4, `${name}: the tour resumes after a reload`);
        check(await page.locator('.coach-offer').count() === 0, `${name}: the offer is not shown again`);
      }
      await page.click('.coach-bubble [data-coach="next"]');
    }
    check(sawTall, `${name}: the tall-target step was shown`);
    check(steps >= 8 && bad === 0,`${name}: bubble on screen and off the target at every step (${steps} steps, ${bad} bad)`);
    check(await page.evaluate(() => !window.__T.active && window.__T.seen()), `${name}: Done ends the tour`);
    // Skip
    await page.evaluate(() => { window.__T.reset(); window.__T.start(); });
    await page.click('.coach-bubble [data-coach="skip"]');
    check(await page.locator('.coach-layer').count() === 0, `${name}: Skip removes the overlay`);
    // rules sheet
    await page.click('#b-rules'); await page.waitForTimeout(300);
    // measure after the slide-in (WebKit can still be mid-animation at 300 ms)
    await page.waitForFunction(() => document.querySelector('.coach-rules').getAnimations().every(a => a.playState === 'finished'), null, { timeout: 3000 }).catch(() => {});
    const rs = await page.evaluate(() => {
      const body = document.querySelector('.coach-rules-body'), sheet = document.querySelector('.coach-rules').getBoundingClientRect();
      return { font: parseFloat(getComputedStyle(body).fontSize), sideways: body.scrollWidth > body.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth, inView: sheet.top >= 0 && sheet.bottom <= innerHeight + 0.5 && sheet.left >= 0 && sheet.right <= innerWidth + 0.5, scrolls: body.scrollHeight > body.clientHeight };
    });
    check(rs.font >= 15 && !rs.sideways && rs.inView, `${name}: rules sheet readable (${rs.font}px, sideways ${rs.sideways}, in view ${rs.inView})`);
    // every section tab shows without scrolling the tab row sideways (they wrap onto a second row)
    const tabs = await page.evaluate(() => {
      const n = document.querySelector('.coach-rules-nav'), nr = n.getBoundingClientRect();
      const out = [...n.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return r.left < nr.left - 0.5 || r.right > nr.right + 0.5; }).length;
      return { sideways: n.scrollWidth > n.clientWidth + 1, hidden: out, n: n.children.length, rows: new Set([...n.children].map(b => Math.round(b.getBoundingClientRect().top))).size };
    });
    check(!tabs.sideways && tabs.hidden === 0, `${name}: all ${tabs.n} rules tabs show, no sideways scroll (${tabs.rows} row(s), ${tabs.hidden} cut off)`);
    // 1.2.0: links are dark ink on the cream paper (the page's own `a` colour is light purple), the videos
    // list opens in a new tab, and a game's own link rule still wins (even when it loads before coach.css)
    const lk = await page.evaluate(() => {
      const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v = v / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const paper = lum('rgb(251, 246, 233)');
      const links = [...document.querySelectorAll('.coach-rules-body a')];
      const ratios = links.map(a => { const L = lum(getComputedStyle(a).color); return (Math.max(L, paper) + 0.05) / (Math.min(L, paper) + 0.05); });
      const vids = [...document.querySelectorAll('.coach-rules-body .coach-vids a')];
      return { n: links.length, minRatio: Math.min(...ratios), vids: vids.length, newTab: vids.every(a => a.target === '_blank' && a.rel === 'noopener' && /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(a.href)),
        tab: !!document.querySelector('.coach-rules-nav [data-sec="8"]') && document.querySelector('.coach-rules-nav [data-sec="8"]').textContent };
    });
    check(lk.n >= 3 && lk.minRatio >= 4.5, `${name}: rules links readable on the paper (${lk.n} links, contrast ${lk.minRatio.toFixed(1)}:1)`);
    check(lk.vids === 2 && lk.newTab && lk.tab === 'Videos', `${name}: videos section (${lk.vids} links, new tab ${lk.newTab}, tab "${lk.tab}")`);
    const own = await page.evaluate(() => {
      const s = document.createElement('style'); s.textContent = '.coach-rules-body a { color: rgb(120, 20, 20); } .coach-vids a { color: rgb(10, 90, 30); }';
      document.head.prepend(s);   // before coach.css (Codenames' and Monopoly's rules): the game's rule must still win
      const a = document.querySelector('.coach-rules-body section:not(:last-of-type) a');
      const out = [getComputedStyle(document.querySelector('.coach-vids a')).color, getComputedStyle(a).color];
      s.remove(); return out;
    });
    check(own[0] === 'rgb(10, 90, 30)' && own[1] === 'rgb(120, 20, 20)', `${name}: a game's own link colour still wins (${own.join(' / ')})`);
    if (!mobile) {
      await page.focus('.coach-rules-body a'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
      const fo = await page.evaluate(() => { const a = document.activeElement; return a.tagName === 'A' ? getComputedStyle(a).outlineStyle + ' ' + getComputedStyle(a).outlineWidth : 'not a link'; });
      check(/solid 2px/.test(fo), `${name}: a focused link shows an outline (${fo})`);
    }
    await page.click('.coach-rules-nav [data-sec="2"]'); await page.waitForTimeout(150);
    const jumped = await page.evaluate(() => { const b = document.querySelector('.coach-rules-body'), s = b.querySelector('[data-k="2"]'); return Math.abs(s.getBoundingClientRect().top - b.getBoundingClientRect().top) < 30 || b.scrollTop + b.clientHeight >= b.scrollHeight - 2; });
    check(jumped, `${name}: a section tab jumps to its section`);
    if (shots) await page.screenshot({ path: `${shots}/${name}-rules.png` });
    await page.keyboard.press('Escape');
    check(await page.locator('.coach-rules-back').count() === 0, `${name}: Esc closes the rules`);
    check(errs.length === 0, `${name}: no console errors ${errs.join(' | ')}`);
    await ctx.close();
  } finally { await browser.close(); }
}
// reduced motion: no animations on the ring or bubble
{
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 659 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(url); await page.waitForTimeout(200);
    await page.evaluate(() => { window.__T.reset(); window.__T.start(1); });
    await page.waitForTimeout(100);
    const an = await page.evaluate(() => [getComputedStyle(document.querySelector('.coach-ring')).animationName, getComputedStyle(document.querySelector('.coach-bubble')).animationName]);
    check(an.every(a => a === 'none'), `reduced motion: ring and bubble still (${an})`);
    await ctx.close();
  } finally { await browser.close(); }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
