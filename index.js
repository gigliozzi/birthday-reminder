require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const Database = require("better-sqlite3");

const cron = require("node-cron");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
app.use(cors());
app.use(express.json());

// === Configs ===
const PORT = process.env.PORT || 3000;
const TZ = process.env.TZ || "America/Sao_Paulo";
const MAIL_FROM = process.env.MAIL_FROM;
const SMTP_HOST = process.env.SMTP_HOST;
const NOTIFY_TO = process.env.NOTIFY_TO || null;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const LEAD_DAYS = Number(process.env.LEAD_DAYS || 3);
const DAILY_JOB_HOUR = String(process.env.DAILY_JOB_HOUR || "09").padStart(2, "0");


const path = require("path");

// === DB (SQLite) ===
const DB_PATH = path.resolve(__dirname, "data.db");
console.log("[DB] usando arquivo:", DB_PATH); // log útil
const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");


// === Email transporter ===
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true para 465, false para 587/25
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// checagem simples do SMTP no boot (log no console)
transporter.verify().then(() => {
  console.log("SMTP ok: pronto para enviar e-mails.");
}).catch(err => {
  console.warn("Aviso: falha ao verificar SMTP:", err.message);
});

// === Helpers ===
function isValidDateYYYYMMDD(str) {
  // valida formato e data válida
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = dayjs(str, "YYYY-MM-DD", true);
  return d.isValid();
}

// retorna contatos cujo aniversário é em "diasDepois" a partir de hoje (0 = hoje)
function contactsWithBirthdayIn(daysAfter = 0) {
  const today = dayjs().tz(TZ);
  const target = today.add(daysAfter, "day");
  const mmdd = target.format("MM-DD");

  // como birthdate é YYYY-MM-DD, comparamos só mês-dia
  const stmt = db.prepare(`
    SELECT id, name, email, phone, birthdate
    FROM contacts
    WHERE substr(birthdate, 6, 5) = ?
  `);
  return stmt.all(mmdd);
}

async function sendReminderEmail({ to, subject, text, html }) {
  return transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
}

async function notifyForDay(daysAhead, overrideTo) {
  const list = contactsWithBirthdayIn(daysAhead);
  if (!list.length) return { count: 0 };

  const triggerDate = dayjs().tz(TZ).format("YYYY-MM-DD");

  let sent = 0, failed = 0, errors = [];
  for (const c of list) {
    const subject =
      daysAhead === 0
        ? `Aniversário HOJE: ${c.name}`
        : `Aniversário em ${daysAhead} dia(s): ${c.name}`;

    const text = `
Olá!

${daysAhead === 0 ? "Hoje" : `Em ${daysAhead} dia(s)`} é aniversário de ${c.name}.
Dados:
- Nome: ${c.name}
- Email: ${c.email}
- Telefone: ${c.phone || "(não informado)"}
- Nascimento: ${c.birthdate}

Que tal entrar em contato para parabenizar?
`.trim();

    const html = `
<p>Olá!</p>
<p><strong>${daysAhead === 0 ? "Hoje" : `Em ${daysAhead} dia(s)`} é aniversário de ${c.name}.</strong></p>
<ul>
  <li><strong>Nome:</strong> ${c.name}</li>
  <li><strong>Email:</strong> ${c.email}</li>
  <li><strong>Telefone:</strong> ${c.phone || "(não informado)"}</li>
  <li><strong>Nascimento:</strong> ${c.birthdate}</li>
</ul>
<p>Que tal entrar em contato para parabenizar?</p>
`.trim();

    const to = (overrideTo || NOTIFY_TO || SMTP_USER);

    try {
      const info = await sendReminderEmail({ to, subject, text, html });

      db.prepare(`
        INSERT INTO mail_logs (contact_id, subject, to_email, message_id, status, error, days_ahead, trigger_date, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        c.id, subject, to, info?.messageId || null, "SENT", null,
        daysAhead, triggerDate, dayjs().tz(TZ).toISOString()
      );

      sent++;
      console.log("[MAIL] SENT →", to, "messageId:", info?.messageId);
    } catch (err) {
      db.prepare(`
        INSERT INTO mail_logs (contact_id, subject, to_email, message_id, status, error, days_ahead, trigger_date, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        c.id, subject, to, null, "FAILED", err.message,
        daysAhead, triggerDate, dayjs().tz(TZ).toISOString()
      );

      failed++;
      errors.push({ contact: c.id, error: err.message });
      console.error("[MAIL][FAILED] →", to, err.message);
    }
  }

  return { count: list.length, sent, failed, errors };
}

app.use(express.static(path.join(__dirname, "public")));

// === Rotas ===

// healthcheck
app.get("/health", (req, res) => {
  res.json({ ok: true, time: dayjs().tz(TZ).toISOString() });
});

// listar contatos (com busca opcional ?q=)
app.get("/contacts", (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (q) {
    const rows = db.prepare(`
      SELECT * FROM contacts
      WHERE LOWER(name) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?) OR phone LIKE ?
      ORDER BY name ASC
    `).all(`%${q}%`, `%${q}%`, `%${q}%`);
    return res.json(rows);
  }
  const rows = db.prepare("SELECT * FROM contacts ORDER BY name ASC").all();
  res.json(rows);
});


// criar contato
app.post("/contacts", (req, res) => {
  const { name, email, phone, birthdate } = req.body || {};
  if (!name || !email || !birthdate) {
    return res.status(400).json({ error: "name, email e birthdate são obrigatórios" });
  }
  if (!isValidDateYYYYMMDD(birthdate)) {
    return res.status(400).json({ error: "birthdate deve estar em YYYY-MM-DD" });
  }

  const stmt = db.prepare(`
    INSERT INTO contacts (name, email, phone, birthdate, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const createdAt = dayjs().tz(TZ).toISOString();
  const info = stmt.run(name.trim(), email.trim(), (phone || "").trim(), birthdate, createdAt);

  res.status(201).json({ id: info.lastInsertRowid, name, email, phone, birthdate, created_at: createdAt });
});

// atualizar contato
app.put("/contacts/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });

  const { name, email, phone, birthdate } = req.body || {};
  if (!name || !email || !birthdate) {
    return res.status(400).json({ error: "name, email e birthdate são obrigatórios" });
  }

  const upd = db.prepare(`
    UPDATE contacts
    SET name = ?, email = ?, phone = ?, birthdate = ?
    WHERE id = ?
  `).run(name.trim(), email.trim(), (phone || "").trim(), birthdate, id);

  if (upd.changes === 0) {
    return res.status(404).json({ error: "contato não encontrado" });
  }

  const row = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(id);
  res.json({ ok: true, contact: row });
});


// endpoint manual para testar o job (ex.: /jobs/run-birthday-check?days=0)
app.post("/jobs/run-birthday-check", async (req, res) => {
  const days = Number(req.query.days || 0);
  const sendTo = (req.query.sendTo || "").toString().trim() || null;
  const result = await notifyForDay(days, sendTo);
  const effectiveTo = sendTo || NOTIFY_TO || SMTP_USER;
  res.json({ ran: true, days, to: effectiveTo, ...result });
});

// === Teste de SMTP/E-mail (envio direto) ===
app.post("/test/email", async (req, res) => {
  try {
    const to = (req.query.to || "").toString().trim();
    if (!to) return res.status(400).json({ error: "use ?to=email@dominio.com" });

    const info = await sendReminderEmail({
      to,
      subject: "Teste direto via Brevo (SMTP) " + Date.now(),
      text: "Se chegou, SMTP/entrega estão OK.",
      html: "<p>Se chegou, SMTP/entrega estão <b>OK</b>.</p>",
    });

    return res.json({ ok: true, to, messageId: info?.messageId || null });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});


// === Agendamento diário (09:00 no fuso configurado) ===
const cronExpr = `0 ${DAILY_JOB_HOUR} * * *`;
cron.schedule(cronExpr, async () => {
  console.log(`[JOB] Rodando lembretes diários às ${DAILY_JOB_HOUR}:00 (${TZ})`);
  try {
    // hoje
    const todayRes = await notifyForDay(0);
    // X dias antes (ex.: 3)
    const leadRes = LEAD_DAYS > 0 ? await notifyForDay(LEAD_DAYS) : { count: 0, sent: 0, failed: 0 };

    console.log(`[JOB] today:`, todayRes, ` lead(${LEAD_DAYS}):`, leadRes);
  } catch (e) {
    console.error("[JOB] erro ao enviar lembretes:", e.message);
  }
}, { timezone: TZ });


// GET /mail-logs?limit=100&offset=0&status=SENT&day=2025-09-01&q_name=ana&q_to=@gmail.com
app.get("/mail-logs", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const offset = Number(req.query.offset || 0);
  const status = (req.query.status || "").toString().trim().toUpperCase(); // SENT/FAILED
  const day = (req.query.day || "").toString().trim();  // YYYY-MM-DD
  const qName = (req.query.q_name || "").toString().trim(); // busca por nome do contato (contains)
  const qTo = (req.query.q_to || "").toString().trim();     // busca por email destinatário (contains)

  const filters = [];
  const params = [];

  if (status === "SENT" || status === "FAILED") {
    filters.push("ml.status = ?");
    params.push(status);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    filters.push("ml.trigger_date = ?");
    params.push(day);
  }
  if (qName) {
    filters.push("LOWER(c.name) LIKE LOWER(?)");
    params.push(`%${qName}%`);
  }
  if (qTo) {
    filters.push("LOWER(ml.to_email) LIKE LOWER(?)");
    params.push(`%${qTo}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = db.prepare(`
    SELECT ml.*, c.name AS contact_name, c.email AS contact_email
    FROM mail_logs ml
    LEFT JOIN contacts c ON c.id = ml.contact_id
    ${where}
    ORDER BY ml.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ limit, offset, count: rows.length, rows });
});

// apagar contato
app.delete("/contacts/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });
  const del = db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
  if (del.changes === 0) return res.status(404).json({ error: "contato não encontrado" });
  res.json({ ok: true, id });
});


// start
app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT} (TZ=${TZ})`);
});
