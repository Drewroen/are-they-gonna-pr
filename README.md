# are-they-gonna-pr

One page, two inputs: *He hit 13.1 miles ⇄ in 1 hours, 23 minutes and 47 seconds.* Type where Drew is and the clock; it says whether he is on pace to beat his **2:47:34** marathon PB (42.195 km / 26.21875 mi — an even split of 3:58.3/km or 6:23.5/mi).

Live: https://drewroen.github.io/are-they-gonna-pr/

## How it works

`pace.js` holds the whole calculation — pure functions, no DOM, no dependencies:

- `avgPace = t / d`
- `projected = avgPace × marathon` — finish time if the average holds
- `onPace = projected < PB` — a tie is not a PR
- `requiredPace = (PB − t) / (marathon − d)` — the fastest average that still wins, i.e. the most you can afford to slow down (or the pace you must hold) for the rest
- `t ≥ PB` with distance left is reported as *PR out of reach*, not as a pace

Miles are converted with `KM_PER_MI = 1.609344`; the marathon is defined in km (`42.195`) with miles derived, so the two unit modes can never disagree.

## Files

- `index.html` — the page: markup, styles and DOM wiring (no build step, no framework)
- `pace.js` — the pace math (browser global `Pace` / `require('pace.js')`)
- `fonts/` — Instrument Sans woff2 subsets + `OFL.txt` (SIL Open Font License 1.1); self-hosted so the rendering is identical on every device
- `tests/pace.test.js` — 18 tests, plain `assert`
- `README.md`

## Tests

```bash
node tests/pace.test.js
```

## Deploy

Static, served by GitHub Pages straight from `main` at `/` — what is committed is what ships.
