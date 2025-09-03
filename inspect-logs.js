const Database = require("better-sqlite3");
const dayjs = require("dayjs");

const db = new Database("./data.db");

const rows = db.prepare(`
  SELECT ml.id, ml.contact_id, ml.to_email, ml.status, ml.subject,
         ml.trigger_date, ml.sent_at, c.name AS contact_name
  FROM mail_logs ml
  LEFT JOIN contacts c ON c.id = ml.contact_id
  ORDER BY ml.id DESC
  LIMIT 20
`).all();

console.table(rows);
