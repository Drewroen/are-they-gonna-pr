#!/usr/bin/env node
/* CLI around splits.js — pull Drew's splits off the mika:timing result page.
 *
 *   node fetch-splits.js --name "Roen, Drew"          # search, then his page
 *   node fetch-splits.js --idp 2EFG96382E18FA         # straight to the page
 *   node fetch-splits.js --idp ... --year 2025 --event MAR_9TGG96381A5
 *   node fetch-splits.js --html page.html             # offline: just parse
 *   node fetch-splits.js --name "Roen, Drew" --out data/splits.json
 *
 * Flags: --year (default 2026) --event --host --out --pretty --latest --pace [mi|km]
 */
'use strict';

var fs = require('fs');
var Splits = require('./splits.js');

function parseArgs(argv) {
  var args = { _: [] };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a.slice(0, 2) === '--') {
      var key = a.slice(2);
      var next = argv[i + 1];
      var takesValue = ['name', 'idp', 'year', 'event', 'host', 'out', 'html', 'url', 'pace', 'lang'];
      if (takesValue.indexOf(key) >= 0 && next !== undefined && next.slice(0, 2) !== '--') {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function main() {
  var args = parseArgs(process.argv.slice(2));
  var year = args.year || '2026';
  var opts = { year: year, event: args.event, host: args.host, lang: args.lang };
  var name = args.name || (args._.length ? args._.join(' ') : null);

  var work;
  if (args.html) {
    work = Promise.resolve(Splits.parseDetail(fs.readFileSync(args.html, 'utf8'), { url: args.html }));
  } else if (args.idp) {
    work = Splits.fetchSplits({ idp: args.idp, year: year, event: args.event, host: args.host, lang: args.lang });
  } else if (args.url) {
    work = Splits.fetchSplits({ url: args.url });
  } else if (name) {
    work = Splits.findRunner(name, opts).then(function (hits) {
      if (!hits.length) throw new Error('no runner matches "' + name + '" in ' + year);
      if (hits.length > 1) {
        process.stderr.write('matches: ' + hits.map(function (h) { return h.label + ' (' + h.idp + ')'; }).join(', ') + '\n');
      }
      process.stderr.write('runner: ' + hits[0].label + '  idp=' + hits[0].idp + '\n');
      // the search result names the race's event key (MAR_<meeting>); passing it
      // keeps the page honest when a link points at the wrong year's app instance
      var event = args.event || (hits[0].eventId && hits[0].meeting ? hits[0].eventId + '_' + hits[0].meeting : null);
      return Splits.fetchSplits({ idp: hits[0].idp, year: year, event: event, host: args.host, lang: args.lang });
    });
  } else {
    process.stderr.write('nothing to fetch: pass --name, --idp, --url or --html\n');
    process.exit(2);
  }

  work.then(function (r) {
    var out = r;
    if (args.latest) out = r.latest;
    if (args.pace) out = Splits.paceInput(r.splits, args.pace === 'mi' ? 'mi' : 'km');
    var json = JSON.stringify(out, null, args.pretty ? 2 : 0) + '\n';
    if (args.out) {
      fs.writeFileSync(args.out, json);
      process.stderr.write('wrote ' + args.out + ' (' + r.splits.length + ' splits, ' +
        r.splits.filter(function (s) { return s.hadTime; }).length + ' with times)\n');
    } else {
      process.stdout.write(json);
    }
  }).catch(function (e) {
    process.stderr.write('error: ' + e.message + '\n');
    process.exit(1);
  });
}

main();
