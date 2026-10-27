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
  return { b: { l: bb.left, t: bb.top, r: bb.right, bt: bb.bottom }, ring: rr && { l: rr.left, t: rr.top, r: rr.right, bt: rr.bottom }, vw: innerWidth, vh: innerHeight, side: b.dataset.side, idx: window.__T.index, text: b.textContent };
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
    await page.click('.coach-offer [data-o="yes"]'); await page.waitForTimeout(250);
    let bad = 0, steps = 0;
    for (let k = 0; k < 12; k++) {
      await page.waitForTimeout(150);
      const g = await page.evaluate(geo);
      if (!g) break;
      steps++;
      const on = g.b.l >= -0.5 && g.b.t >= -0.5 && g.b.r <= g.vw + 0.5 && g.b.bt <= g.vh + 0.5;
      const cover = g.ring && g.b.l < g.ring.r && g.b.r > g.ring.l && g.b.t < g.ring.bt && g.b.bt > g.ring.t;
      if (!on || cover) { bad++; console.log('   step', g.idx, JSON.stringify(g)); }
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
    check(steps >= 7 && bad === 0, `${name}: bubble on screen and off the target at every step (${steps} steps, ${bad} bad)`);
    check(await page.evaluate(() => !window.__T.active && window.__T.seen()), `${name}: Done ends the tour`);
    // Skip
    await page.evaluate(() => { window.__T.reset(); window.__T.start(); });
    await page.click('.coach-bubble [data-coach="skip"]');
    check(await page.locator('.coach-layer').count() === 0, `${name}: Skip removes the overlay`);
    // rules sheet
    await page.click('#b-rules'); await page.waitForTimeout(300);
    const rs = await page.evaluate(() => {
      const body = document.querySelector('.coach-rules-body'), sheet = document.querySelector('.coach-rules').getBoundingClientRect();
      return { font: parseFloat(getComputedStyle(body).fontSize), sideways: body.scrollWidth > body.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth, inView: sheet.top >= 0 && sheet.bottom <= innerHeight + 0.5 && sheet.left >= 0 && sheet.right <= innerWidth + 0.5, scrolls: body.scrollHeight > body.clientHeight };
    });
    check(rs.font >= 15 && !rs.sideways && rs.inView, `${name}: rules sheet readable (${rs.font}px, sideways ${rs.sideways}, in view ${rs.inView})`);
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
