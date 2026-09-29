/* Pace math for "Are They Gonna PR?" — pure functions, no DOM.
   Works in the browser (window.Pace) and in node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pace = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KM_PER_MI = 1.609344;
  var MARATHON_KM = 42.195;
  var MARATHON_MI = MARATHON_KM / KM_PER_MI; // 26.21875
  var PB = { h: 2, m: 47, s: 34 };
  var PB_SECONDS = PB.h * 3600 + PB.m * 60 + PB.s; // 10054

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function distanceFor(unit) { return unit === 'mi' ? MARATHON_MI : MARATHON_KM; }

  /* Rounded race distances ("26.2", "13.1") are shorthand for the real thing.
     Snapping them keeps a PB-pace marathon from reading 7s slow just because
     a marathon is 26.2188 miles, not 26.2. */
  var STANDARD = {
    mi: [MARATHON_MI, MARATHON_MI / 2],
    km: [MARATHON_KM, MARATHON_KM / 2]
  };
  var SNAP_TOLERANCE = 0.0015; // 0.15%

  function snapDistance(d, unit) {
    var list = STANDARD[unit] || [];
    for (var i = 0; i < list.length; i++) {
      if (d !== list[i] && Math.abs(d - list[i]) / list[i] <= SNAP_TOLERANCE) return list[i];
    }
    return d;
  }

  /* the same distance in the other unit, with rounded race distances kept exact */
  function convertDistance(d, fromUnit, toUnit) {
    if (!isFinite(d) || d <= 0) return d;
    var km = snapDistance(d, fromUnit === 'mi' ? 'mi' : 'km') * (fromUnit === 'mi' ? KM_PER_MI : 1);
    return toUnit === 'mi' ? km / KM_PER_MI : km;
  }

  /* How a distance is written back into the field: standard race distances get
     their familiar name (26.2 / 42.2 / 13.1 / 21.1), everything else rounds. */
  var SHORTHAND = {
    mi: [['26.2', MARATHON_MI], ['13.1', MARATHON_MI / 2]],
    km: [['42.2', MARATHON_KM], ['21.1', MARATHON_KM / 2]]
  };

  function fmtDistance(v, unit) {
    var list = SHORTHAND[unit === 'mi' ? 'mi' : 'km'];
    for (var i = 0; i < list.length; i++) {
      if (Math.abs(v - list[i][1]) / list[i][1] <= SNAP_TOLERANCE) return list[i][0];
    }
    if (Math.abs(v - Math.round(v)) < 0.005) return String(Math.round(v));
    return String(Math.round(v * 100) / 100);
  }

  /* "2:47:34" / "6:23.5" — seconds under an hour print as m:ss */
  function fmtClock(totalSeconds) {
    var s = Math.round(totalSeconds);
    var neg = s < 0;
    s = Math.abs(s);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return (neg ? '-' : '') + (h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec));
  }

  /* pace, one decimal on the seconds: "3:58.3" */
  function fmtPace(secondsPerUnit) {
    var neg = secondsPerUnit < 0;
    var s = Math.abs(secondsPerUnit);
    var m = Math.floor(s / 60);
    var rest = s - m * 60;
    return (neg ? '-' : '') + m + ':' + (rest < 10 ? '0' : '') + rest.toFixed(1);
  }

  /* Signed gap for display: "+0:34" / "-1:23" from a positive/negative delta. */
  function fmtGap(seconds) {
    var s = Math.round(Math.abs(seconds));
    var neg = seconds < 0;
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var body = h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
    return (neg ? '-' : '+') + body;
  }

  /*
   * analyze(distance, unit, seconds) -> result
   *   status: 'incomplete' | 'on' | 'off' | 'impossible' | 'finished'
   *   projected  — finish time if the average pace so far holds
   *   delta      — projected - PB (negative = faster than PB); for 'finished' it is t - PB
   *   requiredPace — max average pace for the remaining distance that still beats PB
   */
  function analyze(distance, unit, seconds) {
    var u = unit === 'mi' ? 'mi' : 'km';
    var D = distanceFor(u);
    var d = Number(distance);
    var t = Number(seconds);
    if (isFinite(d) && d > 0) d = snapDistance(d, u);

    var base = {
      pbSeconds: PB_SECONDS,
      unit: u,
      fullDistance: D,
      distance: isFinite(d) ? d : null,
      seconds: isFinite(t) ? t : null,
      remaining: null,
      avgPace: null,
      projected: null,
      delta: null,
      requiredPace: null
    };

    if (!isFinite(d) || !isFinite(t) || d <= 0 || t <= 0) {
      base.status = 'incomplete';
      return base;
    }

    var remaining = D - d;
    base.avgPace = t / d;

    if (d >= D) {
      base.status = 'finished';
      base.remaining = 0;
      base.delta = t - PB_SECONDS;
      base.pr = t < PB_SECONDS;
      return base;
    }

    base.remaining = remaining;
    base.projected = (t / d) * D;
    base.delta = base.projected - PB_SECONDS;
    base.requiredPace = (PB_SECONDS - t) / remaining;

    if (t >= PB_SECONDS) {
      // Every second of the PB has been spent with distance still to run.
      base.status = 'impossible';
      base.overSeconds = t - PB_SECONDS;
      return base;
    }

    base.onPace = base.projected < PB_SECONDS;
    base.status = base.onPace ? 'on' : 'off';
    return base;
  }

  /*
   * The verdict in words, tiered by how far the projection is from the PB:
   *   10%+ behind -> "Not today"            5-10% behind -> "Falling off pace"
   *   0-5% behind -> "Slightly behind pace" 0-5% ahead   -> "On pace for a small PR"
   *   5%+ ahead   -> "On pace for a big PR"
   */
  function verdictFor(r) {
    if (!r || r.status === 'incomplete') return { text: '', tone: 'idle' };
    if (r.status === 'finished') return r.pr ? { text: 'PR!', tone: 'on' } : { text: 'No PR', tone: 'off' };
    if (r.status === 'impossible') return { text: 'Not today', tone: 'off' };

    var pct = (r.projected - r.pbSeconds) / r.pbSeconds * 100;
    if (pct >= 10) return { text: 'Not today', tone: 'off' };
    if (pct >= 5) return { text: 'Falling off pace', tone: 'off' };
    // a projection dead on the PB counts as behind: a PR has to be under it
    if (pct >= 0) return { text: 'Slightly behind pace', tone: 'off' };
    if (pct > -5) return { text: 'On pace for a small PR', tone: 'on' };
    return { text: 'On pace for a big PR', tone: 'on' };
  }

  /* the estimate under the verdict: how far ahead of or behind the PB it lands */
  function gapTextFor(r) {
    if (!r || r.status === 'incomplete') return '';
    if (r.status === 'impossible') return fmtClock(r.overSeconds) + ' past the PB';
    if (Math.abs(r.delta) < 0.5) return 'right on the PB';
    return fmtClock(Math.abs(r.delta)) + (r.delta < 0 ? ' under the PB' : ' over the PB');
  }

  return {
    KM_PER_MI: KM_PER_MI,
    MARATHON_KM: MARATHON_KM,
    MARATHON_MI: MARATHON_MI,
    PB: PB,
    PB_SECONDS: PB_SECONDS,
    distanceFor: distanceFor,
    snapDistance: snapDistance,
    convertDistance: convertDistance,
    fmtDistance: fmtDistance,
    analyze: analyze,
    verdictFor: verdictFor,
    gapTextFor: gapTextFor,
    fmtClock: fmtClock,
    fmtPace: fmtPace,
    fmtGap: fmtGap
  };
}));
