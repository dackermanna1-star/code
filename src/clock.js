// The site's clock. This recreation lives in 2008: the clock starts at
// SITE_START when the database is first created and then runs at normal speed,
// so "4 hours ago", join dates, messages and the daily allowance all read as
// late-2008 dates. Delete data/ to start over.
'use strict';

const SITE_START = Date.UTC(2008, 8, 1, 16, 0, 0); // Mon Sep 1 2008, 9:00 AM Pacific
let offset = 0;

/** realStart: the real time (ms) at which the site clock read SITE_START. */
function init(realStart) { offset = realStart - SITE_START; }
function now() { return Date.now() - offset; }

module.exports = { init, now, SITE_START };
