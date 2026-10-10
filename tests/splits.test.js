/* Tests for splits.js — node tests/splits.test.js  (no dependencies)
   Fixtures are trimmed copies of real markup from
   results.chicagomarathon.com (2025 race, mid-pack runner) plus the empty
   2026 template with its mile splits. */
'use strict';
var assert = require('assert');
var Splits = require('../splits.js');

var failures = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

/* --------------------------------------------------------------- fixtures */

function row(key, label, cells) {
  var order = ['time_day', 'time', 'diff', 'min_km', 'kmh', 'min_mile', 'miles_h'];
  var body = order.map(function (c) {
    var v = cells[c];
    if (v === undefined) return '';
    return v === null ? '<td class="' + c + '"><span class="text-muted">&ndash;</span></td>'
                      : '<td class="' + c + '">' + v + '</td>';
  }).join('');
  return '<tr class=" f-time_' + key + '" ><th  class="desc"    >' + label + '</th>' + body + '</tr>';
}

function box(id, title, fieldRows) {
  return '<div class="detail-box  box-x      "\n id="' + id + '" role=""><h3>' + title +
    '</h3><table class="table table-condensed"><tbody>' + fieldRows.join('') + '</tbody></table></div>';
}

function field(cls, name, value) {
  return '<tr class=" ' + cls + '" ><th  class="desc"    >' + name + '</th><td class="' + cls +
    ' last">' + (value === null ? '<span class="text-muted">&ndash;</span>' : value) + '</td></tr>';
}

var PAGE = [
  box('detail-box-general', 'Participant', [
    field('f-__fullname', 'Name (CTZ)', 'Smith, Abby (USA)'),
    field('f-start_no_text', 'Bib Number', '16110'),
    field('f-__city_state', 'City, State', 'Chicago'),
    field('f-_type_age_class', 'Division', '25-29'),
    field('f-_type_sex', 'Gender', 'Woman')
  ]),
  box('detail-box-other', 'Race Info', [field('f-starttime_net', 'Start Time', '07:20:00AM')]),
  box('detail-box-totals', 'Result', [
    field('f-place_all', 'Place Gender', '1841'),
    field('f-place_age', 'Place Age Group', '312'),
    field('f-place_nosex', 'Place Overall', '6120'),
    field('f-time_finish_netto', 'Finish Time', '03:25:55')
  ]),
  box('detail-box-state', 'Race Status', [
    field('f-__race_status', 'Race Status', 'Finished'),
    field('f-__last_split_name', 'Last Split', 'Finish'),
    field('f-__estimated_finish', 'Pred. Finish', '03:25:55')
  ]),
  '<div class="detail-box  box-splits      " id="detail-box-splits" role=""><h3>Splits</h3>' +
  '<div class="table-responsive"><table><thead><tr class="" ><th class="desc">Split</th>' +
  '<th class="time">Time</th><th class="diff">Diff</th></tr></thead><tbody>' +
  row('05', '05K', { time_day: '08:14:30AM', time: '00:22:53', diff: '22:53', min_km: '04:35', kmh: '13.11', min_mile: '07:22', miles_h: '8.15' }) +
  row('10', '10K', { time_day: '08:37:47AM', time: '00:46:10', diff: '23:17', min_km: '04:40', kmh: '12.89', min_mile: '07:30', miles_h: '8.01' }) +
  row('52', 'HALF', { time_day: '09:30:24AM', time: '01:38:46', diff: '05:18', min_km: '04:51', kmh: '12.41', min_mile: '07:47', miles_h: '7.71' }) +
  row('80', 'Mile 20', { time: null, diff: null, min_km: '00:00', kmh: null, min_mile: '00:00', miles_h: '0.00' }) +
  row('finish_netto', 'Finish', { time_day: '11:17:33AM', time: '03:25:55', diff: '11:09', min_km: '05:05', kmh: '11.80', min_mile: '08:11', miles_h: '7.34' }) +
  '</tbody></table></div></div>',
  '</div><!-- untabbed-boxes -->',
  '<a href="#" data-silver="63,111,110,116,101,110,116,61,100,101,116,97,105,108,38,105,100,112,61,57,84,71,71,57,54,51,56,50,66,55,49,57,48"></a>'
].join('\n');

var parsed = Splits.parseDetail(PAGE, { url: 'https://example.invalid' });

/* ------------------------------------------------------------------ tests */

test('text + clock helpers', function () {
  assert.strictEqual(Splits.decode('a &amp; b &ndash; c'), 'a & b \u2013 c');
  assert.strictEqual(Splits.clockToSeconds('00:22:53'), 1373);
  assert.strictEqual(Splits.clockToSeconds('22:53'), 1373);
  assert.strictEqual(Splits.clockToSeconds('1:02:05'), 3725);
  assert.strictEqual(Splits.clockToSeconds('5:05'), 305);
  assert.strictEqual(Splits.clockToSeconds(''), null);
  assert.strictEqual(Splits.clockToSeconds(null), null);
});

test('label -> distance', function () {
  assert.strictEqual(Splits.distanceKmFor('05K'), 5);
  assert.strictEqual(Splits.distanceKmFor('25K'), 25);
  assert.strictEqual(Splits.distanceKmFor('42K'), 42);
  assert.strictEqual(Splits.distanceKmFor('HALF'), 21.0975);
  assert.strictEqual(Splits.distanceKmFor('Finish'), 42.195);
  assert.strictEqual(Math.abs(Splits.distanceKmFor('Mile 20') - 32.18688) < 1e-5, true);
  assert.strictEqual(Math.abs(Splits.distanceKmFor('Mile 25.2') - 40.5554) < 1e-3, true);
  // the archive template marks unofficial splits with a bold asterisk
  assert.strictEqual(Splits.distanceKmFor('35K *'), 35);
  assert.strictEqual(Splits.distanceKmFor('40K *'), 40);
  assert.strictEqual(Splits.distanceKmFor('Finish *'), 42.195);
  assert.strictEqual(Math.abs(Splits.distanceKmFor('Mile 25.2 *') - 40.5554) < 1e-3, true);
  assert.strictEqual(Splits.distanceKmFor('Weird'), null);
  assert.strictEqual(Splits.distanceKmFor('', '52'), 21.0975);   // key fallback
  assert.strictEqual(Splits.distanceKmFor('', 'finish_netto'), 42.195);
});

test('every split row is captured, in page order', function () {
  assert.deepStrictEqual(parsed.splits.map(function (s) { return s.label; }),
    ['05K', '10K', 'HALF', 'Mile 20', 'Finish']);
});

test('values land in the right columns', function () {
  var five = parsed.splits[0];
  assert.strictEqual(five.key, '05');
  assert.strictEqual(five.timeOfDay, '08:14:30AM');
  assert.strictEqual(five.elapsed, '00:22:53');
  assert.strictEqual(five.elapsedSeconds, 1373);
  assert.strictEqual(five.segment, '22:53');
  assert.strictEqual(five.segmentSeconds, 1373);
  assert.strictEqual(five.paceSecPerKm, 275);
  assert.strictEqual(five.paceSecPerMi, 442);
  assert.strictEqual(five.kmh, 13.11);
  assert.strictEqual(five.mph, 8.15);
  assert.strictEqual(five.distanceKm, 5);
  assert.strictEqual(five.hadTime, true);
});

test('an unrun split is null, not the string "00:00"', function () {
  var mile20 = parsed.splits[3];
  assert.strictEqual(mile20.elapsedSeconds, null);
  assert.strictEqual(mile20.segmentSeconds, null);
  assert.strictEqual(mile20.hadTime, false);
  assert.strictEqual(mile20.paceSecPerKm, 0);   // the site writes 00:00 here
  assert.strictEqual(mile20.distanceKm !== null, true);
});

test('latest() skips empty splits and takes the furthest', function () {
  assert.strictEqual(parsed.latest.label, 'Finish');
  assert.strictEqual(parsed.latest.elapsedSeconds, 12355);
  var early = Splits.latest(parsed.splits.slice(0, 2));
  assert.strictEqual(early.label, '10K');
  assert.strictEqual(Splits.latest([parsed.splits[3]]), null);   // only the empty one
});

test('paceInput() feeds pace.js in either unit', function () {
  var km = Splits.paceInput(parsed.splits, 'km');
  assert.strictEqual(km.unit, 'km');
  assert.strictEqual(km.distance, 42.195);
  assert.strictEqual(km.seconds, 12355);
  var mi = Splits.paceInput(parsed.splits, 'mi');
  assert.strictEqual(mi.unit, 'mi');
  assert.strictEqual(Math.abs(mi.distance - 26.218757) < 1e-5, true);
  assert.strictEqual(Splits.paceInput([], 'km'), null);
});

test('runner, result and status boxes', function () {
  assert.strictEqual(parsed.runner.name, 'Smith, Abby (USA)');
  assert.strictEqual(parsed.runner.nameOnly, 'Smith, Abby');
  assert.strictEqual(parsed.runner.bib, '16110');
  assert.strictEqual(parsed.runner.division, '25-29');
  assert.strictEqual(parsed.runner.gender, 'Woman');
  assert.strictEqual(parsed.result.finishTime, '03:25:55');
  assert.strictEqual(parsed.result.finishSeconds, 12355);
  assert.strictEqual(parsed.result.placeOverall, '6120');
  assert.strictEqual(parsed.status.raceStatus, 'Finished');
  assert.strictEqual(parsed.status.lastSplit, 'Finish');
  assert.strictEqual(parsed.status.startTime, '07:20:00AM');
});

test('no result yet -> nulls everywhere, no crash', function () {
  var empty = Splits.parseDetail([
    box('detail-box-totals', 'Result', [
      field('f-place_all', 'Place Gender', null),
      field('f-time_finish_netto', 'Finish Time', null)
    ]),
    box('detail-box-state', 'Race Status', [
      field('f-__race_status', 'Race Status', null),
      field('f-__estimated_finish', 'Pred. Finish', null)
    ]),
    '<div class="detail-box  box-splits      " id="detail-box-splits" role=""><h3>Splits</h3><div class="table-responsive"><table><tbody>' +
    row('05', '05K', { time_day: null, time: null, diff: null, min_km: '00:00', kmh: null, min_mile: '00:00', miles_h: '0.00' }) +
    row('finish_netto', 'Finish', { time: null, diff: null, min_km: '00:00', kmh: null, min_mile: '00:00', miles_h: '0.00' }) +
    '</tbody></table></div></div>'
  ].join('\n'));
  assert.strictEqual(empty.result.finishTime, null);
  assert.strictEqual(empty.result.finishSeconds, null);
  assert.strictEqual(empty.status.raceStatus, null);
  assert.strictEqual(empty.splits.length, 2);
  assert.strictEqual(empty.splits.every(function (s) { return !s.hadTime; }), true);
  assert.strictEqual(empty.latest, null);
  assert.strictEqual(empty.result.finishFrom, null);   // nothing timed to read it from
  assert.strictEqual(Splits.paceInput(empty.splits, 'km'), null);
});

test('page with no splits box -> empty list, not a throw', function () {
  var none = Splits.parseDetail('<html><body>nothing here</body></html>');
  assert.deepStrictEqual(none.splits, []);
  assert.strictEqual(none.latest, null);
});

test('idp/event/year are read off the page, explicit options win', function () {
  var html = PAGE + '<meta property="og:url" content="https://x/2025/?content=detail&amp;event=MAR_9TGG96381A5&amp;idp=9TGG96382B7190&amp;event_main_group=2025" />';
  var auto = Splits.parseDetail(html);
  assert.strictEqual(auto.idp, '9TGG96382B7190');
  assert.strictEqual(auto.event, 'MAR_9TGG96381A5');
  assert.strictEqual(auto.year, '2025');
  var forced = Splits.parseDetail(html, { idp: 'OVERRIDE', event: 'MAR_X', year: '2026' });
  assert.strictEqual(forced.idp, 'OVERRIDE');
  assert.strictEqual(forced.event, 'MAR_X');
  assert.strictEqual(forced.year, '2026');
});

test('detailUrl carries event + event_main_group', function () {
  var u = Splits.detailUrl({ idp: 'ABC', year: '2025', event: 'MAR_9TGG96381A5' });
  assert.strictEqual(u, 'https://results.chicagomarathon.com/2025/?content=detail&idp=ABC&event=MAR_9TGG96381A5&event_main_group=2025&lang=EN_CAP');
  assert.strictEqual(Splits.detailUrl({ idp: 'ABC', year: '2026', host: 'chicago-history.r.mikatiming.com' })
    .indexOf('https://chicago-history.r.mikatiming.com/2026/?content=detail&idp=ABC') === 0, true);
});

test('a 2026-style template with mile splits parses distances', function () {
  var t = Splits.parseDetail('<div class="detail-box  box-splits      " id="detail-box-splits" role=""><tbody>' +
    row('05', '05K', { time: null }) + row('80', 'Mile 20', { time: null }) +
    row('85', 'Mile 25', { time: null }) + row('96', 'Mile 25.2', { time: null }) +
    row('finish_netto', 'Finish', { time: null }) +
    '</tbody></div>');
  var d = t.splits.map(function (s) { return Math.round(s.distanceKm * 1000) / 1000; });
  assert.deepStrictEqual(d, [5, 32.187, 40.234, 40.555, 42.195]);
});

test('archive template: bib from f-start_no, finish read off the split row', function () {
  var archive = Splits.parseDetail([
    box('detail-box-general', 'Participant', [
      field('f-__fullname', 'Name (CTZ)', 'Korir, John (KEN)'),
      field('f-start_no', 'Bib Number', '1')
    ]),
    box('detail-box-totals', 'Result', [
      field('f-place_all', 'Place Gender', null),
      field('f-time_finish_netto', 'Finish Time', null)
    ]),
    '<div class="detail-box  box-splits      " id="detail-box-splits" role=""><h3>Splits</h3><div class="table-responsive"><table><tbody>' +
    row('05', '05K', { time_day: '07:43:58AM', time: '00:13:58', diff: '13:58', min_km: '02:48', kmh: '21.50', min_mile: '04:30', miles_h: '13.36' }) +
    row('finish_netto', 'Finish', { time_day: '09:31:08AM', time: '02:01:07', diff: '03:29', min_km: '02:52', kmh: '20.90', min_mile: '04:37', miles_h: '12.99' }) +
    '</tbody></table></div></div>'
  ].join('\n'));
  assert.strictEqual(archive.runner.bib, '1');
  assert.strictEqual(archive.result.finishTime, '02:01:07');
  assert.strictEqual(archive.result.finishSeconds, 7267);
  assert.strictEqual(archive.result.finishFrom, 'split');   // not the empty Result box
  assert.strictEqual(archive.status.lastSplit, 'Finish');   // falls back to the splits
  assert.strictEqual(archive.latest.elapsedSeconds, 7267);
});

test('the Result box wins when it does carry a finish time', function () {
  var both = Splits.parseDetail([
    box('detail-box-totals', 'Result', [field('f-time_finish_netto', 'Finish Time', '03:25:55')]),
    '<div class="detail-box  box-splits      " id="detail-box-splits" role=""><tbody>' +
    row('finish_netto', 'Finish', { time: '03:25:59', diff: '05:00' }) +
    '</tbody></div>'
  ].join('\n'));
  assert.strictEqual(both.result.finishTime, '03:25:55');
  assert.strictEqual(both.result.finishFrom, 'result');
});

if (failures) { console.log('\n' + failures + ' test(s) failed'); process.exit(1); }
console.log('\nall splits tests passed');
