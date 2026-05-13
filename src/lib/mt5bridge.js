import MetaApi from 'metaapi.cloud-sdk/esm-node'

const TOKEN = process.env.METAAPI_TOKEN
let _api = null
const _connections = new Map()  // accountId -> connection

function getApi() {
  if (!TOKEN) return null
  if (!_api) _api = new MetaApi(TOKEN, { region: 'new-york' })
  return _api
}

export const isMetaApiEnabled = () => !!TOKEN

// Provision an MT5/MT4 account in MetaApi
export async function provisionAccount({ label, broker, server, login, password, platform = 'mt5', accountType = 'cloud-g2' }) {
  const api = getApi()
  if (!api) throw new Error('METAAPI_TOKEN not configured')

  const account = await api.metatraderAccountApi.createAccount({
    name: label,
    type: accountType,
    login,
    password,
    server,
    platform: platform.toLowerCase(),
    application: 'MetaApi',
    magic: Math.floor(Math.random() * 1000000),
    quoteStreamingIntervalInSeconds: 2.5
  })

  // Deploy + wait for connection (synchronously up to 2 min)
  await account.deploy()
  return { metaapiAccountId: account.id, state: account.state }
}

// Get account info (balance, equity)
export async function getAccountInfo(metaapiAccountId) {
  const api = getApi()
  if (!api) throw new Error('METAAPI_TOKEN not configured')
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId)
  if (account.state !== 'DEPLOYED') return { state: account.state, balance: 0, equity: 0 }
  const connection = await _getConnection(account)
  const info = connection.terminalState.accountInformation
  return {
    state: account.state,
    balance: info?.balance || 0,
    equity: info?.equity || 0,
    currency: info?.currency || 'USD',
    leverage: info?.leverage || 100,
    margin: info?.margin || 0,
    freeMargin: info?.freeMargin || 0
  }
}

// Open a trade on slave account
export async function openTrade(metaapiAccountId, { symbol, side, lots, tp, sl, slippage = 3, comment = 'voltra' }) {
  const api = getApi()
  if (!api) throw new Error('METAAPI_TOKEN not configured')
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId)
  const connection = await _getConnection(account)
  const method = side === 'BUY' ? 'createMarketBuyOrder' : 'createMarketSellOrder'
  const result = await connection[method](symbol, lots, sl || undefined, tp || undefined, { comment, slippage })
  return { ok: true, ticket: result.orderId, openPrice: result.openPrice || 0 }
}

// Close a position
export async function closePosition(metaapiAccountId, positionId) {
  const api = getApi()
  if (!api) throw new Error('METAAPI_TOKEN not configured')
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId)
  const connection = await _getConnection(account)
  const result = await connection.closePosition(positionId)
  return { ok: true, closePrice: result.closePrice || 0 }
}

// Get open positions
export async function getPositions(metaapiAccountId) {
  const api = getApi()
  if (!api) throw new Error('METAAPI_TOKEN not configured')
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId)
  const connection = await _getConnection(account)
  return connection.terminalState.positions || []
}

// Remove account from MetaApi
export async function removeAccount(metaapiAccountId) {
  const api = getApi()
  if (!api) return
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId)
  try { await account.undeploy() } catch {}
  try { await account.remove() } catch {}
  _connections.delete(metaapiAccountId)
}

async function _getConnection(account) {
  if (_connections.has(account.id)) return _connections.get(account.id)
  const conn = account.getStreamingConnection()
  await conn.connect()
  await conn.waitSynchronized({ timeoutInSeconds: 60 })
  _connections.set(account.id, conn)
  return conn
}

// Apply copy rule logic (pure function - unchanged)
export function applyCopyRule(rule, masterTrade, masterEquity, slaveEquity) {
  const wl = rule.symbolWhitelist ? rule.symbolWhitelist.split(',').map(s => s.trim()).filter(Boolean) : null
  const bl = rule.symbolBlacklist ? rule.symbolBlacklist.split(',').map(s => s.trim()).filter(Boolean) : null
  if (wl && !wl.includes(masterTrade.symbol)) return null
  if (bl && bl.includes(masterTrade.symbol)) return null

  let side = masterTrade.side
  if (rule.reverse) side = side === 'BUY' ? 'SELL' : 'BUY'

  let lots
  if (rule.lotMode === 'FIXED') lots = rule.lotValue
  else if (rule.lotMode === 'PROPORTIONAL') lots = masterTrade.lots * (slaveEquity / masterEquity) * rule.lotValue
  else lots = masterTrade.lots * rule.lotValue
  lots = Math.max(0.01, Math.round(lots * 100) / 100)

  let tp = masterTrade.tp
  if (rule.tpMode === 'DISABLED') tp = null
  else if (rule.tpMode === 'OVERRIDE') tp = rule.tpValue

  let sl = masterTrade.sl
  if (rule.slMode === 'DISABLED') sl = null
  else if (rule.slMode === 'OVERRIDE') sl = rule.slValue

  return { symbol: masterTrade.symbol, side, lots, tp, sl, slippage: rule.maxSlippage }
}

// Legacy stub interface for old code (will be removed)
export const mt5Bridge = {
  async connectAccount(data) {
    if (!TOKEN) return { ok: true, accountId: `stub-${data.login}`, balance: 0, equity: 0, currency: 'USD', leverage: 100 }
    try {
      const r = await provisionAccount(data)
      return { ok: true, accountId: r.metaapiAccountId, balance: 0, equity: 0, currency: 'USD', leverage: 100, state: r.state }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }
}
