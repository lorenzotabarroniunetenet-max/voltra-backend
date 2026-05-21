import { getSetting } from './settings.js'

export async function notifyAdmin(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = await getSetting('TELEGRAM_ADMIN_CHAT_ID', process.env.TELEGRAM_ADMIN_CHAT_ID || '')
  if (!token || !chatId) {
    console.warn('[telegram] missing token or chat ID')
    return
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  try {
    // Primo tentativo con Markdown
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      console.warn('[telegram] markdown failed, retrying plain:', r.status, body)
      // Secondo tentativo senza parse_mode (testo semplice, sempre accettato)
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text.replace(/[*`\[\]()]/g, ''), disable_web_page_preview: true }),
      })
    }
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

export async function notifyOrderApproval({ user, order, approveUrl, profileUrl }) {
  const text =
    `🎖 NUOVA PROMOZIONE\n\n` +
    `Membro: ${user.name} (${user.email})\n` +
    `Matricola: ${user.matricola || 'N/D'}\n` +
    `Grado attuale: ${user.rank || 'Caporale'}\n` +
    `Richiesta: ${order.programName}\n` +
    `Importo: ${order.amount} ${order.currency}` + (order.network ? ` (${order.network})` : '') + `\n` +
    (order.txHash ? `TxHash: ${order.txHash}\n` : 'Nessuna TxHash\n') +
    (order.couponCode ? `Coupon: ${order.couponCode}\n` : '') +
    (order.receiptUrl ? `Ricevuta: ${order.receiptUrl}\n` : '') +
    `\nAPPROVA CON 1 CLICK:\n${approveUrl}\n\n` +
    `Scheda utente:\n${profileUrl}`
  await notifyPlain(text)
}

export async function notifyPlain(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = await getSetting('TELEGRAM_ADMIN_CHAT_ID', process.env.TELEGRAM_ADMIN_CHAT_ID || '')
  if (!token || !chatId) {
    console.warn('[telegram] missing token or chat ID')
    return
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      console.error('[telegram] plain send failed:', r.status, body)
    }
  } catch (e) {
    console.error('[telegram] plain send error:', e.message)
  }
}

export async function notifyPurchaseReceipt({ user, program, receiptUrl, network, coupon, purchaseCount }) {
  await notifyAdmin(
    `🎖 *Nuova Richiesta Grado*\n\n` +
    `Membro: ${user.name} (${user.email})\n` +
    `Grado: *${program.name}*\n` +
    `Quota: $${program.priceUsd}\n` +
    (coupon ? `Coupon: \`${coupon}\`\n` : '') +
    (network ? `Network: ${network}\n` : '') +
    (receiptUrl ? `TxHash: \`${receiptUrl}\`\n` : '⚠️ Nessuna TxHash\n') +
    (purchaseCount ? `\nOperazioni totali del membro: *${purchaseCount}*\n` : '') +
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

const CATEGORY_LABELS = {
  pagamento: '💰 PAGAMENTO',
  tecnico: '🔧 TECNICO',
  onorificenze: '🎖 ONORIFICENZE',
  grado: '⭐ GRADO',
  altro: '◈ ALTRO',
}

export async function notifySupportTicket({ user, category, subject, message }) {
  const tag = CATEGORY_LABELS[category] || '◈ ALTRO'
  await notifyAdmin(
    `🎫 *Nuovo Ticket Supporto* — ${tag}\n\n` +
    `Membro: ${user.name} (${user.email})\n` +
    `Oggetto: *${subject}*\n\n` +
    `Messaggio:\n${message.slice(0, 800)}${message.length > 800 ? '...' : ''}\n\n` +
    `[Apri Stato Maggiore](https://voltrasolutions.com/admin)`
  )
}
