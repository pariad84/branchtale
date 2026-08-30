// The real backend fn.js's README always said would come "someday": a server every visitor's
// browser reads/writes through via HTTP instead of their own localStorage, so stories one person
// adds actually show up for everyone else too. Storage itself (a JSON file, or Postgres when
// DATABASE_URL is set) lives in db.js -- this file is just the API and static file serving.
//
// The API shape is deliberately the narrowest one that lets fn.js's data layer swap over with no
// other file changing: fn.data.select/insert/update/delete already only ever go through
// fn.data._.read({key})/fn.data._.write({key, rows}) -- "get every row for this key" / "replace
// every row for this key" -- so this server exposes exactly that, GET/PUT on the whole array per
// key, rather than a REST endpoint per CRUD verb. list/form/scene-form/app.js need zero changes;
// only fn.js's _.read/_.write swap from localStorage to a synchronous XHR against these two
// routes (see fn.js's own comment there for why synchronous, not fetch/Promises).
require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

app.get('/api/data/:key', async function(req, res) {
    try {
        res.json(await db.readRows(req.params.key));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error : 'Failed to read ' + req.params.key });
    }
});

app.put('/api/data/:key', async function(req, res) {
    try {
        await db.writeRows(req.params.key, req.body);
        res.status(204).end();
    } catch (e) {
        console.error(e);
        res.status(500).json({ error : 'Failed to write ' + req.params.key });
    }
});

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, function() {
    console.log('branchtale server running at http://localhost:' + PORT + ' (storage: ' + (db.usingPostgres ? 'Postgres' : 'db.json') + ')');
});
