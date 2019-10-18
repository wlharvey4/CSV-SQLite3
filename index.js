/* index.js */

const fs     = require('fs');
const path   = require('path');
const util   = require('util');
const assert = require('assert').strict;

const cl_args  = require('command-line-args');
const cl_usage = require('command-line-usage');
const csv      = require('csv');
const sqlite3  = require('sqlite3').verbose();      // remove 'verbose' in production
const accounting = require('accounting');

const DB_TABLES = {
    usb: 'usb',
    checks: 'checks',
};

const DB_ACCTS = {
    '6815': 'Business',
    '6831': 'Trust',
    '6151': 'Personal',
};

const DB_YEARS = [
    '2016',
    '2017',
    '2018',
]

const DB_COLS = [
    'acct',
    'date',
    'trans',
    'checkno',
    'txfr',
    'payee',
    'category',
    'note',
    'desc1',
    'desc2',
    'caseno',
    'amount',
    'OrigPayee',
    'OrigMemo',
];

const EXPORT_DB_COLS = [
    'rowid',
    'acct',
    'date',
    'trans',
    'checkno',
    'txfr',
    'payee',
    'category',
    'note',
    'caseno',
    'amount',
];

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

const option_defs = [
    { name: 'help',   alias: 'h', type: Boolean, description: 'Prints this usage message.' },
    { name: 'attach', alias: 'a', type: String,  description: 'Attach to an existing or new database file.' },
    { name: 'delete', alias: 'd', type: String,  description: 'Delete an existing database file and related CSV files.' },
    { name: 'csv',    alias: 'c', type: String,  description: 'Process a CSV file [6815|6831] yyyy', multiple: true  },
    { name: 'export', alias: 'e', type: String,  description: 'Export sqlite3 data into a csv file (default \'workfin.csv\'' },
    { name: 'checks',             type: Boolean, description: 'Find checks in worklog.<year>.otl and save to sqlite3 database checks file.' },
    { name: 'log-level', alias: 'l', type: Number, description: 'Set a log level 0..10' },
];
const options = cl_args(option_defs);
console.log(options);

if (options.help) {
    const sections = [
        {
            header: 'CSV-SQLite3',
            content: 'Processes raw usb csv files into a form usable by SQLite3'
        },
        {
            header: 'Options',
            optionList: option_defs,
        },
        {
            content: `Project directory: {underline ${process.env.WORKNODE}/CSV-SQLite3}`
        }
    ];
    const usage = cl_usage(sections);
    console.log(usage);
    process.exit(0);
}

let LOG_LEVEL = process.env.LOG_LEVEL || 1;
if (options['log-level'] >= 0) {
    if (typeof options['log-level'] === 'number' && options['log-level'] <= 10)
        LOG_LEVEL = options['log-level'];
    else {
        console.error(`Incorrect log-level: ${options['log-level']}; must be between 0 and 10`);
    }
}
console.log(`Log-level set at: ${LOG_LEVEL}`);

if ( !process.env.WORKDB ) { // $WORKFIN/db
    console.error('You must define a shell variable named WORKDB as a base directory for the .sqlite database file.');
    process.exit(1);
}
if ( !process.env.WORKCSV ) { // $WORKFIN/csv
    console.error('You must define a shell variable named WORKCSV as a base directory for the .csv files.');
    process.exit(1);
}
if ( !process.env.WORKLEDGER ) { // $WORKFIN/ledger
    console.error('You must define a shell variable named WORKLEDGER as a base directory for the .ledger files.');
    process.exit(1);
}
if ( !process.env.WORKBAK) { // $WORK/workbak
    console.error('You must define a shell variable named WORKBAK as a backup directory for storing deleted files.');
    process.exit(1);
}

const WORKDB     = process.env.WORKDB;     // base directory for .sqlite db files
if (!fs.existsSync(WORKDB)) { fs.mkdirSync(WORKDB); }
const WORKCSV    = process.env.WORKCSV;    // base directory for .csv files
if (!fs.existsSync(WORKCSV)) { fs.mkdirSync(WORKCSV); }
const WORKLEDGER = process.env.WORKLEDGER; // base directory for .ledger files
const WORKBAK    = process.env.WORKBAK;    // base directory for storing deleted files

const DB_DEFAULT = 'workfin';	       // default sqlite db name
const db_file = options.attach ? options.attach :    // use provided option for attaching
                options.delete ? options.delete :    // use provided option for deletion
                DB_DEFAULT;  	       	         // if no provided option, use the default name

const db_path = path.format({
    dir: WORKDB,
    name: db_file,
    ext: '.sqlite'
});
console.log(`db_path: ${db_path}`);

const csv_path = path.format({
    dir: WORKCSV,
    name: db_file,
    ext: '.csv'
});
console.log(`csv_path: ${csv_path}`);

/*---DELETE--*/
if (options.hasOwnProperty('delete')) {

    const WORKBAK_DB = path.format({
        dir: WORKBAK,
        name: 'db'
    });
    if (!fs.existsSync(WORKBAK_DB)) {
        fs.mkdirSync(WORKBAK_DB, {recursive: true});
    }

    const WORKBAK_CSV= path.format({
        dir:   WORKBAK,
        name: 'csv'
    });
    if (!fs.existsSync(WORKBAK_CSV)) {
        fs.mkdirSync(WORKBAK_CSV, {recursive: true});
    }

    const WORKBAK_LEDGER = path.format({
        dir:   WORKBAK,
        name: 'ledger'
    });
    if (!fs.existsSync(WORKBAK_LEDGER)) {
        fs.mkdirSync(WORKBAK_LEDGER, {recursive: true});
    }

    // Backup workfin.sqlite, workfin.csv
    const db_path_bak = path.format({
        dir: WORKBAK_DB,
        name: db_file,
        ext: `.sqlite.${Date.now()}`
    });

    const csv_path_bak = path.format({
        dir: WORKBAK_CSV,
        name: db_file,
        ext: `.csv.${Date.now()}`
    });

    try {
        fs.renameSync(db_path, db_path_bak);
        console.error(`Renamed ${db_path} to ${db_path_bak}`);
        fs.renameSync(csv_path, csv_path_bak);
        console.error(`Renamed ${csv_path} to ${csv_path_bak}`);
    } catch (err) {
        if (err.code === 'ENOENT')
            console.log(`file ${db_path} and/or ${csv_path} did not exist; ignoring.`);
        else {
            throw err;
        }
    }

    // Backup all .csv files
    try {
        const files = fs.readdirSync(WORKCSV);
        files.forEach(file => {
            const db_csv_path_file = path.format({
                dir: WORKCSV,
                name: file
            });
            const db_csv_path_bak  = path.format({
                dir: WORKBAK_CSV,
                name: file,
                ext: `.${Date.now()}`
            });
            fs.renameSync(db_csv_path_file, db_csv_path_bak);
            console.log(`Renamed ${db_csv_path_file} to ${db_csv_path_bak}`);
        });

    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`${db_csv_path} probably does not exist`);
        } else {
            throw err;
        }
    }

    /* Ledger */
    try {
        const files = fs.readdirSync(WORKLEDGER);
        files.forEach(file => {
            if (!/zero/.test(file)) { // don't backup the zero ledger file
                const ledger_file = path.format({
                    dir: WORKLEDGER,
                    name: file
                });
                const ledger_file_bak = path.format({
                    dir: WORKBAK_LEDGER,
                    name: file,
                    ext: `.${Date.now()}`
                });
                fs.renameSync(ledger_file, ledger_file_bak);
                console.log(`Renamed ${ledger_file} to ${ledger_file_bak}`);
            }
        });

    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`${ledger_path} probably does not exist`);
        } else {
            throw err;
        }
    }

    process.exit(0);
}

/*--ATTACH--*/
// attach in all situations except --delete
console.log('attaching...');
const db = new sqlite3.Database(db_path, err => {
    if (err) {
        return console.error(`Error opening database file ${db_path}: ${err.message})`);
    }
    console.log(`Successfully attached to database file ${db_path}`);
});
db.serialize();
db.run(`CREATE TABLE IF NOT EXISTS
    usb (
           rowid     INTEGER PRIMARY KEY NOT NULL,
           acct      TEXT NOT NULL,
           date      TEXT NOT NULL,
           trans     TEXT NOT NULL,
           checkno   TEXT,
           txfr      TEXT,
           payee     TEXT NOT NULL,
           category  TEXT,
           note      TEXT,
           desc1     TEXT,
           desc2     TEXT,
           caseno    TEXT,
           amount    REAL NOT NULL,
           OrigPayee TEXT NOT NULL,
           OrigMemo  TEXT NOT NULL )`);

// year is needed for checks, so define it here
const [acct,year] = options.csv;
if (!year) {
  console.error('ERROR: year is not defined.');
  process.exit(1);
}
const wl_year = parseInt(year, 10);

/*--EXPORT--*/
if (options.hasOwnProperty('export')) {
    const { spawnSync } = require('child_process');
    const export_csv = options['export'] || db_file;
    console.log(`exporting to ${export_csv}...`);

    const export_csv_dir = WORKCSV;
    if (!fs.existsSync(export_csv_dir)) {
        fs.mkdirSync(export_csv_dir);
        console.log(`Created ${export_csv_dir}`);
    }
    const export_csv_path = path.format({
        dir: export_csv_dir,
        name: export_csv,
        ext: '.csv'
    });

    // --export must be accompanied by --csv <acct> <year> of the proper values
    if (!options.hasOwnProperty('csv')) {
        console.error('Export must be accompanied by a bank account (e.g., 6815), and a year (e.g., 2016)');
        process.exit(1);
    }
    const _acct = options.csv[0],
          _year = options.csv[1];

    if (!(Object.keys(DB_ACCTS).includes(_acct) && DB_YEARS.includes(_year))) {
        console.error(`Invalid values for acct: ${_acct} or year: ${_year}`);
        process.exit(1);
    }

    const usb_acct = `usb_${_acct}`;

    //'as' - Open file for appending in synchronous mode. The file is created if it does not exist.
    let fd = fs.openSync(export_csv_path,'as');
    const size = fs.statSync(export_csv_path).size;
    const header = size === 0 ? 'header' : 'noheader';
    console.log(`export_csv_path: ${export_csv_path}`);

    const sql = `
SELECT ${EXPORT_DB_COLS.join(',')}
FROM   usb
WHERE  acct = '${usb_acct}' and date like '${_year}%';`;

    console.log(`sql: ${sql}`);

    let ret = spawnSync(
        'sqlite3',
        [
            db_path,
            '-csv',
            `-${header}`,
            sql,
        ],
        {
            encoding: 'utf-8',
            stdio: [0,fd,2]
        }
    );

    if (ret.error) {
        console.log(`status: ${ret.status}\tsignal: ${ret.signal}`);
        console.log(`error: ${ret.error}`);
    }

    console.log('done exporting');
    fs.closeSync(fd);


    /* CONVERT CSV TO LEDGER */
    const ledger_dir = WORKLEDGER;
    const ledger_path = path.format({
        dir: ledger_dir,
        name: export_csv,
        ext: '.exported.ledger'
    });
    const zero_file = path.format({
        dir: ledger_dir,
        name: 'zero',
        ext: '.ledger'
    });
    if (!fs.existsSync(ledger_dir)) {
        fs.mkdirSync(ledger_dir);
    }

    //const l_file = fs.existsSync(ledger_path) ? ledger_path : zero_file;
    const l_file = zero_file;

    console.log(`converting: ${export_csv_path} to ledger_path: ${ledger_path}`);

    fd = fs.openSync(ledger_path, 'as');	// 'as' - Open file for appending in synchronous mode.
                                                // The file is created if it does not exist.
    ret = spawnSync(
        'ledger',
        [
            'convert',
            `${export_csv_path}`,
            '--invert',
            '--input-date-format=%Y-%m-%d',
            `--account=Assets:${DB_ACCTS[_acct]}`,
            '--rich-data',
            `--file=${l_file}`,
            `--now=${(new Date()).toISOString().split('T')[0]}`,
        ],
        {
            encoding: 'utf-8',
            stdio: [0,fd,2],
        }
    );

    if (ret.error) {
        console.log(`status: ${ret.status}\tsignal: ${ret.signal}`);
        console.log(`error: ${ret.error}`);
    }

    fs.closeSync(fd);
    process.exit(0);
}

/*--DON'T CONTINUE UNLESS --csv OPTION USED--*/
if (!options.hasOwnProperty('csv'))
    process.exit(0);

const stringifier = csv.stringify({
    header: true,
    columns: DB_COLS,
});

const usb_acct = `usb_${acct}`;
const usb_acct_year = `${usb_acct}__${year}.csv`;

const csv_path_file = path.join(WORKCSV, usb_acct_year);
console.log(`CSV PATH FILE: ${csv_path_file}`);

let csv_stringifier;
try {
    csv_stringifier = fs.createWriteStream(csv_path_file);
    console.log(`WRITE STREAM: ${csv_path_file} has been successfully opened.`);
} catch (err) {
    console.error(err.message);
    process.exit(1);
}

stringifier.on('readable', function() {
    console.log('stringifier is now readable');
    let row;
    while (row = this.read()) {
        console.log(`stringifer row: ${row}`);
        csv_stringifier.write(row);
    }
});

stringifier.on('error', function(err) {
    console.error(err.message);
});

stringifier.on('finish', function() {
    console.log('stringifier is done writing to csv_stringifer');
    csv_stringifier.end('stringifer called csv_stringifier\'s "end" method');
});

stringifier.on('close', function() {
    console.log('stringifier is now closed');
});

csv_stringifier.on('close', function() {
    console.log('csv_stringifier is now closed');
});

const transform_function = function (record) {
    const DEBIT   = 'debit';
    const CREDIT  = 'credit';
    const CHECK   = 'check';
    const CASH    = 'cash';
    const DEPOSIT = 'deposit';
    const UNKNOWN = 'unknown';
    const TRANS   = 'transfer';
    const USBANK  = 'usbank';
    let   trfrom  = '';

    // Add new columns: acct, checkno, txfr, caseno, desc1, desc2, category
    record.acct    = usb_acct;
    record.checkno = null; // check no.
    record.txfr    = null; // direction and acct #
    record.caseno  = null; // related case foreign key
    record.desc1   = null; // noun
    record.desc2   = null; // adjective
    record.category= null; // categorization of the transaction

    // Format date as yyyy-mm-dd; delete original Date
    record.date = new Date(record['Date']).toISOString().split('T')[0];
    delete record['Date'];

    // Change Transaction to trans; delete original Transaction
    record.trans = record['Transaction'].toLowerCase();
    delete record['Transaction'];

    // Change Amount to amount as Currency type; delete original Amount
    record.amount = accounting.formatMoney(record['Amount']);
    delete record['Amount'];

    // Change Name to payee; keep original Name as OrigName; delete Name
    record.payee = record['Name'].toLowerCase().trimRight();
    record.OrigPayee = record['Name'];
    delete record['Name'];

    // Clean up Memo by removing Download message; return as note; keep Memo as OrigMemo
    let re = new RegExp('Download from usbank.com.\\s*');
    record.note = record['Memo'].replace(re,'').toLowerCase();
    record.OrigMemo = record['Memo'];
    delete record['Memo'];

    // Add check no. to checkno column
    if (record.payee === CHECK) {
        const checkno = record.trans.replace(/^0*/,'');
        record.checkno  = checkno;
        record.trans   = DEBIT;
        record.payee  = `(${record.checkno}) check`;
        record.note  += `Purchase by check no. ${checkno}`;
        record.desc1  = 'purchase';
        record.desc2  = 'check';
    }

    if (record.payee.match(/(returned) (item)/)) {
        record.desc1 = RegExp.$2;
        record.desc2 = RegExp.$1;
        record.payee = USBANK;
        record.note = `${record.desc2} ${record.desc1}`;
    }

    if (record.payee.match(/(internet|mobile) (banking) transfer (deposit|withdrawal) (\d{4})\s*$/)) {
        record.desc1 = RegExp.$3;
        record.desc2 = RegExp.$1;
        record.txfr = `${(RegExp.$3 === 'deposit') ? '<' : '>'} usb_${RegExp.$4}`;
        tofrom = (record.trans === 'debit') ? 'to' : 'from';
        record.payee = (record.trans === 'debit') ? `usb_${RegExp.$4}` : `usb_${options.csv[0]}`;
        record.note = `${record.desc2} ${record.desc1}: ${TRANS} ${tofrom} ${record.note}`;
        if (/>/.test(record.txfr)) {
            record.payee = `Transfer to ${record.payee} from ${record.acct}`;
        } else {
            record.payee = `Transfer to ${record.payee} from usb_${RegExp.$4}`;
        }
    }

    if (record.payee.match(/debit (purchase)\s*-?\s*(visa)? /)) {
        record.desc1 = RegExp.$1;
        record.desc2 = RegExp.$2;
        record.payee = record.payee.replace(RegExp.lastMatch,'');
        record.note = `${record.desc2} ${record.desc1} ${record.note}`.trimLeft();;
    }

    // Removed ELECTRONIC WITHDRAWAL for payment to State Bar of CA
    if (record.payee.match(/^.*(state bar of ca)/)) {
        record.payee = RegExp.$1;
    }

    // web authorized payment
    // atm|electronic|mobile check|rdc deposit|withdrawal <name>
    if (record.payee.match(/(web authorized) (pmt) |(atm|electronic|mobile)?\s*(check|rdc)?\s*(deposit|withdrawal)\s*(.*)?/)) {
        tofrom = '';
        record.desc1 = RegExp.$2 ? RegExp.$2 : RegExp.$4 ? RegExp.$4 : RegExp.$5 ? RegExp.$5 : 'undefined';
        record.desc2 = RegExp.$1 ? RegExp.$1 : RegExp.$3 ? RegExp.$3 : 'undefined';
        if (RegExp.$3 === 'atm' || RegExp.$3 === 'electronic' || RegExp.$3 === 'mobile' || RegExp.$5 === DEPOSIT) {
            record.payee = (RegExp.$5 === 'deposit') ? `usb_${options.csv[0]}` : CASH;
        } else {
            record.payee = record.payee.replace(RegExp.lastMatch,'');
        }
        if (record.note.match(/paypal/) && record.trans === CREDIT) {
            record.txfr = `< ${RegExp.lastMatch}`;
            tofrom = ' from';
        }
        record.note = `${record.desc2} ${record.desc1}${tofrom} ${record.note}`.trimRight();
    }

    if (record.payee.match(/(zelle instant) (pmt) (from (\w+\s\w+))\s(.*)$/)) {
        record.desc1 = RegExp.$2;
        record.desc2 = RegExp.$1;
        record.note = `${record.desc2} ${record.desc1} ${RegExp.$3}`;
        record.payee = `usb_${options.csv[0]}`;
    }

    if (record.payee.match(/(overdraft|international) (paid|processing) (fee)/)) {
        record.desc1 = RegExp.$3;
        record.desc2 = `${RegExp.$1} ${RegExp.$2}`;
        record.payee = USBANK;
        record.note  = `${record.desc2} ${record.desc1} to ${record.payee}`;
    }

    record.payee = record.payee.replace(/\s*portland\s{2,}or$|\s*vancouver\s{2,}wa.*$/,'');
    record.note  = record.note.replace(/\s*portland\s{2,}or$|\s*vancouver\s{2,}wa.*$/,'');
    record.payee = record.payee.replace(/\s\d{3}\w+\s{2,}or$/,''); // Nike Company 019Beaverton   OR
    record.note  = record.note.replace(/\s\d{3}\w+\s{2,}or$/,'');
    record.payee = record.payee.replace(/\s*[-\d]{5,}\s*\w{2}$/,''); // '650-4724100 CA' & '        855-576-4493WA' & '  800-3333330 MA'
    record.note  = record.note.replace(/\s*[-\d]{5,}\s*\w{2}$/,'');
    record.payee = record.payee.replace(/(\s\w*https)?www.*$/,''); // WWW.ATT.COM TX; UDEMY ONLINE COUHTTPSWWW.UDECA
    record.note  = record.note.replace(/(\s\w*https)?www.*$/,'');
    record.payee = record.payee.replace(/\s*\w+\.com\s+\w{2}$/, '');
    record.note  = record.note.replace( /\s*\w+\.com\s+\w{2}$/, '');
    record.payee = record.payee.replace(/aws.amazon.cWA/i,''); // serviaws.amazon.cWA
    record.note  = record.note.replace(/aws.amazon.cWA/i,'');
    if (record.payee.match(/(bostype \/ wes bo)(hamilton\s+on)/)) { // WES BOHAMILTON    ON
        record.payee = 'Wes Bos';
        record.note  = record.note.replace(RegExp.$1,'Wes Bos');
        record.note  = record.note.replace(RegExp.$2, '');
    }
    record.payee = record.payee.replace(/\s{2,}/g,' ');
    record.note  = record.note.replace(/\s{2,}/g,' ');

    /*
      'DEBIT PURCHASE -VISA SQ *PHIL        877-417-4551WA'

      You paid Phil $159 for Atreus keyboard kit and shipping

      It is for a credit card processor that goes by the brand name
      Square Up. Merchants can run credit card transactions through
      their iPhone or iPads using the Square Up services. Mine was for
      a taxi ride. https://800notes.com/Phone.aspx/1-877-417-4551
    */

    record.payee = record.payee.replace(/sq/, 'square');
    record.note  = record.note.replace(/sq/, 'square');

    return record;
}

const transformer = csv.transform(transform_function);

/* TRANSFORMER reads records through its TRANSFORM_FUNCTION */
/* -------------------------------------------------------- */
transformer.on('readable', function() {
    let record;
    while ((record = transformer.read())) {
        console.log(`Transformer record:\n${util.inspect(record)}`);

        /* STRINGIFIER WRITE Records */
        /* ------------------------- */
        stringifier.write(record);



        /* DB RUN---INSERT RECORDS */
        /* ----------------------- */
        const tab_name  = DB_TABLES['usb'];
        const col_names = DB_COLS.join(',');
        const col_phs   = DB_COLS.map(c => '?').join(',');
        const col_values= DB_COLS.map(c => record[c]);

        let sql = `INSERT INTO ${ tab_name }( ${ col_names } )
                   VALUES ( ${ col_phs } )`;

        console.log(`sql: ${ sql }`);
        console.log(`col_values: ${ col_values }`);

        db.run(sql, col_values, (err) => {
           if (err) {
               console.error(err.message);
               console.error(`ERROR sql: ${ sql }`);
               console.error(`ERROR values: ${ col_values }`);
               process.exit(1);
           }
       });
   }
});

transformer.on('error', function(err) {
    console.error(err.message);
});

transformer.on('finish', function() {
    console.log('Transformer finished writing records.');
});

transformer.on('end', function() {
    console.log('Transformer end reached.');
    stringifier.end();
});

// [[file:~/Work/work/worknode/csv-sqlite3/CSV-SQLite3.org::csv-sqlite3-csv-parse][csv-sqlite3-csv-parse]]
const parser = csv.parse({columns: true});
const records = [];

parser.on('readable', function() {
    console.log('Parser beginning to read records.');
    let record;

    /* PARSE A RECORD AND WRITE TO THE TRANSFORMER */
    while ((record = parser.read())) {
        console.log(`parser record:\n${util.inspect(record)}`);
        transformer.write(record);
    }

});

parser.on('error', function(err) {
    console.error(err.message);
});

parser.on('end', function() {
    console.log('Parser finished reading records.');
});

parser.on('finish', function () {
    console.log('Parser finished writing records.');
    console.log('Parser calling transformer end');
    transformer.end();
});
// csv-sqlite3-csv-parse ends here

if (options.csv) {
    // const acct = options.csv[0],
    //       year = options.csv[1];
    // const usb_acct = `usb_${acct}`;

    if (!process.env.WORKUSB) {
        console.error('You must assign a path to the shell variable WORKUSB');
        process.exit(1);
    }

    const acct_year_path = `${process.env.WORKUSB}/${usb_acct}/${year}`;
    const acct_year_csv_file = `${usb_acct}--${year}.csv`;
    const acct_year_csv_file_path = `${acct_year_path}/${acct_year_csv_file}`;
    if (!fs.existsSync(acct_year_csv_file_path) || !(fs.accessSync(acct_year_csv_file_path, fs.constants.R_OK) === undefined)) {
        console.error(`Cannot find or access the CSV file at '${acct_year_csv_file_path}'.`);
        process.exit(1);
    }
    console.log(`Successfully found the CSV file: '${acct_year_csv_file_path}'`);

    /* CREATE THE STREAM HERE */
    const csv_file_stream = fs.createReadStream(acct_year_csv_file_path, {encoding: 'utf8'});

    /* Set up streaming events 'READABLE', 'ERROR', and 'END' */
    csv_file_stream.on('readable', function () {
        let record;

        /* READ THE RECORDS */
        while ((record = this.read())) {
            console.log(`readable record: ${record}`);

            /* WRITE A RECORD TO THE PARSER */
            parser.write(record);

        }
        parser.end();

    });

    csv_file_stream.on('error', function(err) {
        console.error(err.message);
    });

    csv_file_stream.on('end', function () {
        console.log('Reader finished reading data.');
    });
}
