// Faz uma conulsta no banco atual do SQLite3

const Database = require("better-sqlite3");

const db = new Database("./data.db");

const rows = db.prepare("SELECT * FROM contacts ORDER BY id ASC").all();
console.table(rows);
