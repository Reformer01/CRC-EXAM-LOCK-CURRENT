#!/usr/bin/env node
'use strict';
/* CRC Exam Lockdown — automated regression suite.
   Usage:  node tests/run.js            (run every suite)
           node tests/run.js <filter>   (only suites whose file matches <filter>)
   Exit code 0 = green (xfails allowed), 1 = one or more regressions. */
const fs = require('fs');
const path = require('path');
const H = require('./helpers/harness');

const realLog = console.log.bind(console);
const SUITES_DIR = path.join(__dirname, 'suites');
const filter = process.argv[2] || '';

async function main() {
  const files = fs.readdirSync(SUITES_DIR).filter(f => f.endsWith('.js'));
  let passed = 0, failed = 0, xfailed = 0, xpassed = 0;
  const failures = [];

  for (const file of files.sort()) {
    if (filter && !file.includes(filter)) continue;
    const t = H.createCollector();
    const suiteName = file.replace(/\.js$/, '');
    realLog('\n=== ' + suiteName + ' ===');
    try {
      await require(path.join(SUITES_DIR, file))(t);
    } catch (e) {
      realLog('  SUITE ERROR: ' + (e && e.stack || e));
      failed++;
    }
    for (const r of t.results) {
      if (r.xfail) {
        if (r.pass) { xpassed++; realLog('  XNOW  ' + r.name + ' — ' + (r.detail || '')); }
        else { xfailed++; }
      } else if (r.pass) {
        passed++; realLog('  PASS  ' + r.name);
      } else {
        failed++; failures.push({ suite: suiteName, name: r.name, detail: r.detail });
        realLog('  FAIL  ' + r.name + ' — ' + r.detail);
      }
    }
  }

  const total = passed + failed;
  realLog('\n========================================');
  realLog('Regression suite complete');
  realLog('  passed    : ' + passed + '/' + total);
  realLog('  xfailed   : ' + xfailed + ' (known findings — see PILOT-LOCKOUT-SYSFLOW-RESULTS.md)');
  if (xpassed) realLog('  xfail-now-pass: ' + xpassed + ' (remove the xfail marker!)');
  if (failures.length) {
    realLog('\nFAILURES:');
    failures.forEach(f => realLog('  [' + f.suite + '] ' + f.name + ' — ' + f.detail));
    process.exit(1);
  }
  realLog(failed === 0 ? '\nGREEN — no regressions.' : '\n' + failed + ' regression(s).');
  process.exit(failed === 0 ? 0 : 1);
}

main();
