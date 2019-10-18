#!/usr/bin/env node
/* find-checks.js */

/* USAGE:
 * find-checks <year> [db]
 */

const DEFAULT_DB = 'workfin';
const TABLE      = 'checks';
const EXT        = '.sqlite';

// make sure WORKDB is defined
if (typeof process.env.WORKDB === 'undefined') {
  console.error('Must defined environment variable for WORKDB');
  process.exit(1);
}
const WORKDB = process.env.WORKDB;

// make sure a <year> argument is included
if (process.argv.length < 3) {
  console.error('Must include a <year> argument: "find-checks <year>"');
  process.exit(1);
}

// make sure the <year> argument is a number
const wlyear = parseInt(process.argv[2],10);
if (isNaN(wlyear)) {
  console.error(`The <year> argument: "${process.argv[2]}" must be a year, e.g., "2016"`);
  process.exit(1);
}

// second optional argument is the name of the database, without extension
// if no second argument, use default db of $WORKDB/workfin.sqlite
const path   = require('path');
const db_path = path.format({
  dir: WORKDB,
  name: `${process.argv[3] || DEFAULT_DB}`,
  ext: EXT
});

// Everything is a go; load the wlparser, wlchecks, sqlite3 modules
const {WLChecks} = require('wlparser');
const wlchecks   = new WLChecks(wlyear);
const sqlite3    = require('sqlite3').verbose(); // remove verbose() for production code
const CHECKS_COLS = [
    'acct',
    'checkno',
    'date',
    'payee',
    'subject',
    'purpose',
    'caseno',
    'amount'
];
let statement;

// Load the sqlite3 database
const db = new sqlite3.Database(db_path, err => {
  if (err) {
    console.error(`Database Error: ${err}`);
    process.exit(1);
  }
  console.log(`Successfully opened database at ${db_path}`);
});

db.serialize();

statement = `CREATE TABLE IF NOT EXISTS
checks (
      acct		TEXT NOT NULL,
      checkno		TEXT NOT NULL,
      date		TEXT NOT NULL,
      payee		TEXT NOT NULL,
      subject		TEXT NOT NULL,
      purpose		TEXT,
      caseno		TEXT NOT NULL,
      amount		REAL NOT NULL
)`;
db.run(statement);

let cols = CHECKS_COLS.join(','); // create string of column names for INSERT statement
let values = CHECKS_COLS.map(col => `$${col}`).join(', '); // create string of placeholders for INSERT statement
statement = `INSERT INTO ${TABLE} (${cols}) VALUES (${values})`;

let all_checks = []; // used to filter out already-entered checks

wlchecks.on('check', data => {
  delete data.type; // simply don't need this property
  if (!all_checks.includes(data.checkno)) { // filter out already-entered checks
      const new_data = {};
      for (k in data) { // create the named parameters of form 'new_data = {$checkno: 1234}'
          new_data[`$${k}`] = data[k];
      }
      db.run(statement, new_data, (err) => { // add the check data to the sqlite database
          if (err) console.error(`ERROR: ${err}`);
      });
  };

}).on('checked', () => {
  db.close();

}).on('error', err => {
  process.exit(1);

});

// load all of the previously-entered checks into the array 'all_checks'
db.all(`SELECT checkno FROM ${TABLE} WHERE date LIKE '${wlyear}%'`, [], (err, check_data) => {
    if (check_data) {
        all_checks = check_data.map(row => row.checkno);
    }

    wlchecks.findChecks(); // start the stream running
});
