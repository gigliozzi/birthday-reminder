db.exec(`
  CREATE TABLE IF NOT EXISTS mail_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    subject TEXT,
    to_email TEXT NOT NULL,
    message_id TEXT,
    status TEXT NOT NULL,             -- SENT | FAILED
    error TEXT,                       -- mensagem de erro (se houver)
    days_ahead INTEGER NOT NULL,      -- 0 = hoje, 3 = 3 dias antes, etc.
    trigger_date TEXT NOT NULL,       -- data do job no fuso TZ (YYYY-MM-DD)
    sent_at TEXT NOT NULL,            -- ISO timestamp
    FOREIGN KEY(contact_id) REFERENCES contacts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_mail_logs_trigger ON mail_logs(trigger_date, days_ahead);
  CREATE INDEX IF NOT EXISTS idx_mail_logs_status ON mail_logs(status);
`);
