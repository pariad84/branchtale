// Storage for server/index.js's GET/PUT-the-whole-array-per-key API. Two backends behind the
// same readRows(key)/writeRows(key, rows) shape:
//
// - Postgres, when DATABASE_URL is set -- one generic table (resource_key, id, data JSONB)
//   mirrors the JSON file's own {key: [{id, data}]} shape directly, so every resource (player,
//   story, scene, ending, and anything app.js adds later) keeps working with no schema migration
//   per resource. writeRows keeps the same "replace every row for this key" contract the JSON
//   file always had (delete-then-bulk-insert in one transaction) rather than diffing old vs new,
//   since fn.js's client already sends the full array on every insert/update/delete -- changing
//   that contract would mean changing fn.js again, which the whole point of this shape avoids.
// - The JSON file (db.json, git-ignored), when DATABASE_URL isn't set -- so `npm start` still
//   works with no database to set up, same as before this file existed.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');
const pool = process.env.DATABASE_URL
    ? new (require('pg').Pool)({ connectionString : process.env.DATABASE_URL })
    : null;

var ready = pool
    ? pool.query(
        'CREATE TABLE IF NOT EXISTS data_rows (' +
        'resource_key TEXT NOT NULL, id INTEGER NOT NULL, data JSONB NOT NULL, ' +
        'PRIMARY KEY (resource_key, id))'
    )
    : Promise.resolve();

function readJsonFile() {
    if (!fs.existsSync(DB_PATH)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeJsonFile(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function readRows(key) {
    if (pool) {
        await ready;
        var result = await pool.query('SELECT id, data FROM data_rows WHERE resource_key = $1 ORDER BY id', [ key ]);
        return result.rows;
    }
    var db = readJsonFile();
    return db[key] || [];
}

async function writeRows(key, rows) {
    if (pool) {
        await ready;
        var client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM data_rows WHERE resource_key = $1', [ key ]);
            for (var i = 0; i < rows.length; i++) {
                await client.query(
                    'INSERT INTO data_rows (resource_key, id, data) VALUES ($1, $2, $3)',
                    [ key, rows[i].id, rows[i].data ]
                );
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        return;
    }
    var db = readJsonFile();
    db[key] = rows;
    writeJsonFile(db);
}

module.exports = { readRows : readRows, writeRows : writeRows, usingPostgres : !!pool };
