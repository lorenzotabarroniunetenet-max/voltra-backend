const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TG_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID

export async function notifyAdmin(text) {
  if (!TG_TOKEN || !TG_CHAT_ID) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not configured')
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'Markdown' }),
    })
  } catch (e) {
    console.error('[telegram] send failed:', e.message)
  }
}

export async function notifyPayoutRequest({ user, account, program, amount, network, address, payoutId }) {
  await notifyAdmin(
    `💸 *Richiesta Payout*\n` +
    `Trader: ${user.name} (${user.email})\n` +
    `Account: ${program.name} (${account.brokerLogin})\n` +
    `Importo: $${amount}\n` +
    `Network: ${network}\n` +
    `Indirizzo: \`${address}\`\n` +
    `[Apri admin](https://voltrasolutions.com/admin/payouts)`
  )
}

export async function notifyPurchaseReceipt({ user, program, receiptUrl }) {
  await notifyAdmin(
    `🛒 *Nuovo Acquisto Programma*\n` +
    `Trader: ${user.name} (${user.email})\n` +
    `Programma: ${program.name}\n` +
    `Importo: $${program.priceUsd}\n` +
    `${receiptUrl ? `Ricevuta: ${receiptUrl}` : 'Nessuna ricevuta caricata'}\n` +
    `[Attiva account](https://voltrasolutions.com/admin)`
  )
}
