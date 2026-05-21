import { InlineKeyboard } from 'grammy'

export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function notifyMember(bot, user, kind, payload = {}) {
  if (!user?.telegramChatId) return
  try {
    let text
    const extra = { parse_mode: 'HTML' }
    switch (kind) {
      case 'mission_updated':
        text = `🎯 <b>Aggiornamento Missione</b>\nStato: <b>${escapeHtml(payload.status)}</b>\nMatricola: <code>${escapeHtml(user.matricola || '—')}</code>`
        break
      case 'payout_unlocked':
        text = `💰 <b>Rimborso disponibile</b>\nImporto: $${Number(payload.amount).toLocaleString()}\nProcedi dalla sezione Rimborso del bot o dal sito.`
        break
      case 'order_approved':
        text = `✅ <b>Promozione approvata</b>\n\nComplimenti, <b>${escapeHtml(user.name)}</b>.\nSei stato promosso a <b>${escapeHtml(payload.programName || '')}</b>.\n\nLa tua missione è ora attiva su voltrasolutions.com.`
        break
      case 'order_rejected':
        text = `❌ <b>Promozione respinta</b>\n\nOrdine #${escapeHtml(payload.orderId)}\n\n<b>Motivo del Comando:</b>\n<blockquote>${escapeHtml(payload.reason || 'Non specificato')}</blockquote>`
        break
      case 'weekly_mission':
        text = `📅 <b>Rapporto Settimanale</b>\nStato missione: <b>${escapeHtml(payload.status)}</b>\nIngaggio attivo. Accedi al Quartier Generale per i dettagli.`
        break
      case 'anniversary': {
        const y = payload.years
        text = `🎖 <b>Anniversario di arruolamento</b>\n${y} ${y === 1 ? 'anno' : 'anni'} al servizio del Comando Voltra. Onore a te, ${escapeHtml(user.name || user.email)}.`
        break
      }
      case 'support_closed':
        text = `✅ Ticket di supporto chiuso. Come valuteresti il supporto ricevuto?`
        extra.reply_markup = new InlineKeyboard()
          .text('⭐', `rate:${payload.conversationId}:1`)
          .text('⭐⭐', `rate:${payload.conversationId}:2`)
          .text('⭐⭐⭐', `rate:${payload.conversationId}:3`).row()
          .text('⭐⭐⭐⭐', `rate:${payload.conversationId}:4`)
          .text('⭐⭐⭐⭐⭐', `rate:${payload.conversationId}:5`)
        break
      case 'support_admin_reply':
        text = `💬 <b>Risposta del Comando</b>\n\n${escapeHtml(payload.body)}`
        break
      default:
        return
    }
    await bot.api.sendMessage(Number(user.telegramChatId), text, extra)
  } catch (e) {
    console.warn(`[notifyMember] user=${user.id} kind=${kind}: ${e.message}`)
  }
}
