# Voltra Backend v2.1 — MetaApi Bridge

Real MT5 trade copying via MetaApi.cloud.

## Setup
Set `METAAPI_TOKEN` env var. Without it, accounts use stub mode.

## How it works
1. User connects MT5 account → backend provisions in MetaApi (async, ~30-60s)
2. For each MASTER account, copy engine attaches WebSocket listener
3. On master trade → applies CopyRule logic → executes on slave
4. Trade logged in DB
