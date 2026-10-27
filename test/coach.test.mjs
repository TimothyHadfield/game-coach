// Node tests for coach.js: bubble placement, the seeded/stacked random numbers and the tour's steps
// (the tour runs without a page here: no document means no drawing, but the step logic is the same).
// Run: node --test test/        COACH_JS=<path> tests a mutated copy (to prove the tests can fail).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const require = createRequire(import.meta.url);
const C = require(process.env.COACH_JS || resolve(here, '../coach.js'));

const overlap = (a, b) => a.x < b.left + b.width && a.x + a.w > b.left && a.y < b.top + b.height && a.y + a.h > b.top;

test('the bubble never leaves the screen and never covers its target (320..1440 px wide)', () => {
  const views = [[320, 568], [360, 640], [393, 659], [659, 393], [768, 1024], [1024, 768], [1280, 800], [1440, 900]];
  let n = 0, over = 0;
  for (const [vw, vh] of views) {
    for (const bh of [90, 150, 240]) {
      for (const fw of [0.08, 0.3, 0.6, 0.95]) for (const fh of [0.05, 0.2, 0.45]) {
        for (const px of [0, 0.25, 0.5, 0.75, 1]) for (const py of [0, 0.3, 0.5, 0.7, 1]) {
          const width = Math.round(vw * fw), height = Math.round(vh * fh);
          const target = { left: Math.round((vw - width) * px), top: Math.round((vh - height) * py), width, height };
          const p = C.place(target, { w: 320, h: bh }, { w: vw, h: vh });
          const h = Math.min(bh, p.maxH);
          const box = { x: p.x, y: p.y, w: p.w, h };
          n++;
          assert.ok(p.x >= 0 && p.y >= 0, `off the top/left: ${vw}x${vh} ${JSON.stringify(target)} -> ${JSON.stringify(p)}`);
          assert.ok(p.x + p.w <= vw && p.y + h <= vh, `off the bottom/right: ${vw}x${vh} ${JSON.stringify(target)} -> ${JSON.stringify(p)}`);
          assert.ok(p.w >= Math.min(160, vw - 16), `too narrow to read: ${p.w}px at ${vw}`);
          assert.ok(h >= Math.min(72, bh), `too short to read: ${h}px`);
          if (p.side === 'over') over++;
          else assert.ok(!overlap(box, target), `covers the target: ${vw}x${vh} ${JSON.stringify(target)} -> ${JSON.stringify(p)}`);
          // a target up to 45% of the screen's height always leaves room above or below
          if (height <= vh * 0.45) assert.notEqual(p.side, 'over', `gave up with room left: ${vw}x${vh} ${JSON.stringify(target)}`);
        }
      }
    }
  }
  assert.ok(n > 4000);
  assert.equal(over, 0);
});

test('a target that fills the screen pins the bubble to an edge, still on screen', () => {
  const p = C.place({ left: 0, top: 0, width: 393, height: 659 }, { w: 320, h: 140 }, { w: 393, h: 659 });
  assert.equal(p.side, 'over');
  assert.ok(p.y >= 0 && p.y + Math.min(140, p.maxH) <= 659 && p.x >= 0 && p.x + p.w <= 393);
});

test('no target: centred; a preferred side is used when it fits', () => {
  const c = C.place(null, { w: 300, h: 120 }, { w: 393, h: 659 });
  assert.equal(c.side, 'center');
  assert.equal(c.x, Math.round((393 - 300) / 2));
  const t = { left: 100, top: 300, width: 100, height: 40 };
  assert.equal(C.place(t, { w: 200, h: 100 }, { w: 1280, h: 800 }).side, 'below');
  assert.equal(C.place(t, { w: 200, h: 100 }, { w: 1280, h: 800 }, { prefer: 'above' }).side, 'above');
  assert.equal(C.place(t, { w: 200, h: 100 }, { w: 1280, h: 800 }, { prefer: 'right' }).side, 'right');
});

test('union of target boxes skips empty ones', () => {
  assert.equal(C.unionRect([]), null);
  assert.equal(C.unionRect([{ left: 5, top: 5, width: 0, height: 0 }]), null);
  assert.deepEqual(C.unionRect([{ left: 10, top: 20, width: 30, height: 40 }, { left: 50, top: 5, width: 10, height: 10 }, null]),
    { left: 10, top: 5, width: 50, height: 55, right: 60, bottom: 60 });
});

test('seeded random numbers repeat; stacked values come first, then the seeded stream carries on', () => {
  const a = C.rng(42), b = C.rng(42);
  const xs = Array.from({ length: 50 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 50 }, () => b()));
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.notDeepEqual(xs, Array.from({ length: 50 }, C.rng(43)));
  const r = C.rng('kot'), plain = C.rng('kot');
  r.stackInts([3, 0, 5, 5], 6);
  assert.equal(r.left(), 4);
  const rint = n => Math.floor(r() * n);
  assert.deepEqual([rint(6), rint(6), rint(6), rint(6)], [3, 0, 5, 5]);
  assert.equal(r.left(), 0);
  assert.equal(r(), plain(), 'the stack does not use up the seeded stream');
  r.stack([0.2, 0.3]).clear();
  assert.equal(r.left(), 0);
  r.stack([1, -1]);
  const hi = r(), lo = r();
  assert.ok(hi < 1 && lo >= 0, 'stacked values are clamped into 0..1');
});

test('findSeed returns the first seed whose deal passes', () => {
  const s = C.findSeed(r => Math.floor(r() * 6) === 5 && Math.floor(r() * 6) === 5);
  assert.ok(s > 0);
  const r = C.rng(s);
  assert.equal(Math.floor(r() * 6), 5);
  assert.equal(Math.floor(r() * 6), 5);
  assert.equal(C.findSeed(() => false, { max: 20 }), -1);
});

function mkTour(steps, extra) { mem.clear(); return C.tour(Object.assign({ id: 't' + Math.random().toString(36).slice(2, 7), steps }, extra || {})); }

test('Next / Back / Skip walk the steps and remember the end', () => {
  const t = mkTour([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
  t.start();
  assert.equal(t.index, 0); assert.ok(t.active);
  t.next(); t.next();
  assert.equal(t.index, 2);
  t.back();
  assert.equal(t.index, 1);
  t.skip();
  assert.equal(t.active, false);
  assert.ok(t.seen());
  assert.equal(t.resume(), false, 'a skipped tour does not come back on reload');
});

test('a step waits for a game event, then moves on by itself', () => {
  const t = mkTour([{ text: 'tap Roll', waitFor: 'rolled' }, { text: 'nice' }, { text: 'end' }]);
  t.start();
  t.next(); // Next does nothing useful on an action step's bubble (there is no button), but must not skip it in the logic either
  // (next() is the button; an action step shows none, so a game never calls it there)
  const t2 = mkTour([{ text: 'tap Roll', waitFor: 'rolled' }, { text: 'nice' }]);
  t2.start();
  t2.emit('other');
  assert.equal(t2.index, 0);
  t2.emit('rolled');
  assert.equal(t2.index, 1);
  C.emit('rolled'); // the module-level emit goes to the running tour; a stale event does not skip a text step
  assert.equal(t2.index, 1);
  assert.ok(t.active === false, 'starting another tour stops the first');
});

test('until / when / skipIf follow the game state', () => {
  const g = { phase: 'start', tokyo: false };
  const t = mkTour([
    { text: 'roll', until: () => g.phase === 'roll' },
    { text: 'only in tokyo', skipIf: () => !g.tokyo },
    { text: 'stay?', when: () => g.phase === 'yield', until: () => g.phase === 'after' },
    { text: 'bye' },
  ]);
  t.start();
  assert.equal(t.index, 0);
  g.phase = 'roll'; t.update();
  assert.equal(t.index, 2, 'skipped the Tokyo step');
  g.phase = 'after'; t.update();
  assert.equal(t.index, 3);
});

test('a tour in progress comes back after a reload, at the same step', () => {
  mem.clear();
  const steps = [{ text: 'a' }, { text: 'b', waitFor: 'x' }, { text: 'c' }];
  const t = C.tour({ id: 'reload', steps });
  t.start(); t.next();
  assert.equal(t.index, 1);
  t.stop(); // the page goes away
  const again = C.tour({ id: 'reload', steps });
  assert.ok(again.saved());
  assert.equal(again.resume(), true);
  assert.equal(again.index, 1);
  again.emit('x');
  assert.equal(again.index, 2);
  again.next();
  assert.equal(again.active, false);
  assert.ok(again.seen());
  assert.equal(C.tour({ id: 'reload', steps }).resume(), false);
  again.reset();
  assert.equal(again.seen(), false, 'reset clears it for "replay tutorial"');
});

test('Back skips over action steps that are already done', () => {
  const t = mkTour([{ text: 'a' }, { text: 'tap', waitFor: 'go' }, { text: 'c' }]);
  t.start(); t.next(); t.emit('go');
  assert.equal(t.index, 2);
  t.back();
  assert.equal(t.index, 0);
});

test('pauseIf hides the tour without losing its place', () => {
  let sheet = false;
  const t = mkTour([{ text: 'a' }, { text: 'b' }], { pauseIf: () => sheet });
  t.start(); sheet = true; t.update();
  assert.ok(t.active); assert.equal(t.index, 0);
  sheet = false; t.next();
  assert.equal(t.index, 1);
});

test('storage that throws (private mode) never breaks the tour', () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  try {
    const t = C.tour({ id: 'priv', steps: [{ text: 'a' }, { text: 'b' }] });
    t.start(); t.next(); t.next();
    assert.equal(t.active, false);
    assert.equal(t.resume(), false);
  } finally { globalThis.localStorage = saved; }
});
