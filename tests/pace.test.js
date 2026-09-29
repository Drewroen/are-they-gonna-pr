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
});

test('half marathon in 1:23:20 is on pace', function () {
  var r = Pace.analyze(21.0975, 'km', 5000);
  assert.strictEqual(r.status, 'on');
  close(r.projected, 10000, 0.5, 'projected');
  close(r.delta, -54, 0.5, 'delta');
  close(r.avgPace, 237.0, 0.1, 'avg pace');
  assert.ok(r.requiredPace > r.avgPace, 'can afford to slow down');
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
});

test('5k in 24:00 -> off pace', function () {
  var r = Pace.analyze(5, 'km', 1440);
  assert.strictEqual(r.status, 'off');
  close(r.avgPace, 288, 1e-9, 'avg pace');
  close(r.projected, 12152.16, 0.01, 'projected');
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

if (failures) {
  console.log('\n' + failures + ' test(s) failed');
  process.exit(1);
}
console.log('\nall tests passed');
