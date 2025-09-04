Lembretes de Aniversário — MVP

Painel simples para cadastrar contatos (nome, e-mail, telefone, nascimento) e enviar lembretes por e-mail no dia do aniversário (ou X dias antes).
Inclui UI em HTML/CSS/JS puro (tema claro/escuro), agendamento diário, logs de envio e integração SMTP (Brevo / outro SMTP).

✨ Funcionalidades

CRUD de contatos (criar, listar, editar, excluir)

Busca rápida (nome/e-mail/telefone)

Envio de e-mails (Brevo SMTP, domínio autenticado)

Job diário (hoje + LEAD_DAYS dia(s) antes)

Logs consultáveis em /logs.html (filtros, CSV, reenviar, auto-refresh)

UI responsiva, tema claro/escuro, “Executar hoje”, status do servidor

Pronto para multi-cliente (roadmap)

🏗️ Stack

Node.js + Express

SQLite (local) ou PostgreSQL (produção)

Nodemailer (SMTP)

Day.js (fuso/cron)

node-cron (agendamento)

Frontend: HTML/CSS/JS (sem framework)

⚙️ Rodando localmente
1) Requisitos

Node.js LTS (>= 18)

(Dev) SQLite embutido; (Prod) Postgres

2) Instalar dependências
npm install

3) Criar .env

Crie um arquivo .env na raiz com:

# App
PORT=3000
TZ=America/Sao_Paulo
LEAD_DAYS=3
DAILY_JOB_HOUR=09

# E-mail (SMTP Brevo ou outro)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=SEU_USUARIO
SMTP_PASS=SUA_SENHA
MAIL_FROM="Nome <no-reply@seudominio.com>"

# Quem recebe os lembretes por padrão
NOTIFY_TO=voce@exemplo.com

# DB (deixe vazio para SQLite local: ./data.db)
DATABASE_URL=


Para Gmail SMTP, use App Password (2FA) e ajuste host/porta. Para Brevo, autentique domínio e remetente.

4) Iniciar API
npm run dev


Acesse:

Contatos: http://localhost:3000/contacts-themed.html

Logs: http://localhost:3000/logs.html

Saúde: http://localhost:3000/health

🗄️ Banco de dados
Opção A — SQLite (dev)

Usa ./data.db automaticamente. Bom para desenvolvimento.

Opção B — PostgreSQL (recomendado em produção)

Defina DATABASE_URL no formato:

postgresql://USER:PASSWORD@HOST:PORT/DBNAME


No código, se DATABASE_URL existir, use Postgres (pg/pool); senão, caia para SQLite. (Se ainda não estiver assim, marque uma issue “migrar DB para Postgres” — posso te enviar o patch rapidamente.)

☁️ Deploy no Railway (com Postgres)

Criar projeto no Railway e conecte ao GitHub.

Adicionar Postgres (Provisionar um “Database” no Railway).

Copie a DATABASE_URL gerada.

Em Variables do serviço (sua API), adicione:

PORT = 3000

TZ = America/Sao_Paulo

LEAD_DAYS = 3

DAILY_JOB_HOUR = 09

SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, NOTIFY_TO

DATABASE_URL = (a URL do Postgres do Railway)

Start Command: node index.js

Cron: você já usa node-cron no código para rodar diariamente. Railway mantém o processo ativo.

⚠️ Se preferir, dá para usar Railway Cron para chamar um endpoint /jobs/run-birthday-check em horário UTC — mas com node-cron já funciona.

🔐 (Roadmap) Login / Multi-tenant
Objetivo

Isolar dados por cliente e permitir que cada um gerencie seus contatos.

Passos

Tabela users (id, name, email unique, password_hash, created_at).

Tabela accounts (id, name, owner_user_id).

Tabela pivot user_accounts (user_id, account_id, role).

Adicionar account_id em contacts e mail_logs.

Auth:

POST /auth/signup (opcional), POST /auth/login → retorna JWT

Middleware que valida Authorization: Bearer <token> e injeta req.accountId.

Frontend: proteger páginas; exibir apenas dados do account_id.

Se quiser, eu mando um patch pronto com JWT + bcrypt + middleware e as migrações SQL.

🔧 Endpoints principais

GET /health

GET /contacts?q=ana

POST /contacts { name, email, phone, birthdate }

PUT /contacts/:id

DELETE /contacts/:id

POST /jobs/run-birthday-check?days=0&sendTo=...&force=1

GET /mail-logs?status=&day=&q_name=&q_to=&limit=100&offset=0 (se já estiver no seu backend)

🧪 Testes rápidos (curl)
# ping
curl http://localhost:3000/health

# criar contato
curl -X POST http://localhost:3000/contacts \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana","email":"ana@ex.com","phone":"+55 62 9999-0000","birthdate":"1990-05-10"}'

# listar
curl http://localhost:3000/contacts

# executar lembrete hoje (enviar para NOTIFY_TO)
curl -X POST "http://localhost:3000/jobs/run-birthday-check?days=0"

🧭 Roadmap de produto (sugestão)

 Login/JWT e multi-tenant (accounts)

 Postgres em produção (Railway/Supabase/Neon)

 Importação CSV (contatos em massa)

 Templates de e-mail personalizáveis

 Webhook/integração com WhatsApp (Ex.: Z-API/360dialog)

 Melhorias UX: toasts, validação inline, paginação

 Painel admin (usuários, contas, limites)

📄 Licença

Escolha a licença que preferir (MIT é simples para MVPs).