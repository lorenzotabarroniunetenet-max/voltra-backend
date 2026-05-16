import { getSetting } from './settings.js'

export async function notifyAdmin(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = await getSetting('TELEGRAM_ADMIN_CHAT_ID', process.env.TELEGRAM_ADMIN_CHAT_ID || '')
  if (!token || !chatId) {
    console.warn('[telegram] missing token or chat ID')
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    })
  } catch (e) {
    console.error('[telegram] send failed:', e.message)
  }
}

export async function notifyPayoutRequest({ user, account, program, amount, network, address }) {
  await notifyAdmin(
    `💸 *Richiesta Payout*\n\n` +
    `Trader: ${user.name} (${user.email})\n` +
    `Account: ${program.name} (${account.brokerLogin})\n` +
    `Importo: $${amount}\n` +
    `Network: ${network}\n` +
    `Indirizzo: \`${address}\`\n\n` +
    `[Apri admin panel](https://voltrasolutions.com/admin)`
  )
}

export async function notifyPurchaseReceipt({ user, program, receiptUrl, network, coupon }) {
  await notifyAdmin(
    `🎖 *Nuova Richiesta Grado*\n\n` +
    `Membro: ${user.name} (${user.email})\n` +
    `Grado: *${program.name}*\n` +
    `Quota: $${program.priceUsd}\n` +
    (coupon ? `Coupon: \`${coupon}\`\n` : '') +
    (network ? `Network: ${network}\n` : '') +
    (receiptUrl ? `TxHash: \`${receiptUrl}\`\n` : '⚠️ Nessuna TxHash\n') +
    `\n[Apri Stato Maggiore](https://voltrasolutions.com/admin)`
  )
}

export async function notifyContact({ name, email, subject, message }) {
  await notifyAdmin(
    `📩 *Nuovo Contatto*\n\n` +
    `Nome: ${name}\n` +
    `Email: ${email}\n` +
    `Oggetto: ${subject || '—'}\n\n` +
    `Messaggio:\n${message.slice(0, 500)}${message.length > 500 ? '...' : ''}`
  )
}
