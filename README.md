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
COACH.offer({ id, title, text, yes: 'Show me', no: 'No thanks', onYes, onNo, force, parent })   // false if already offered
COACH.offered(id) · COACH.resetOffer(id) · COACH.closeOffer()

// ---- stacked first game
const rng = COACH.rng(seed)          // repeatable (mulberry32); pass it to the engine / createLocal({ rng })
rng.stack([0.1, 0.5])                // the next calls return exactly these, then the seeded stream carries on
rng.stackInts([3, 0, 5], 6)          // "the next floor(rng()*6) are 3, 0, 5": stack a roll right before it happens
rng.left() · rng.clear()
COACH.findSeed(r => testDeal(r), { from: 1, max: 5000 })   // first seed whose deal passes: search once, hard-code it

// ---- rules sheet
COACH.rules({ title: 'Rules', intro, foot, open: 'turn', onClose,
  sections: [{ id: 'turn', title: 'Your turn', short: 'Turn', html: '<p>…</p>' }] })
COACH.closeRules() → bool · COACH.rulesOpen()
// inside section html: <p>, <ul>/<ol>, <table>, <h4>, <p class="tip"> (a boxed tip)

// ---- pure helpers (tested): COACH.place(target, {w,h}, {w,h}, {prefer}) · unionRect · hash · motionOn · VERSION
```

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
  positions and in WebKit/Chromium at 320, 393, 659×393, 1280, 1440). Only a target that fills the whole
  screen makes it sit over an edge.
- Dimming lets taps through (the game keeps working) unless a step says `block: true`.
- Reduced motion (device setting or `FX.settings.animations === false`): no glow, slide or shake.
- Storage blocked (private mode): the tour still runs, it just won't resume after a reload.

## 5. Tests
- `node --test test/coach.test.mjs`: placement, the stacked random numbers, the step logic, resume, private mode.
  Seen failing against a broken copy (`COACH_JS=<copy>`): 5 of 13 fail; the 1.0.0 pre-release fails the
  sideways-phone placement and the `when`/`until` tests (both found by the King of Tokyo pilot).
- `node test/coach-ui.mjs http://127.0.0.1:PORT/demo.html [--shots dir]`: the demo in WebKit (320, 393, 659×393)
  and Chromium (1280, 1440), one browser at a time.
