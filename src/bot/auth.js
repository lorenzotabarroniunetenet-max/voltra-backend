import { getSetting } from '../lib/settings.js'

// Chat id numerici admin — letti dal DB (Setting TELEGRAM_ADMIN_IDS) con fallback env
async function getAdminIds() {
  const raw = await getSetting('TELEGRAM_ADMIN_IDS', process.env.TELEGRAM_ADMIN_CHAT_ID || '')
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(Number)
}

// Chat id numerici moderatori (solo approvazione ordini) — Setting TELEGRAM_MOD_IDS
async function getModIds() {
  const raw = await getSetting('TELEGRAM_MOD_IDS', '')
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(Number)
}

export async function isAdmin(ctx) {
  const ids = await getAdminIds()
  return ids.includes(ctx.from?.id)
}

export async function isSuperAdmin(ctx) {
  const superRaw = process.env.TELEGRAM_ADMIN_CHAT_ID || ''
  const superId = Number(superRaw)
  return ctx.from?.id === superId
}

export async function isMod(ctx) {
  const admins = await getAdminIds()
  const mods = await getModIds()
  return admins.includes(ctx.from?.id) || mods.includes(ctx.from?.id)
}

// Middleware: blocca se non admin
export async function requireAdmin(ctx, next) {
  if (await isAdmin(ctx)) return next()
  await ctx.answerCallbackQuery({ text: '⛔ Accesso negato', show_alert: true }).catch(() => {})
  return
}

// Middleware: blocca se non superadmin
export async function requireSuperAdmin(ctx, next) {
  if (await isSuperAdmin(ctx)) return next()
  await ctx.answerCallbackQuery({ text: '⛔ Accesso riservato al Comando', show_alert: true }).catch(() => {})
  return
}

// Middleware: blocca se non mod (admin o socio)
export async function requireMod(ctx, next) {
  if (await isMod(ctx)) return next()
  await ctx.answerCallbackQuery({ text: '⛔ Accesso negato', show_alert: true }).catch(() => {})
  return
}
