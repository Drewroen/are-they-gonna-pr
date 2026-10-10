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

  /* The band that decides the verdict, measured on the pace the rest of the race
     has to be run at, compared with the even split a PR averages:
       cushion = requiredPace / pbPace - 1
       cushion >=  +3%  -> "Large PR"            (room to give away)
       0 .. +3%         -> "On pace to PR"       (the rest is about PR pace)
       0 .. -3%         -> "Slightly behind pace"
       worse than -3%   -> "Behind pace"         (the rest must be run >3% quick)
     How hard the rest of the race is says more about a PR than how far the
     average so far projects, and it is unit-free: the same numbers in km or mi. */
  var PACE_BAND = 0.03;

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
   *   pbPace     — the even split a PB run averages (PB / marathon distance)
   *   requiredPaceRatio — requiredPace / pbPace: 1 = the rest is exactly PB pace,
   *                  <1 = the rest has to be faster than PB pace, >1 = slower
   *   cushion    — requiredPaceRatio - 1: the fraction of PB pace the rest of the
   *                  race can be run slower by (+ = ahead, - = behind)
   *   band       — 'large-pr' | 'on-pace' | 'slightly-behind' | 'behind' | null,
   *                  the cushion against PACE_BAND; null when there is no verdict
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
      requiredPace: null,
      pbPace: null,
      requiredPaceRatio: null,
      cushion: null,
      band: null
    };

    if (!isFinite(d) || !isFinite(t) || d <= 0 || t <= 0) {
      base.status = 'incomplete';
      return base;
    }

    var remaining = D - d;
    base.avgPace = t / d;
    base.pbPace = PB_SECONDS / D;

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
    base.requiredPaceRatio = base.requiredPace / base.pbPace;

    if (t >= PB_SECONDS) {
      // Every second of the PB has been spent with distance still to run.
      base.status = 'impossible';
      base.overSeconds = t - PB_SECONDS;
      return base;
    }

    base.onPace = base.projected < PB_SECONDS;
    base.status = base.onPace ? 'on' : 'off';
    base.cushion = base.requiredPaceRatio - 1;
    base.band = cushionBand(base.cushion);
    return base;
  }

  /* The cushion -> one of the four states. A cushion of exactly 0 is the tie:
     the rest has to be run at PR pace, which is not a PR, so it reads behind. */
  function cushionBand(cushion) {
    if (typeof cushion !== 'number' || !isFinite(cushion)) return null;
    if (cushion >= PACE_BAND) return 'large-pr';
    if (cushion > 0) return 'on-pace';
    if (cushion >= -PACE_BAND) return 'slightly-behind';
    return 'behind';
  }

  /*
   * The verdict in words, straight off the cushion — how much of PB pace the rest
   * of the race can be run slower by (negative = the rest must be quicker):
   *   >= +3%  "Large PR"     0 .. +3%  "On pace to PR"
   *   0 .. -3%  "Slightly behind pace"   worse  "Behind pace"
   * Special states keep their own wording: nothing typed, a finished race (PR! /
   * No PR), and a PB already spent with distance left ("Not today").
   */
  function verdictFor(r) {
    if (!r || r.status === 'incomplete') return { text: '', tone: 'idle' };
    if (r.status === 'finished') return r.pr ? { text: 'PR!', tone: 'on' } : { text: 'No PR', tone: 'off' };
    if (r.status === 'impossible') return { text: 'Not today', tone: 'off' };

    var band = r.band || cushionBand(r.cushion);
    if (band === 'large-pr') return { text: 'Large PR', tone: 'on' };
    if (band === 'on-pace') return { text: 'On pace to PR', tone: 'on' };
    if (band === 'slightly-behind') return { text: 'Slightly behind pace', tone: 'off' };
    if (band === 'behind') return { text: 'Behind pace', tone: 'off' };
    return { text: '', tone: 'idle' };
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
    PACE_BAND: PACE_BAND,
    cushionBand: cushionBand,
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
