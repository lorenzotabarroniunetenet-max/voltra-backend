import { prisma } from '../lib/prisma.js'
import { applyCopyRule, openTrade, closePosition, getAccountInfo, isMetaApiEnabled } from '../lib/mt5bridge.js'
import MetaApi from 'metaapi.cloud-sdk/esm-node'

const TOKEN = process.env.METAAPI_TOKEN

// Map of masterId -> { listener, connection, knownPositions: Set }
const _listeners = new Map()
let _api = null

function getApi() {
  if (!TOKEN) return null
  if (!_api) _api = new MetaApi(TOKEN, { region: 'new-york' })
  return _api
}

// Subscribe to a master account's trade events
export async function attachMaster(masterAccount) {
  if (!isMetaApiEnabled() || !masterAccount.metaapiAccountId) return
  if (_listeners.has(masterAccount.id)) return

  console.log(`[copy-engine] attaching master ${masterAccount.label} (${masterAccount.login})`)
  const api = getApi()
  const account = await api.metatraderAccountApi.getAccount(masterAccount.metaapiAccountId)
  const connection = account.getStreamingConnection()
  await connection.connect()
  await connection.waitSynchronized({ timeoutInSeconds: 120 })

  const knownPositions = new Map()
  for (const p of connection.terminalState.positions || []) knownPositions.set(p.id, p)

  const listener = {
    async onPositionUpdate(positionId, position) {
      try {
        if (!knownPositions.has(positionId)) {
          knownPositions.set(positionId, position)
          await handleNewMasterPosition(masterAccount.id, position)
        } else {
          knownPositions.set(positionId, position)
        }
      } catch (e) { console.error('[copy-engine] onPositionUpdate error:', e.message) }
    },
    async onPositionRemoved(positionId) {
      try {
        const pos = knownPositions.get(positionId)
        knownPositions.delete(positionId)
        if (pos) await handleClosedMasterPosition(masterAccount.id, positionId)
      } catch (e) { console.error('[copy-engine] onPositionRemoved error:', e.message) }
    }
  }

  connection.addSynchronizationListener(listener)
  _listeners.set(masterAccount.id, { listener, connection, knownPositions })
}

export function detachMaster(masterAccountId) {
  const entry = _listeners.get(masterAccountId)
  if (!entry) return
  try { entry.connection.close() } catch {}
  _listeners.delete(masterAccountId)
}

async function handleNewMasterPosition(masterAccountId, position) {
  const rules = await prisma.copyRule.findMany({
    where: { masterAccountId, status: 'ACTIVE' },
    include: { master: true, slave: true }
  })

  for (const rule of rules) {
    try {
      if (!rule.slave.metaapiAccountId) continue
      const masterInfo = await getAccountInfo(rule.master.metaapiAccountId)
      const slaveInfo = await getAccountInfo(rule.slave.metaapiAccountId)

      const masterTrade = {
        symbol: position.symbol,
        side: position.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
        lots: position.volume,
        tp: position.takeProfit || null,
        sl: position.stopLoss || null
      }

      const slaveOrder = applyCopyRule(rule, masterTrade, masterInfo.equity || 1, slaveInfo.equity || 1)
      if (!slaveOrder) continue

      const result = await openTrade(rule.slave.metaapiAccountId, slaveOrder)
      await prisma.trade.create({
        data: {
          ruleId: rule.id,
          symbol: slaveOrder.symbol,
          side: slaveOrder.side,
          lots: slaveOrder.lots,
          openPrice: result.openPrice || 0,
          tp: slaveOrder.tp,
          sl: slaveOrder.sl,
          status: 'OPEN',
          masterTicket: String(position.id),
          slaveTicket: String(result.ticket)
        }
      })
      console.log(`[copy-engine] copied ${masterTrade.symbol} ${masterTrade.side} → rule ${rule.label}`)
    } catch (e) {
      console.error(`[copy-engine] rule ${rule.id} failed:`, e.message)
      await prisma.trade.create({
        data: {
          ruleId: rule.id, symbol: position.symbol,
          side: position.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
          lots: position.volume, openPrice: 0, status: 'ERROR',
          masterTicket: String(position.id), errorMessage: e.message
        }
      })
    }
  }
}

async function handleClosedMasterPosition(masterAccountId, positionId) {
  const trades = await prisma.trade.findMany({
    where: { masterTicket: String(positionId), status: 'OPEN', rule: { masterAccountId } },
    include: { rule: { include: { slave: true } } }
  })
  for (const t of trades) {
    try {
      if (!t.slaveTicket || !t.rule.slave.metaapiAccountId) continue
      const r = await closePosition(t.rule.slave.metaapiAccountId, t.slaveTicket)
      await prisma.trade.update({
        where: { id: t.id },
        data: { status: 'CLOSED', closePrice: r.closePrice || 0, closedAt: new Date() }
      })
    } catch (e) {
      console.error(`[copy-engine] close failed trade ${t.id}:`, e.message)
    }
  }
}

// Boot: attach all existing active masters
export async function bootCopyEngine() {
  if (!isMetaApiEnabled()) {
    console.log('[copy-engine] METAAPI_TOKEN not set - engine disabled')
    return
  }
  console.log('[copy-engine] booting...')
  const masters = await prisma.mt5Account.findMany({
    where: { type: 'MASTER', status: 'ACTIVE', metaapiAccountId: { not: null } }
  })
  console.log(`[copy-engine] found ${masters.length} master accounts to attach`)
  for (const m of masters) {
    attachMaster(m).catch(e => console.error(`[copy-engine] failed to attach ${m.id}:`, e.message))
  }
}
