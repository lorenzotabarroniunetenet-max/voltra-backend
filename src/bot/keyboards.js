import { InlineKeyboard } from 'grammy'

export const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Menu principale admin
export function adminHomeKeyboard() {
  return new InlineKeyboard()
    .text('🎖 Promozioni', 'v1:sec:orders').row()
    .text('💰 Rimborsi', 'v1:sec:payouts').row()
    .text('⚔️ Missioni', 'v1:sec:missions').row()
    .text('👥 Membri', 'v1:sec:members').row()
    .text('📊 Rapporto rapido', 'v1:sec:stats').row()
    .text('📢 Ordine del Giorno', 'v1:sec:broadcast').row()
}

// Menu principale membro
export function memberHomeKeyboard(linked = true) {
  if (!linked) {
    return new InlineKeyboard()
      .text('🔗 Collega account', 'v1:link:request').row()
  }
  return new InlineKeyboard()
    .text('🎖 Il mio grado', 'v1:me:rank').row()
    .text('⚔️ Stato missione', 'v1:me:mission').row()
    .text('💰 Prossimo rimborso', 'v1:me:payout').row()
    .text('📨 Supporto', 'v1:me:support').row()
    .text('❓ FAQ', 'v1:me:faq').text('📖 Guida', 'v1:guida').row()
}

// Ordini
export function ordersListKeyboard(orders) {
  const kb = new InlineKeyboard()
  for (const o of orders.slice(0, 8)) {
    const label = `${o.user?.name || 'Anonimo'} → ${o.programName}`
    kb.text(label.substring(0, 40), `v1:o:view:${o.id}`).row()
  }
  kb.text('← Home', 'v1:home')
  return kb
}

export function orderDetailKeyboard(orderId, isMod = false) {
  const kb = new InlineKeyboard()
  if (isMod) {
    kb.text('✅ Approva', `v1:o:apr:${orderId}`)
      .text('❌ Rifiuta', `v1:o:rej:${orderId}`).row()
  }
  return kb.text('← Promozioni', 'v1:sec:orders')
}

export function orderConfirmKeyboard(action, orderId) {
  return new InlineKeyboard()
    .text('✅ Conferma', `v1:o:conf:${action}:${orderId}`).row()
    .text('❌ Annulla', `v1:o:view:${orderId}`)
}

// Missioni
export function missionDetailKeyboard(accountId) {
  return new InlineKeyboard()
    .text('✅ Compiuta', `v1:m:set:PASSED:${accountId}`)
    .text('❌ Fallita', `v1:m:set:FAILED:${accountId}`).row()
    .text('💰 Liquidata', `v1:m:set:PAID_OUT:${accountId}`)
    .text('▶️ Riattiva', `v1:m:set:ACTIVE:${accountId}`).row()
    .text('🔓 Sblocca rimborso', `v1:m:payout:${accountId}`).row()
    .text('← Missioni', 'v1:sec:missions')
}

export function missionConfirmKeyboard(action, accountId) {
  const labels = {
    PASSED: 'missione compiuta',
    FAILED: 'missione fallita',
    PAID_OUT: 'missione liquidata',
    ACTIVE: 'riattivazione missione',
    payout: 'sblocco rimborso',
  }
  return new InlineKeyboard()
    .text(`✅ Sì, conferma ${labels[action] || action}`, `v1:m:conf:${action}:${accountId}`).row()
    .text('❌ Annulla', `v1:m:view:${accountId}`)
}

// Rimborsi
export function payoutsListKeyboard(payouts) {
  const kb = new InlineKeyboard()
  for (const p of payouts.slice(0, 8)) {
    const label = `${p.account?.user?.name || 'Anonimo'} $${Number(p.amount).toLocaleString()}`
    kb.text(label.substring(0, 40), `v1:p:view:${p.id}`).row()
  }
  kb.text('← Home', 'v1:home')
  return kb
}

export function payoutDetailKeyboard(payoutId) {
  return new InlineKeyboard()
    .text('✅ Approva', `v1:p:apr:${payoutId}`)
    .text('❌ Rifiuta', `v1:p:rej:${payoutId}`).row()
    .text('← Rimborsi', 'v1:sec:payouts')
}

export function payoutConfirmKeyboard(action, payoutId) {
  return new InlineKeyboard()
    .text('✅ Conferma', `v1:p:conf:${action}:${payoutId}`).row()
    .text('❌ Annulla', `v1:p:view:${payoutId}`)
}

// Broadcast
export function broadcastConfirmKeyboard(count) {
  return new InlineKeyboard()
    .text(`📢 Invia a ${count} membri`, 'v1:bc:conf').row()
    .text('❌ Annulla', 'v1:home')
}

// Bottone home
export function backHomeKeyboard() {
  return new InlineKeyboard().text('← Home', 'v1:home')
}
