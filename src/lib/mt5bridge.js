export const mt5Bridge = {
  async connectAccount({ broker, server, login, password }) {
    return { ok: true, accountId: `mt5-${login}`, balance: 0, equity: 0, currency: 'USD', leverage: 100 }
  },
  async startCopy({ masterId, slaveAccountId, lotRatio, maxDrawdown }) {
    return { ok: true, subscriptionId: `sub-${masterId}-${slaveAccountId}` }
  },
  async stopCopy(id) { return { ok: true } },
  async getMasterTrades(login, limit=50) { return [] }
}
