/* Splits parser for "Are They Gonna PR?" — turns a mika:timing result page
   (results.chicagomarathon.com / chicago-history.r.mikatiming.com) into JSON
   the page can feed straight into pace.js.

   Two halves:
     parseDetail(html)  — pure, no network, no DOM. Works in browser + node.
     fetchSplits(...)   — node-only helpers: find a runner, pull the page.

   The site has a JSON API (/2026/index.php?content=ajax2&func=...) but it only
   serves search + leaderboard rows (latest split only). The per-split table is
   server-rendered HTML, so that is what we parse.

   UMD, like pace.js: window.Splits in the browser, module.exports in node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require);
  else root.Splits = factory(null);
}(typeof self !== 'undefined' ? self : this, function (nodeRequire) {
  'use strict';

  var KM_PER_MI = 1.609344;
  var MARATHON_KM = 42.195;
  var HALF_KM = 21.0975;
  var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

  // ---------------------------------------------------------------- text ----

  var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
                   ndash: '\u2013', mdash: '\u2014', '#39': "'", '#8211': '\u2013' };

  function decode(s) {
    return String(s).replace(/&(#?[a-z0-9]+);/gi, function (m, e) {
      var k = e.toLowerCase();
      return ENTITIES[k] !== undefined ? ENTITIES[k] : m;
    });
  }

  /* cell text with tags off and whitespace squeezed — "" for a missing value */
  function cellText(html) {
    return decode(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  }

  /* the site writes "no value yet" three ways; they all mean null */
  function value(html) {
    var t = cellText(html);
    return (t === '' || t === '\u2013' || t === '-' || t === '--') ? null : t;
  }

  /* "00:22:53" / "22:53" / "1:02:05" -> seconds; null when unparseable */
  function clockToSeconds(s) {
    if (s === null || s === undefined) return null;
    var parts = String(s).trim().split(':');
    if (parts.length < 2 || parts.length > 3) return null;
    var secs = 0;
    for (var i = 0; i < parts.length; i++) {
      var n = parseFloat(parts[i]);
      if (!isFinite(n)) return null;
      secs = secs * 60 + n;
    }
    return secs;
  }

  function num(s) {
    if (s === null || s === undefined) return null;
    var n = parseFloat(String(s).replace(/[^\d.\-]/g, ''));
    return isFinite(n) ? n : null;
  }

  // ------------------------------------------------------------- splits ----

  /* Distance a split label sits at. Labels are the source of truth: "05K",
     "HALF", "Mile 25.2", "Finish". The archive template appends a bold "*" to
     unofficial/estimated splits ("35K *"), so decoration is stripped first.
     Unknown label -> null (the time is still kept). */
  function distanceKmFor(label, key) {
    var t = String(label || '').replace(/[^0-9A-Za-z. ]/g, '').replace(/\s+/g, ' ').trim();
    var m = /^(\d+(?:\.\d+)?)\s*K$/i.exec(t);
    if (m) return parseFloat(m[1]);
    m = /^Mile\s+(\d+(?:\.\d+)?)$/i.exec(t);
    if (m) return parseFloat(m[1]) * KM_PER_MI;
    if (/^HALF$/i.test(t)) return HALF_KM;
    if (/^Finish/i.test(t)) return MARATHON_KM;
    if (key === '52') return HALF_KM;
    if (/^finish/.test(key || '')) return MARATHON_KM;
    return null;
  }

  var SPLIT_LABELS = { '05': '05K', 10: '10K', 15: '15K', 20: '20K', 52: 'HALF',
                       25: '25K', 30: '30K', 35: '35K', 40: '40K' };

  function normalizeLabel(label, key) {
    var t = String(label || '').trim();
    if (t) return t;
    return SPLIT_LABELS[key] || (key ? key.toUpperCase() : '');
  }

  /* [start, end) of the splits box — parseSplits reads it, parseFields skips it */
  function splitsBoxRange(html) {
    var start = html.indexOf('id="detail-box-splits"');
    if (start < 0) return null;
    var end = html.indexOf('<div class="detail-box', start + 10);
    return { start: start, end: end > 0 ? end : html.length };
  }

  function parseSplits(html) {
    var out = [];
    var range = splitsBoxRange(html);
    if (!range) return out;
    var box = html.slice(range.start, range.end);

    var rows = /<tr[^>]*class="([^"]*\bf-time_[^"]*)"[^>]*>([\s\S]*?)<\/tr>/g;
    var m;
    while ((m = rows.exec(box)) !== null) {
      var row = m[2];
      var keyMatch = /f-time_([a-z0-9_]+)/.exec(m[1]);
      var key = keyMatch ? keyMatch[1] : '';
      var labelMatch = /<th[^>]*>([\s\S]*?)<\/th>/.exec(row);
      var label = normalizeLabel(cellText(labelMatch ? labelMatch[1] : ''), key);

      var cells = {};
      var td = /<td[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g;
      var c;
      while ((c = td.exec(row)) !== null) {
        cells[c[1].split(/\s+/)[0]] = value(c[2]);
      }

      var km = distanceKmFor(label, key);
      var elapsed = clockToSeconds(cells.time);
      var segment = clockToSeconds(cells.diff);
      var paceKm = clockToSeconds(cells.min_km);
      var paceMi = clockToSeconds(cells.min_mile);

      out.push({
        key: key,
        label: label,
        distanceKm: km,
        distanceMi: km === null ? null : km / KM_PER_MI,
        timeOfDay: cells.time_day || null,
        elapsed: cells.time || null,
        elapsedSeconds: elapsed,
        segment: cells.diff || null,
        segmentSeconds: segment,
        paceSecPerKm: paceKm,
        paceSecPerMi: paceMi,
        kmh: num(cells.kmh),
        mph: num(cells.miles_h),
        hadTime: elapsed !== null
      });
    }
    return out;
  }

  // ------------------------------------------------------- detail boxes ----

  var FIELD_NAMES = {
    __fullname: 'name', start_no_text: 'bib', start_no: 'bib', __city_state: 'city',
    _type_age_class: 'division', _type_sex: 'gender', display_name_short: 'short',
    event_name: 'eventName', event_date: 'eventDate',
    starttime_net: 'startTime', place_all: 'placeGender', place_age: 'placeAgeGroup',
    place_nosex: 'placeOverall', time_finish_netto: 'finishTime',
    time_finish: 'finishGunTime', __race_status: 'raceStatus',
    __last_split_name: 'lastSplit', __estimated_finish: 'predictedFinish',
    __estimated_finish_day: 'predictedFinishDay', __total_min_mile: 'minPerMile',
    __total_kmh: 'kmh'
  };

  /* bib is f-start_no_text on the current template, f-start_no on the archive */
  function bibFrom(fields) {
    var a = fields.start_no_text, b = fields.start_no;
    return a ? a.value : (b ? b.value : null);
  }

  /* Every <tr class="f-..."> on the page, keyed by its mika field name.
     Rows inside the splits box are skipped: it reuses result field names (its
     Finish row is f-time_finish_netto, but its cells are split columns, not a
     result value) and the splits themselves come from parseSplits. */
  function parseFields(html) {
    var fields = {};
    var range = splitsBoxRange(html);
    var rows = /<tr[^>]*class="([^"]*\bf-[^"]*)"[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
    var m;
    while ((m = rows.exec(html)) !== null) {
      if (range && m.index >= range.start && m.index < range.end) continue;
      var token = /(?:^|\s)(f-[a-z0-9_\-]+)/i.exec(m[1]);
      if (!token) continue;
      var entry = { name: cellText(m[2]), value: value(m[3]) };
      if (entry.value === null) continue;
      fields[token[1].slice(2)] = entry;
    }
    return fields;
  }

  function runnerFrom(fields) {
    var pick = function (k) { return fields[k] ? fields[k].value : null; };
    var name = pick('__fullname');
    return {
      name: name,
      nameOnly: name ? name.replace(/\s*\([^)]*\)\s*$/, '') : null,
      bib: bibFrom(fields),
      city: pick('__city_state'),
      division: pick('_type_age_class'),
      gender: pick('_type_sex'),
      short: pick('display_name_short')
    };
  }

  /* ids the page leaks about itself: idp / event / year / meeting.
     Entity-decoded first: mika writes og:url with &amp; between params. */
  function metaFrom(rawHtml) {
    var html = decode(rawHtml);
    var meta = { idp: null, event: null, year: null, meeting: null };
    var m = /[?&]idp=([0-9A-Za-z]+)/.exec(html);
    if (m) meta.idp = m[1];
    m = /[?&]event=(MAR_[0-9A-Za-z]+)/.exec(html);
    if (m) meta.event = m[1];
    else {
      m = /"event_id"\s*:\s*"([A-Z]+)"/.exec(html);
      if (m) meta.event = m[1];
    }
    m = /event_main_group=(\d{4})/.exec(html);
    if (m) meta.year = m[1];
    m = /"meeting"\s*:\s*"([0-9A-Za-z]+)"/.exec(html);
    if (m) meta.meeting = m[1];
    return meta;
  }

  /* The newest split that actually has a time — what the race tracker needs. */
  function latest(splits) {
    var best = null;
    for (var i = 0; i < splits.length; i++) {
      var s = splits[i];
      if (!s.hadTime || s.distanceKm === null) continue;
      if (!best || s.distanceKm > best.distanceKm) best = s;
    }
    return best;
  }

  /* Ready-made input for pace.js: Pace.analyze(r.distance, r.unit, r.seconds) */
  function paceInput(splits, unit) {
    var u = unit === 'mi' ? 'mi' : 'km';
    var s = latest(splits);
    if (!s) return null;
    return {
      distance: u === 'mi' ? s.distanceMi : s.distanceKm,
      unit: u,
      seconds: s.elapsedSeconds,
      label: s.label
    };
  }

  function parseDetail(html, opts) {
    opts = opts || {};
    var fields = parseFields(html);
    var splits = parseSplits(html);
    var meta = metaFrom(html);
    var runner = runnerFrom(fields);
    var v = function (name) { return fields[name] ? fields[name].value : null; };

    // A live page fills the whole table as soon as the runner starts: the mats
    // still ahead carry projected times (the "*" marker). The Race Status box
    // names the last split that actually happened, so anything past it has not
    // been run yet, whatever the table shows. Keep the page's projection on the
    // row, but not as a time he has.
    var officialKm = distanceKmFor(v('__last_split_name'), null);
    if (officialKm !== null) {
      splits.forEach(function (s) {
        if (s.distanceKm !== null && s.distanceKm > officialKm + 1e-6) {
          s.projected = true;
          s.hadTime = false;
        }
      });
    }

    // finish row of the splits table: the archive template leaves the Result
    // box empty and only carries the finish here
    var finishSplit = splits.filter(function (s) { return /^finish/.test(s.key) && s.hadTime; })[0] || null;
    var finishField = v('time_finish_netto') || v('time_finish');
    var finishTime = finishField || (finishSplit && finishSplit.elapsed);
    var lastSplit = latest(splits);

    return {
      url: opts.url || null,
      idp: opts.idp || meta.idp,
      event: opts.event || meta.event,
      year: opts.year || meta.year,
      meeting: opts.meeting || meta.meeting,
      race: { name: v('event_name'), date: v('event_date') },
      runner: runner,
      result: {
        placeGender: v('place_all'),
        placeAgeGroup: v('place_age'),
        placeOverall: v('place_nosex'),
        finishTime: finishTime,
        finishSeconds: clockToSeconds(finishTime),
        finishFrom: finishField ? 'result' : (finishSplit && finishSplit.elapsedSeconds !== null ? 'split' : null)
      },
      status: {
        raceStatus: v('__race_status'),
        lastSplit: v('__last_split_name') || (lastSplit && lastSplit.label),
        predictedFinish: v('__estimated_finish'),
        predictedFinishSeconds: clockToSeconds(v('__estimated_finish')),
        predictedFinishDay: v('__estimated_finish_day'),
        startTime: v('starttime_net')
      },
      splits: splits,
      latest: lastSplit,
      fields: fields
    };
  }

  // -------------------------------------------------------- node network ----

  function request(url, opts, redirects) {
    if (!nodeRequire) throw new Error('network helpers need node (browser: fetch the page yourself, then parseDetail)');
    var https = nodeRequire('https');
    opts = opts || {};
    redirects = redirects === undefined ? 5 : redirects;
    var parsed = new URL(url);
    var body = opts.form ? new URLSearchParams(opts.form).toString() : null;
    return new Promise(function (resolve, reject) {
      var req = https.request({
        method: opts.method || (body ? 'POST' : 'GET'),
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: Object.assign({
          'User-Agent': UA,                 // the site 403s anything else
          'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'X-Requested-With': 'XMLHttpRequest'
        }, body ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Content-Length': Buffer.byteLength(body) } : {})
      }, function (res) {
        // past years 301 to chicago-history.r.mikatiming.com — follow it
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects <= 0) return reject(new Error('too many redirects for ' + url));
          var next = new URL(res.headers.location, url).href;
          var keep = res.statusCode === 307 || res.statusCode === 308;
          return resolve(request(next, keep ? opts : { method: opts.method }, redirects - 1));
        }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          var text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
          resolve(text);
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, function () { req.destroy(new Error('timeout for ' + url)); });
      if (body) req.write(body);
      req.end();
    });
  }

  function baseUrl(o) {
    o = o || {};
    return 'https://' + (o.host || 'results.chicagomarathon.com') + '/' + (o.year || new Date().getFullYear()) + '/';
  }

  /* results page for one runner; event/event_main_group keep older years honest */
  function detailUrl(o) {
    o = o || {};
    var q = ['content=detail', 'idp=' + o.idp];
    if (o.event) q.push('event=' + o.event);
    if (o.year) q.push('event_main_group=' + o.year);
    q.push('lang=' + (o.lang || 'EN_CAP'));
    return baseUrl(o) + '?' + q.join('&');
  }

  /* the site's own search: name or bib -> [{ idp, label, bib, event_id, ... }] */
  function findRunner(query, o) {
    o = o || {};
    var url = baseUrl(o) + 'index.php?content=ajax2&func=getSearchResult';
    return request(url, {
      form: { func: 'getSearchResult', 'options[string]': query,
              'options[pid]': 'start', 'options[lang]': o.lang || 'EN_CAP' }
    }).then(function (text) {
      var rows = JSON.parse(text);
      return rows.map(function (r) {
        return { idp: r.id, label: r.label, name: r.value, bib: r.start_no,
                 eventId: r.event_id, meeting: r.meeting };
      });
    });
  }

  /* page -> parsed result. Pass { idp } (plus event/year when you know them). */
  function fetchSplits(o) {
    o = o || {};
    var url = o.url || detailUrl(o);
    return request(url).then(function (html) {
      var parsed = parseDetail(html, { url: url, idp: o.idp });
      if (o.year) parsed.year = String(o.year);
      if (o.event) parsed.event = o.event;
      return parsed;
    });
  }

  return {
    KM_PER_MI: KM_PER_MI,
    MARATHON_KM: MARATHON_KM,
    HALF_KM: HALF_KM,
    UA: UA,
    FIELD_NAMES: FIELD_NAMES,
    decode: decode,
    clockToSeconds: clockToSeconds,
    distanceKmFor: distanceKmFor,
    parseSplits: parseSplits,
    parseFields: parseFields,
    parseDetail: parseDetail,
    metaFrom: metaFrom,
    latest: latest,
    paceInput: paceInput,
    baseUrl: baseUrl,
    detailUrl: detailUrl,
    findRunner: findRunner,
    fetchSplits: fetchSplits,
    request: request
  };
}));
