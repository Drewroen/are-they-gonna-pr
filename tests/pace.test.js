/* Tests for pace.js — node tests/pace.test.js  (no dependencies) */
'use strict';
var assert = require('assert');
var Pace = require('../pace.js');

var failures = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
function close(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol,
    (label || 'value') + ': expected ' + expected + ' ±' + tol + ', got ' + actual);
}

// --- constants -------------------------------------------------------------
test('PB is 2:47:34 = 10054s', function () {
  assert.strictEqual(Pace.PB_SECONDS, 10054);
});
test('marathon is 42.195 km / 26.21876 mi', function () {
  close(Pace.MARATHON_KM, 42.195, 0, 'km');
  close(Pace.MARATHON_MI, 26.218757, 1e-5, 'mi');
});
test('PB even split is 3:58.3/km and 6:23.5/mi', function () {
  close(Pace.PB_SECONDS / Pace.MARATHON_KM, 238.2747, 0.001, 'sec/km');
  close(Pace.PB_SECONDS / Pace.MARATHON_MI, 383.4659, 0.001, 'sec/mi');
});

// --- formatting ------------------------------------------------------------
test('fmtClock', function () {
  assert.strictEqual(Pace.fmtClock(10054), '2:47:34');
  assert.strictEqual(Pace.fmtClock(5027), '1:23:47');
  assert.strictEqual(Pace.fmtClock(238.278), '3:58');
  assert.strictEqual(Pace.fmtClock(-65), '-1:05');
});
test('fmtPace', function () {
  assert.strictEqual(Pace.fmtPace(238.278), '3:58.3');
  assert.strictEqual(Pace.fmtPace(383.463), '6:23.5');
  assert.strictEqual(Pace.fmtPace(300), '5:00.0');
  assert.strictEqual(Pace.fmtPace(-480.2), '-8:00.2');
});
test('fmtGap', function () {
  assert.strictEqual(Pace.fmtGap(-54.4), '-0:54');
  assert.strictEqual(Pace.fmtGap(72.8), '+1:13');
  assert.strictEqual(Pace.fmtGap(-3725), '-1:02:05');
});

// --- incomplete input ------------------------------------------------------
test('zero distance / zero time -> incomplete', function () {
  assert.strictEqual(Pace.analyze(0, 'km', 600).status, 'incomplete');
  assert.strictEqual(Pace.analyze(10, 'km', 0).status, 'incomplete');
  assert.strictEqual(Pace.analyze(-5, 'km', 600).status, 'incomplete');
  assert.strictEqual(Pace.analyze(NaN, 'km', 600).status, 'incomplete');
});

// --- the tie: half marathon exactly on PB pace ------------------------------
test('half marathon in 1:23:47 is a tie, not a PR', function () {
  var r = Pace.analyze(21.0975, 'km', 5027);
  close(r.projected, 10054, 0.01, 'projected');
  close(r.delta, 0, 0.01, 'delta');
  assert.strictEqual(r.status, 'off');
  close(r.requiredPace, 238.278, 0.01, 'required pace equals PB pace');
  close(r.requiredPaceRatio, 1, 1e-9, 'the rest is PB pace, exactly');
  assert.strictEqual(r.band, 'slightly-behind', 'a PR-pace tie is not a PR');
});

test('half marathon in 1:23:20 is on pace', function () {
  var r = Pace.analyze(21.0975, 'km', 5000);
  assert.strictEqual(r.status, 'on');
  close(r.projected, 10000, 0.5, 'projected');
  close(r.delta, -54, 0.5, 'delta');
  close(r.avgPace, 237.0, 0.1, 'avg pace');
  assert.ok(r.requiredPace > r.avgPace, 'can afford to slow down');
  assert.strictEqual(r.band, 'on-pace', '27s up is on pace, not yet a large PR');
});

// --- off pace --------------------------------------------------------------
test('10k in 40:00 -> off pace, 237.7/km needed for the last 32.195km', function () {
  var r = Pace.analyze(10, 'km', 2400);
  assert.strictEqual(r.status, 'off');
  close(r.projected, 10126.8, 0.5, 'projected');
  close(r.delta, 72.8, 0.5, 'delta');
  close(r.avgPace, 240, 0.001, 'avg pace');
  close(r.remaining, 32.195, 1e-9, 'remaining');
  close(r.requiredPace, 237.7388, 0.01, 'required pace');
  assert.ok(r.requiredPace < r.avgPace, 'must speed up');
  close(r.requiredPaceRatio, 0.9978, 0.0001, 'the rest is a hair under PR pace');
  close(r.cushion, -0.0022, 0.0002, 'cushion');
  assert.strictEqual(r.band, 'slightly-behind', '10k in 40:00 is 0.2% under PR pace for the rest');
});

test('5k in 24:00 -> off pace', function () {
  var r = Pace.analyze(5, 'km', 1440);
  assert.strictEqual(r.status, 'off');
  close(r.avgPace, 288, 1e-9, 'avg pace');
  close(r.projected, 12152.16, 0.01, 'projected');
  close(r.cushion, -0.0281, 0.0001, '2.8% under PR pace for the rest, just inside the band');
  assert.strictEqual(r.band, 'slightly-behind');
});

// --- miles -----------------------------------------------------------------
test('13.109375 mi in 1:23:47 is the same tie in miles', function () {
  var r = Pace.analyze(Pace.MARATHON_MI / 2, 'mi', 5027);
  close(r.projected, 10054, 0.01, 'projected');
  assert.strictEqual(r.status, 'off');
});

test('20 mi in 2:00:00 -> on pace, 26.21875 mi projected', function () {
  var r = Pace.analyze(20, 'mi', 7200);
  assert.strictEqual(r.status, 'on');
  close(r.remaining, Pace.MARATHON_MI - 20, 1e-9, 'remaining');
  close(r.projected, 7200 * (Pace.MARATHON_MI / 20), 0.01, 'projected');
  close(r.requiredPace, (10054 - 7200) / (Pace.MARATHON_MI - 20), 0.01, 'required pace');
  assert.ok(r.requiredPace > 360, 'can slow past 6:00/mi and still PR');
});

// --- impossible ------------------------------------------------------------
test('past PB time with distance left -> impossible', function () {
  var r = Pace.analyze(40, 'km', 10060);
  assert.strictEqual(r.status, 'impossible');
  assert.strictEqual(r.overSeconds, 6);
  assert.ok(r.requiredPace < 0, 'required pace is negative');
  assert.strictEqual(r.band, null, 'nothing left to measure a cushion with');
});

test('exactly at PB time with distance left -> impossible', function () {
  assert.strictEqual(Pace.analyze(40, 'km', 10054).status, 'impossible');
});

// --- finished --------------------------------------------------------------
test('finishing under PB -> finished with a PR', function () {
  var r = Pace.analyze(42.195, 'km', 10000);
  assert.strictEqual(r.status, 'finished');
  assert.strictEqual(r.pr, true);
  assert.strictEqual(r.delta, -54);
  assert.strictEqual(r.remaining, 0);
});

test('finishing over PB -> finished without a PR', function () {
  var r = Pace.analyze(42.195, 'km', 10100);
  assert.strictEqual(r.status, 'finished');
  assert.strictEqual(r.pr, false);
  assert.strictEqual(r.delta, 46);
});

test('Splits: 30km in 1:59:00 projects a 2:47:21 finish (13s under PB)', function () {
  var r = Pace.analyze(30, 'km', 7140);
  assert.strictEqual(r.status, 'on');
  close(r.projected, 7140 * (42.195 / 30), 0.01, 'projected');
  close(r.projected, 10042.4, 0.2, 'projected value');
  close(r.requiredPace, (10054 - 7140) / 12.195, 0.01, 'required pace');
});

// --- the cushion bands ------------------------------------------------------
// The verdict comes straight off the cushion: requiredPace / pbPace - 1, the
// fraction of PR pace the rest of the race can be run slower by.
function bandFor(cushion) {
  return Pace.verdictFor({ status: cushion > 0 ? 'on' : 'off', cushion: cushion }).text;
}
test('the four bands land on the 3% cushion', function () {
  assert.strictEqual(bandFor(0.10), 'Large PR');
  assert.strictEqual(bandFor(0.03), 'Large PR');
  assert.strictEqual(bandFor(0.0299), 'On pace to PR');
  assert.strictEqual(bandFor(0.0001), 'On pace to PR');
  assert.strictEqual(bandFor(0), 'Slightly behind pace');      // a tie is not a PR
  assert.strictEqual(bandFor(-0.0299), 'Slightly behind pace');
  assert.strictEqual(bandFor(-0.03), 'Slightly behind pace');
  assert.strictEqual(bandFor(-0.0301), 'Behind pace');
  assert.strictEqual(bandFor(-0.5), 'Behind pace');
  // no cushion at all -> no verdict, rather than a wrong one
  assert.strictEqual(Pace.verdictFor({ status: 'on', cushion: null }).text, '');
  assert.strictEqual(Pace.cushionBand(NaN), null);
  assert.strictEqual(Pace.cushionBand(undefined), null);
});
test('verdict tone follows the band', function () {
  assert.strictEqual(Pace.verdictFor({ status: 'on', cushion: 0.05 }).tone, 'on');
  assert.strictEqual(Pace.verdictFor({ status: 'on', cushion: 0.01 }).tone, 'on');
  assert.strictEqual(Pace.verdictFor({ status: 'off', cushion: -0.01 }).tone, 'off');
  assert.strictEqual(Pace.verdictFor({ status: 'off', cushion: -0.9 }).tone, 'off');
});
test('verdict for the special statuses', function () {
  assert.strictEqual(Pace.verdictFor({ status: 'incomplete' }).text, '');
  assert.strictEqual(Pace.verdictFor({ status: 'incomplete' }).tone, 'idle');
  assert.strictEqual(Pace.verdictFor({ status: 'impossible', cushion: -9 }).text, 'Not today');
  assert.strictEqual(Pace.verdictFor({ status: 'finished', pr: true }).text, 'PR!');
  assert.strictEqual(Pace.verdictFor({ status: 'finished', pr: false }).text, 'No PR');
});

// --- what the rest of the race asks for ------------------------------------
test('the band is the pace the rest of the race needs, against PR pace', function () {
  var tie = Pace.analyze(21.0975, 'km', 5027);       // half exactly at PR pace
  close(tie.requiredPaceRatio, 1, 1e-9, 'the rest is PR pace');
  close(tie.cushion, 0, 1e-9, 'no cushion');
  close(tie.pbPace, Pace.PB_SECONDS / Pace.MARATHON_KM, 1e-9, 'PR pace is the even split');
  assert.strictEqual(tie.band, 'slightly-behind');
  assert.strictEqual(Pace.verdictFor(tie).text, 'Slightly behind pace');

  var ahead = Pace.analyze(21.0975, 'km', 5000);     // 27s up on PR pace
  assert.strictEqual(ahead.band, 'on-pace');
  assert.strictEqual(Pace.verdictFor(ahead).text, 'On pace to PR');

  var big = Pace.analyze(21.0975, 'km', 4870);       // 2:37 up on PR pace
  assert.ok(big.cushion > Pace.PACE_BAND, 'more than 3% of PR pace in hand');
  assert.strictEqual(Pace.verdictFor(big).text, 'Large PR');
});
test('the cushion is unit-free', function () {
  assert.strictEqual(Pace.analyze(21.0975, 'km', 5278).cushion.toFixed(9),
                     Pace.analyze(13.109375, 'mi', 5278).cushion.toFixed(9));
});
test('the band is about the rest of the race, not the projection', function () {
  // 10k in 40:00 projects 1:13 over the PR, but the last 32.195km only needs to be
  // 0.2% under PR pace, so it is merely slightly behind.
  var early = Pace.analyze(10, 'km', 2400);
  close(early.cushion, -0.0022, 0.0002, 'cushion');
  assert.strictEqual(Pace.verdictFor(early).text, 'Slightly behind pace');
  // 40k in 2:41:20 projects only 2:37 over the PR, but the last 2.195km would have
  // to be run at 2:50/km — 28% under PR pace — so that is behind pace.
  var late = Pace.analyze(40, 'km', 9680);
  close(late.cushion, -0.2849, 0.0001, 'cushion');
  close(late.requiredPaceRatio, 0.7151, 0.0001, 'ratio');
  assert.strictEqual(Pace.verdictFor(late).text, 'Behind pace');
});
test('the estimate under the verdict', function () {
  assert.strictEqual(Pace.gapTextFor(Pace.analyze(20, 'mi', 7200)), '10:15 under the PB');
  assert.strictEqual(Pace.gapTextFor(Pace.analyze(10, 'km', 2400)), '1:13 over the PB');
  assert.strictEqual(Pace.gapTextFor(Pace.analyze(42.195, 'km', 10000)), '0:54 under the PB');
  assert.strictEqual(Pace.gapTextFor(Pace.analyze(42.195, 'km', 10100)), '0:46 over the PB');
  assert.strictEqual(Pace.gapTextFor(Pace.analyze(40, 'km', 10060)), '0:06 past the PB');
  assert.strictEqual(Pace.gapTextFor(Pace.analyze(21.0975, 'km', 5027)), 'right on the PB');
  assert.strictEqual(Pace.gapTextFor(Pace.analyze(0, 'km', 0)), '');
});
test('the line under the verdict is the pace the rest of the race needs', function () {
  assert.strictEqual(Pace.paceNeededTextFor(Pace.analyze(20, 'mi', 7200)),
                     'He needs to run 7:38 pace for the rest of the race');
  assert.strictEqual(Pace.paceNeededTextFor(Pace.analyze(40, 'km', 9680)),
                     'He needs to run 2:50 pace for the rest of the race');
  assert.strictEqual(Pace.paceNeededTextFor(Pace.analyze(21.0975, 'km', 5027)),
                     'He needs to run 3:58 pace for the rest of the race');
  assert.strictEqual(Pace.paceNeededTextFor(Pace.analyze(13.109375, 'mi', 5027)),
                     'He needs to run 6:23 pace for the rest of the race');
  assert.strictEqual(Pace.paceNeededTextFor(Pace.analyze(0, 'km', 0)), '');
  assert.strictEqual(Pace.paceNeededTextFor(null), '');
  // nothing left to pace: the projection gap is the only number left to report
  assert.strictEqual(Pace.paceNeededTextFor(Pace.analyze(42.195, 'km', 10000)), '0:54 under the PB');
  assert.strictEqual(Pace.paceNeededTextFor(Pace.analyze(42.195, 'km', 10100)), '0:46 over the PB');
  assert.strictEqual(Pace.paceNeededTextFor(Pace.analyze(40, 'km', 10060)), '0:06 past the PB');
  // floored to the second, never rounded up into a pace he cannot actually hold:
  // 30k in 1:59:00 asks for 3:58.9/km, which reads as 3:58
  var thirty = Pace.analyze(30, 'km', 7140);
  close(thirty.requiredPace, 238.95, 0.01, 'raw requirement');
  assert.strictEqual(Pace.fmtPace(thirty.requiredPace), '3:59.0', 'raw pace has the decimal');
  assert.strictEqual(Pace.paceNeededTextFor(thirty),
                     'He needs to run 3:58 pace for the rest of the race');
  // the same race in either unit asks for the same pace, just written differently
  close(Pace.analyze(13.109375, 'mi', 5027).requiredPace,
        Pace.analyze(21.0975, 'km', 5027).requiredPace * Pace.KM_PER_MI, 1e-9, 'pace across units');
});
test('bands as races really land', function () {
  assert.strictEqual(Pace.verdictFor(Pace.analyze(10, 'km', 2400)).text, 'Slightly behind pace'); // 10k in 40:00
  assert.strictEqual(Pace.verdictFor(Pace.analyze(21.0975, 'km', 5027)).text, 'Slightly behind pace'); // half at PR pace
  assert.strictEqual(Pace.verdictFor(Pace.analyze(20, 'mi', 7200)).text, 'Large PR');            // 20mi in 2:00
  assert.strictEqual(Pace.verdictFor(Pace.analyze(5, 'km', 1440)).text, 'Slightly behind pace'); // 5k in 24:00
  assert.strictEqual(Pace.verdictFor(Pace.analyze(40, 'km', 9680)).text, 'Behind pace');        // 40k in 2:41:20
  assert.strictEqual(Pace.verdictFor(Pace.analyze(40, 'km', 10060)).text, 'Not today');          // past PR time
});

// --- rounded race distances -------------------------------------------------
test('26.2 miles means the marathon, not 26.200', function () {
  assert.strictEqual(Pace.snapDistance(26.2, 'mi'), Pace.MARATHON_MI);
  assert.strictEqual(Pace.snapDistance(13.1, 'mi'), Pace.MARATHON_MI / 2);
  assert.strictEqual(Pace.snapDistance(42.2, 'km'), Pace.MARATHON_KM);
  assert.strictEqual(Pace.snapDistance(21.1, 'km'), Pace.MARATHON_KM / 2);
  assert.strictEqual(Pace.snapDistance(26, 'mi'), 26, 'a plain 26 stays 26');
  assert.strictEqual(Pace.snapDistance(26.5, 'mi'), 26.5, 'so does 26.5');
  assert.strictEqual(Pace.snapDistance(42, 'km'), 42);
  assert.strictEqual(Pace.snapDistance(0, 'mi'), 0);
});
test('a PB-pace 26.2 is level, not 7s slow', function () {
  var r = Pace.analyze(26.2, 'mi', Pace.PB_SECONDS);
  assert.strictEqual(r.status, 'finished');
  assert.strictEqual(r.pr, false, 'level is not a PR');
  assert.strictEqual(r.delta, 0);
  assert.strictEqual(Pace.gapTextFor(r), 'right on the PB');
});
test('a PB-pace 42.2km reads the same as a PB-pace 26.2mi', function () {
  var mi = Pace.analyze(26.2, 'mi', Pace.PB_SECONDS - 60);
  var km = Pace.analyze(42.2, 'km', Pace.PB_SECONDS - 60);
  assert.strictEqual(mi.status, 'finished');
  assert.strictEqual(km.status, 'finished');
  assert.strictEqual(mi.delta, -60);
  assert.strictEqual(km.delta, -60);
  assert.strictEqual(Pace.verdictFor(mi).text, 'PR!');
  assert.strictEqual(Pace.verdictFor(km).text, 'PR!');
});
test('a real 26.2 (not the marathon) still projects', function () {
  var r = Pace.analyze(26, 'mi', 7200);
  assert.strictEqual(r.status, 'on');
  close(r.avgPace, 7200 / 26, 1e-9, 'avg pace');
});
test('converting units keeps standard distances exact', function () {
  close(Pace.convertDistance(26.2, 'mi', 'km'), 42.195, 1e-9, '26.2 mi -> marathon km');
  close(Pace.convertDistance(13.1, 'mi', 'km'), 21.0975, 1e-9, '13.1 mi -> half km');
  close(Pace.convertDistance(42.2, 'km', 'mi'), Pace.MARATHON_MI, 1e-9, '42.2 km -> marathon mi');
  close(Pace.convertDistance(10, 'km', 'mi'), 10 / 1.609344, 1e-9, 'a plain 10 km');
  close(Pace.convertDistance(Pace.MARATHON_MI, 'mi', 'mi'), Pace.MARATHON_MI, 1e-9, 'same unit is a no-op');
  assert.strictEqual(Pace.convertDistance(0, 'mi', 'km'), 0);
});
test('fmtDistance writes standard distances back in their familiar form', function () {
  assert.strictEqual(Pace.fmtDistance(42.195, 'km'), '42.2');
  assert.strictEqual(Pace.fmtDistance(21.0975, 'km'), '21.1');
  assert.strictEqual(Pace.fmtDistance(26.218757, 'mi'), '26.2');
  assert.strictEqual(Pace.fmtDistance(13.109379, 'mi'), '13.1');
  assert.strictEqual(Pace.fmtDistance(10, 'km'), '10');
  assert.strictEqual(Pace.fmtDistance(6.21371, 'mi'), '6.21');
  assert.strictEqual(Pace.fmtDistance(9.5, 'mi'), '9.5');
});

if (failures) {
  console.log('\n' + failures + ' test(s) failed');
  process.exit(1);
}
console.log('\nall tests passed');
