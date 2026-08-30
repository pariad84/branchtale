// The real backend fn.js's README always said would come "someday": a server holding one JSON
// file (db.json) that every visitor's browser reads/writes through this API instead of their own
// localStorage, so stories one person adds actually show up for everyone else too.
//
// The API shape is deliberately the narrowest one that lets fn.js's data layer swap over with no
// other file changing: fn.data.select/insert/update/delete already only ever go through
// fn.data._.read({key})/fn.data._.write({key, rows}) -- "get every row for this key" / "replace
// every row for this key" -- so this server exposes exactly that, GET/PUT on the whole array per
// key, rather than a REST endpoint per CRUD verb. list/form/scene-form/app.js need zero changes;
// only fn.js's _.read/_.write swap from localStorage to a synchronous XHR against these two
// routes (see fn.js's own comment there for why synchronous, not fetch/Promises).
//
// Storage is one JSON file, not a real database -- correct for a single local server with no
// concurrent writers to speak of yet, and honest about not being safe under real concurrent
// traffic (a GET-mutate-PUT race can drop a write). That tradeoff is exactly why this ships
// behind a "local only for now" flag rather than a public deployment.
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

function readDb() {
    if (!fs.existsSync(DB_PATH)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const app = express();
app.use(express.json());

app.get('/api/data/:key', function(req, res) {
    var db = readDb();
    res.json(db[req.params.key] || []);
});

app.put('/api/data/:key', function(req, res) {
    var db = readDb();
    db[req.params.key] = req.body;
    writeDb(db);
    res.status(204).end();
});

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, function() {
    console.log('branchtale server running at http://localhost:' + PORT);
});
