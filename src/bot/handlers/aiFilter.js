import { Composer, InlineKeyboard } from 'grammy'
import { callClaude } from '../../services/claude.js'
import { escapeHtml } from '../notify.js'
import { prisma } from '../../lib/prisma.js'
import { getSetting } from '../../lib/settings.js'

const DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || '5', 10)

export function buildAIFilter(bot, auth) {
  const composer = new Composer()

  composer
    .chatType('private')
    .on('message:text')
    .use(async (ctx, next) => {
      const text = ctx.message?.text || ''
      if (text.startsWith('/')) return next()
      if (await auth.isAdmin(ctx) || await auth.isMod(ctx)) return next()

      try {
        const chatId = String(ctx.from.id)
        const user = await prisma.user.findFirst({ where: { telegramChatId: chatId } })
        if (!user) { await ctx.reply('Account non collegato. Vai su voltrasolutions.com → Personale → Collega Telegram.'); return }

        // kill-switch
        const ks = await getSetting('AI_KILL_SWITCH', 'off')
        const aiOff = ks === 'on' || ks === 'true'

        let category = null, reply = null, summary = null

        if (!aiOff) {
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const usage = await prisma.aIUsage.findUnique({ where: { userId_date: { userId: user.id, date: today } } })
          if ((usage?.count || 0) < DAILY_LIMIT) {
            const result = await callClaude(text)
            if (result) {
              category = result.category; reply = result.reply; summary = result.summary
              if (category === 'GENERIC') {
                await prisma.aIUsage.upsert({
                  where: { userId_date: { userId: user.id, date: today } },
                  create: { userId: user.id, date: today, count: 1 },
                  update: { count: { increment: 1 } },
                })
              }
            }
          }
        }

        if (category === 'GENERIC' && reply) {
          await ctx.reply(`🤖 <i>Cifratrice del Comando</i>\n\n${escapeHtml(reply)}`, { parse_mode: 'HTML' })
          return
        }

        // OPERATIVE o AI off → persist in conversation
        const conv = await getOrCreateConv(user.id)
        await prisma.supportMessage.create({
          data: { conversationId: conv.id, senderRole: 'MEMBER', senderChatId: chatId, body: text, aiSummary: summary || null },
        })
        await prisma.supportConversation.update({
          where: { id: conv.id },
          data: { lastMessageAt: new Date(), unreadByAdmin: { increment: 1 } },
        })
        await ctx.reply('📨 Messaggio inoltrato al Comando. Riceverai risposta a breve.', {
          reply_markup: new InlineKeyboard().text('← Menu', 'v1:member:home')
        })

        // alert admin
        const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID
        if (adminChat) {
          const head = `📩 <b>Nuovo messaggio supporto</b>\n👤 <b>${escapeHtml(user.name)}</b> · <code>${escapeHtml(user.matricola || '—')}</code>\n`
          const sum = summary ? `\n<b>Sommario AI:</b>\n<blockquote>${escapeHtml(summary)}</blockquote>` : ''
          const body = `\n<b>Messaggio:</b>\n${escapeHtml(text).slice(0, 1200)}`
          const kb = new InlineKeyboard()
            .text('✍️ Rispondi', `sup:reply:${conv.id}`)
            .text('✅ Chiudi', `sup:close:${conv.id}`).row()
            .text('📬 Inbox', 'v1:sec:support')
          await bot.api.sendMessage(Number(adminChat), (head + sum + body).slice(0, 4000), {
            parse_mode: 'HTML', reply_markup: kb,
          })
        }
      } catch (e) {
        console.error(`[aiFilter] ${e.message}`)
        await ctx.reply('⚠️ Errore di inoltro. Riprova tra qualche minuto.').catch(() => {})
      }
    })

  return composer
}

async function getOrCreateConv(userId) {
  const existing = await prisma.supportConversation.findFirst({
    where: { userId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
  })
  if (existing) return existing
  return prisma.supportConversation.create({ data: { userId, status: 'OPEN' } })
}
