#!/usr/bin/env node
// Give an account ROBUX and Tickets in your local copy.
//   npm run give                       -> Robloxian2008 gets 1,000,000 of each
//   npm run give -- YourName 5000 2500 -> YourName gets 5,000 R$ and 2,500 Tix
// Stop the server first (Ctrl+C in its window), then start it again afterwards.
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(process.env.ROBLOX_DATA_DIR || path.join(__dirname, '..', 'data'), 'db.json');
const [name = 'Robloxian2008', robux = '1000000', tix = robux] = process.argv.slice(2);
if (!fs.existsSync(file)) { console.error('No database yet: run "npm start" once first.'); process.exit(1); }
const db = JSON.parse(fs.readFileSync(file, 'utf8'));
const user = Object.values(db.users).find((u) => u.name.toLowerCase() === name.toLowerCase());
if (!user) { console.error(`No account called "${name}".`); process.exit(1); }
user.robux = (user.robux || 0) + Number(robux);
user.tix = (user.tix || 0) + Number(tix);
fs.writeFileSync(file, JSON.stringify(db));
console.log(`${user.name} now has R$ ${user.robux.toLocaleString()} and Tx ${user.tix.toLocaleString()}.`);
