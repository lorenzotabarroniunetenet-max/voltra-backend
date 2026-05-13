# Voltra Backend

Node.js + SQLite + JWT. Single-file `server.js`. API per il copy-trading + Admin panel HTML.

## Setup locale

```bash
cd voltra-backend
npm install
cp .env.example .env
npm run seed     # crea DB con dati demo
npm run dev      # avvia su :4000
```

Credenziali demo:
- Admin: `admin@voltrasolutions.com` / `admin1234`
- Follower: `demo@voltrasolutions.com` / `demo1234`

## Admin panel

Apri `admin.html` nel browser. Usa email admin per login. Da lì gestisci tutti i master trader (aggiungi/modifica/elimina).

## Deploy production

**Render.com** (free tier):
1. Push questa cartella su GitHub come `voltra-backend`
2. Render → New → Web Service → Connect repo
3. Build: `npm install` | Start: `npm start`
4. Env vars: `JWT_SECRET`, `BRIDGE_API_KEY`, `CORS_ORIGIN=https://voltrasolutions.com`
5. Add Disk: mount path `/opt/render/project/src`, 1GB (per persistenza SQLite)
6. URL pubblico: `https://voltra-backend.onrender.com`

**Railway / Fly.io / VPS** stesso pattern.

## API endpoints

| Method | Endpoint | Auth |
|---|---|---|
| POST | `/api/auth/register` | - |
| POST | `/api/auth/login` | - |
| GET | `/api/auth/me` | user |
| GET | `/api/masters` | - |
| GET | `/api/masters/:id` | - |
| POST | `/api/masters` | admin |
| PUT | `/api/masters/:id` | admin |
| DELETE | `/api/masters/:id` | admin |
| GET | `/api/accounts` | user |
| POST | `/api/accounts` | user |
| DELETE | `/api/accounts/:id` | user |
| POST | `/api/copy/connect` | user |
| POST | `/api/copy/disconnect` | user |
| GET | `/api/trades/master/:id` | - |
| POST | `/api/trades/ingest` | API key |
| GET | `/api/portfolio` | user |

## MT5 Bridge

Il backend riceve trade ingestion via `POST /api/trades/ingest`. Opzioni di integrazione:

1. **MetaApi.cloud** (SaaS): API REST/WebSocket per MT5, abbonamento ~$50/mese
2. **EA custom MT5** su VPS Windows: Expert Advisor che fa POST a `/api/trades/ingest` per ogni trade master

Body ingest:
```json
{
  "apiKey": "BRIDGE_API_KEY",
  "masterId": 1,
  "ticket": "12345",
  "symbol": "EURUSD",
  "side": "BUY",
  "lots": 0.10,
  "openPrice": 1.0852,
  "closePrice": 1.0871,
  "pnl": 19.00,
  "openTime": "2026-05-13T10:00:00Z",
  "closeTime": "2026-05-13T11:30:00Z",
  "status": "closed"
}
```

## Schema DB

`users`, `masters`, `accounts`, `connections`, `trades`, `equity_history`

## Profit split

Default 70% master / 30% platform. Configurabile per master via `fee_split`.

## Sicurezza prod

- Cambia `JWT_SECRET` e `BRIDGE_API_KEY` con stringhe random 32+ char
- HTTPS obbligatorio
- Cripta `mt5_password` con AES-256 prima di salvare (TODO)
- Rate limiting con `express-rate-limit` (TODO)
