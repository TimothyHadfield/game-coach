# game-coach: guided first game + rules sheet for the board game sites

Two small files, `coach.js` + `coach.css` (no dependencies), give a game:
- a **step-by-step coach**: a spotlight on one part of the screen, a short note on cream paper next to it,
  Next / Back / Skip, steps that wait for a game event, and it carries on after a reload;
- a **"first time here?" card**, offered once;
- a **seeded random number source with a stack**, so a game can deal a stacked first game without touching its rules engine;
- a **rules sheet**: a printed-rulebook page with section tabs, readable at 393 px, closes with ×, a tap outside, Esc or Back.

Demo: <https://timothyhadfield.github.io/game-coach/demo.html> · Pilot: King of Tokyo (Settings → Rules / Replay tutorial).

## 1. Copy it in
1. Copy `coach.js` → `js/coach.js` and `coach.css` → `css/coach.css`, **unchanged**.
2. `<link rel="stylesheet" href="css/coach.css?v=1">` and `<script src="js/coach.js?v=1"></script>` (classic script, sets `window.COACH`).
3. Optional theme on `:root`: `--coach-accent` (defaults to the game's `--accent`), `--coach-paper`, `--coach-ink`, `--coach-z` (default 60: above the game's sheets).

## 2. API
```js
// ---- the coach
const tour = COACH.tour({
  id: 'kot-first-game',                 // localStorage key "coach:<id>" holds the step, so a reload resumes
  steps: [
    { title, text | html, target, place, width, pad, block,   // target: selector / element / list / function
      waitFor: 'rolled',                // moves on when the game calls COACH.emit('rolled')
      until: () => bool,                // ...or when this turns true (checked ~4x a second)
      when: () => bool,                 // hidden until this is true (e.g. "only once it's your turn");
                                        // until only counts once the step has been shown ("not asked" ≠ "answered")
      skipIf: () => bool,               // skipped when true
      next: true|false, back: false },  // action steps (waitFor/until) show no Next unless next: true
  ],
  pauseIf: () => bool,                  // hide while the game shows a sheet of its own
  labels: { next, back, skip, done, of },
  onStep(i, step), onFinish(reason),    // reason: 'done' | 'skip'
});
tour.start(i?) · tour.resume() → bool · tour.saved() · tour.seen() · tour.next() · tour.back() · tour.skip()
tour.stop()  (hide, keep the place) · tour.reset()  (forget it: "Replay tutorial") · tour.update() · tour.current()
COACH.emit('event')   // tell the running tour something happened (safe to call any time)
COACH.update()        // re-check conditions now (after the game redraws)

// ---- offered once
COACH.offer({ id, title, text, yes: 'Show me', no: 'No thanks', onYes, onNo, force, parent,
  place,          // 1.2.0, optional: 'auto' | 'top' | 'bottom'. Left out = as before (bottom centre, your css)
  avoid })        // 1.2.0, with place 'auto': selector / element / list the card must not cover (your start button)
// false if already offered
COACH.offered(id) · COACH.resetOffer(id) · COACH.closeOffer()

// ---- stacked first game
const rng = COACH.rng(seed)          // repeatable (mulberry32); pass it to the engine / createLocal({ rng })
rng.stack([0.1, 0.5])                // the next calls return exactly these, then the seeded stream carries on
rng.stackInts([3, 0, 5], 6)          // "the next floor(rng()*6) are 3, 0, 5": stack a roll right before it happens
rng.left() · rng.clear()
COACH.findSeed(r => testDeal(r), { from: 1, max: 5000 })   // first seed whose deal passes: search once, hard-code it

// ---- rules sheet
COACH.rules({ title: 'Rules', intro, foot, open: 'turn', onClose,
  sections: [{ id: 'turn', title: 'Your turn', short: 'Turn', html: '<p>…</p>' }],
  videos: [{ id: 'DjfsX847nb0', title: 'How to play', channel: 'IELLO, the publisher' }],   // 1.2.0, optional
  videosTitle: 'Videos' })                // the last section + tab (open: 'videos' jumps to it)
COACH.closeRules() → bool · COACH.rulesOpen()
COACH.videosHtml(videos)                  // the same list as html, to put inside a section of your own
// inside section html: <p>, <ul>/<ol>, <table>, <h4>, <p class="tip"> (a boxed tip), <a> (dark ink-blue)

// ---- pure helpers (tested): COACH.place(target, {w,h}, {w,h}, {prefer}) · unionRect · overlapArea · offerPick · hash · motionOn · VERSION
```

### First-visit card that covers nothing (1.2.0)
Copy-paste (the only change from 1.1.0 is the last two options):
```js
COACH.offer({ id: 'coup-first', title: 'New to Coup?', text: 'Play one guided game.', onYes: startTutorial,
  place: 'auto', avoid: ['#deal'] });
```
- `place: 'auto'` measures a few spots for the card: the usual bottom spot, just above a bottom tab bar, the
  top, and just below a fixed top bar. It keeps the one that covers the least: tab bars, `avoid` and any
  element marked `data-coach-avoid` count 100x more than other buttons and links. Ties keep the bottom spot.
  It looks again before the first paint and when the screen turns or resizes. Only top/bottom are set
  (inline), so a game's own horizontal css (Coup's top-right corner on a laptop) still applies.
- Tab bars are found by themselves: fixed/sticky, `<nav>`, `<footer>` or `role="tablist"` boxes along the
  bottom or top edge, 40%+ wide. You only need `avoid` for the main start button (or mark it
  `data-coach-avoid` in the html instead).
- `place: 'top'` / `'bottom'`: always that edge. Gaps: `--coach-offer-top` (10px) / `--coach-offer-bottom` (14px),
  plus the safe area.
- Games that already set `--coach-offer-bottom` or moved the card in their own css can drop that once they use
  `place: 'auto'` (it overrides their top/bottom; harmless to leave).

### Links on the rules paper (1.2.0)
Links in the rules sheet are dark ink-blue `#2a4f9e` (`--coach-link`), visited too, with a 2px outline on
keyboard focus. The kit rule is low-specificity (`.coach-rules-body :where(a)`), so it beats a site-wide
`a { color: var(--accent) }` but a game's own `.coach-rules-body a {…}` or `.vids a {…}` still wins wherever it
loads. Games that added `.coach-rules-body a { color: #2a4f9e }` themselves can drop it.

## 3. Integration steps (a game)
1. **Rules**: write the rules in your own words as sections (Goal, Setup, Turn, …, End). Open them from a
   Rules / "?" button (`COACH.rules({...})`). If the game handles Back (popstate), close the rules first:
   `if (COACH.rulesOpen()) { COACH.closeRules(); history.pushState(...); return; }`.
2. **Tutorial game**: start a normal local game vs computers with a fixed seed (`COACH.rng(seed)` passed as the
   engine's random source). Right before the player's scripted roll or draw, `rng.stackInts([...], n)` so the
   tutorial shows the moment you want to teach; `rng.clear()` after. Save "this is the tutorial game" with the
   saved game so a reload rebuilds the same rigging.
3. **Steps**: point each at a real element; use `until` on the game's state (or `COACH.emit` from the game's own
   event stream) for "now tap Roll" steps. Give `pauseIf` the game's sheet-open check.
4. **First visit**: `COACH.offer({...})` on the setup screen, once. **Settings**: a "Replay tutorial" button
   (`tour.reset(); start the tutorial game; tour.start()`) and a Rules button.
5. **Back**: `tour.resume()` at boot if the saved game is the tutorial.

## 4. Behaviour
- The bubble never leaves the screen and never covers its target at 320–1440 px (tested on 4,500 target
  positions and in WebKit/Chromium at 320, 393, 659×393, 1280, 1440).
- The bubble is always readable: its title, at least 2 lines of text and its buttons (only the text scrolls
  when it's squeezed). A target that leaves less room than that (a board filling most of the phone) gets
  the readable note at the roomier edge, over the target's edge only by the missing height.
- Rules sheet tabs wrap onto more rows on a phone: every section shows, nothing scrolls sideways. (Games
  that added `.coach-rules .coach-rules-nav { flex-wrap: wrap; ... }` themselves can drop it; it's harmless.)
- Dimming lets taps through (the game keeps working) unless a step says `block: true`.
- Reduced motion (device setting or `FX.settings.animations === false`): no glow, slide or shake.
- Storage blocked (private mode): the tour still runs, it just won't resume after a reload.

## 5. Tests
- `node --test test/coach.test.mjs`: placement, the stacked random numbers, the step logic, resume, private mode.
  Seen failing against a broken copy (`COACH_JS=<copy>`): 5 of 13 fail; the 1.0.0 pre-release fails the
  sideways-phone placement and the `when`/`until` tests (both found by the King of Tokyo pilot).
- `node test/coach-ui.mjs http://127.0.0.1:PORT/demo.html [--shots dir]`: the demo in WebKit (320, 393, 659×393)
  and Chromium (1280, 1440), one browser at a time.

## Changelog
- **1.2.0** (2026-10-28): rules-sheet links are dark ink-blue on the cream paper (were the site's light link
  colour: 1.8:1 contrast in the demo, now 7.2:1), visited too, with a focus outline; a game's own link rule
  still wins. `COACH.offer({ place: 'auto' | 'top' | 'bottom', avoid })` keeps the first-visit card off tab bars
  and the start button (Coup: lifting it above the tab bar made it cover Deal). Default unchanged: without
  `place` the card sits exactly where 1.1.0 put it, because ~25 games already tuned it with their own css.
  Optional `videos` list in `COACH.rules` + `COACH.videosHtml`. Demo: a bottom tab bar, a light site link
  colour, the offer with `place: 'auto'`, a Videos tab. Tests: 3 node + 4 browser checks per size, all failed on 1.1.0.
- **1.1.0** (2026-10-27): rules tabs wrap instead of scrolling sideways (King of Tokyo, Splendor and others
  had a game-side fix); a tall target no longer squeezes the note into a one-line strip (Connect Four): the
  note keeps title + 2 lines + buttons, only its text scrolls. Normal notes are unchanged (same boxes).
  Tests: tall-target placement (node) and step + 8-tab rules sheet in the demo (browsers); both failed on 1.0.0.
- **1.0.0** (2026-10-26): first release (pilot King of Tokyo).
