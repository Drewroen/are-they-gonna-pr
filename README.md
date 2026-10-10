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
- rounded race distances are treated as the real thing: 26.2 mi / 42.2 km snap to the marathon, 13.1 mi / 21.1 km to the half (within 0.15%), so a PB-pace 26.2 is not read as 7s slow

Miles are converted with `KM_PER_MI = 1.609344`; the marathon is defined in km (`42.195`) with miles derived, so the two unit modes can never disagree.

## Files

- `index.html` — the page: markup, styles and DOM wiring (no build step, no framework)
- `pace.js` — the pace math (browser global `Pace` / `require('pace.js')`)
- `splits.js` — the results-page parser (browser global `Splits` / `require('splits.js')`)
- `fetch-splits.js` — node CLI: name/bib → the live split JSON
- `fonts/` — Instrument Sans woff2 subsets + `OFL.txt` (SIL Open Font License 1.1); self-hosted so the rendering is identical on every device
- `tests/pace.test.js` — 18 tests, plain `assert`
- `tests/splits.test.js` — 15 tests against trimmed copies of the real markup
- `README.md`

## Live splits

The timing site is mika:timing. Its JSON API (`/{year}/index.php?content=ajax2&func=...`)
does search and leaderboard rows only — the newest split, never the split table. The
per-split table is server-rendered into the runner's detail page, so that is what
`splits.js` parses.

```bash
node fetch-splits.js --name "Roen, Drew"            # search, then his page
node fetch-splits.js --idp 2EFG96382E18FA           # straight to the page
node fetch-splits.js --idp ... --year 2025 --event MAR_9TGG96381A5 --pretty
node fetch-splits.js --html page.html               # offline: parse a saved page
node fetch-splits.js --name "Roen, Drew" --out data/splits.json
```

`Splits.parseDetail(html)` is pure and dependency-free, so the page can use it too;
the network helpers (`fetchSplits`, `findRunner`) are node-only. `Splits.paceInput(parsed.splits, 'mi')`
returns `{ distance, unit, seconds }` — feed it straight to `Pace.analyze`.

Things the site does that you have to work around:

- Requests without a browser `User-Agent` get a 403 from the load balancer.
- Past years 301 from `results.chicagomarathon.com` to `chicago-history.r.mikatiming.com`.
- The `/2023/` style path in an old link is just an app instance: the `event=MAR_<meeting>`
  parameter decides which race you actually get, so pass it (or let the search fill it in)
  rather than trusting the path.
- Older pages use `f-start_no` where current ones use `f-start_no_text`, and their Result
  box is blank — the finish time then comes off the splits table's Finish row.

## Tests

```bash
node tests/pace.test.js
node tests/splits.test.js
```

## Deploy

Static, served by GitHub Pages straight from `main` at `/` — what is committed is what ships.
