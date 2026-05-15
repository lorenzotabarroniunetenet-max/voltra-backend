import { Resend } from 'resend'
import { getSetting } from './settings.js'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

async function getEmailConfig() {
  const from = await getSetting('EMAIL_FROM', process.env.EMAIL_FROM || 'Voltra <noreply@voltrasolutions.com>')
  const support = await getSetting('SUPPORT_EMAIL', process.env.SUPPORT_EMAIL || 'support@voltrasolutions.com')
  return { from, support }
}

const baseTemplate = (title, content, ctaUrl, ctaText, support) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#f0f0f0">
  <div style="max-width:560px;margin:40px auto;background:#0a0a0a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden">
    <div style="padding:28px 32px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <span style="font-size:24px;color:#B4FF39;vertical-align:middle">⚡</span>
      <span style="font-size:20px;font-weight:700;letter-spacing:0.06em;vertical-align:middle;margin-left:8px;color:#ffffff">VOLTRA</span>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:22px;font-weight:700;margin:0 0 20px;letter-spacing:-0.01em;color:#ffffff">${title}</h1>
      <div style="font-size:15px;line-height:1.7;color:#cccccc">${content}</div>
      ${ctaUrl ? `<div style="margin:28px 0 8px"><a href="${ctaUrl}" style="display:inline-block;background:#B4FF39;color:#000;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;font-size:15px">${ctaText}</a></div>` : ''}
    </div>
    <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#707070">
      <p style="margin:0 0 6px;letter-spacing:0.04em">Silentio agimus.</p>
      <p style="margin:0">© 2026 Voltra Solutions. Contatti: <a href="mailto:${support}" style="color:#B4FF39;text-decoration:none">${support}</a></p>
    </div>
  </div>
</body></html>`

export async function sendVerificationEmail(email, name, token) {
  if (!resend) { console.warn('[email] RESEND_API_KEY missing'); return }
  const { from, support } = await getEmailConfig()
  const verifyUrl = `https://voltrasolutions.com/verify-email?token=${token}`
  const html = baseTemplate(
    `Verifica della Linea richiesta`,
    `<p>Egregio/a ${name || 'membro'},</p>
     <p>la Sua domanda di accesso è stata registrata. Per procedere alla valutazione del Comando, è necessario confermare l'indirizzo email.</p>
     <p>La preghiamo di cliccare il pulsante sottostante per completare la verifica.</p>
     <p style="color:#888;font-size:13px;margin-top:24px">Se non ha presentato alcuna domanda, ignori questo messaggio.</p>`,
    verifyUrl, 'Verifica la Linea', support
  )
  try {
    await resend.emails.send({ from, to: email, subject: 'Verifica della Linea — Voltra', html, replyTo: support })
  } catch (e) { console.error('[email] verify failed:', e.message) }
}

export async function sendWelcomeEmail(email, name) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const html = baseTemplate(
    `Domanda in valutazione presso il Comando`,
    `<p>Egregio/a ${name},</p>
     <p>la Sua Linea è stata verificata. La domanda di accesso è ora in valutazione presso il Comando.</p>
     <p>Procediamo per ordine: ciascuna domanda viene esaminata individualmente. Non sono previsti tempi standard.</p>
     <p>Non sono richieste azioni da parte Sua in questa fase. Riceverà comunicazione formale all'esito della valutazione.</p>
     <p style="color:#888;font-size:13px;margin-top:24px">La preghiamo di non inoltrare solleciti.</p>
     <p style="margin-top:24px"><strong style="color:#ffffff">Il Comando</strong><br><span style="color:#888">Voltra</span></p>`,
    null, null, support
  )
  try {
    await resend.emails.send({ from, to: email, subject: 'Domanda ricevuta — In valutazione presso il Comando', html, replyTo: support })
  } catch (e) { console.error('[email] welcome failed:', e.message) }
}

export async function sendApprovalEmail(email, name) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const html = baseTemplate(
    `Ammissione confermata`,
    `<p>${name},</p>
     <p>la Sua ammissione a Voltra è confermata. L'accesso al Quartier Generale è ora attivo.</p>
     <p>Al primo accesso Le sarà presentata la Cerimonia di Imposizione dei Gradi. È un passaggio breve ma vincolante: prenda il tempo necessario per leggere il Codice di Condotta del Suo grado.</p>
     <p>Da questo momento è tenuto/a alla disciplina della discrezione. Le comunicazioni interne non escono dal club. Le domande operative passano per la Linea Diretta HQ. Non esistono altre vie.</p>
     <p>Benvenuto/a.</p>
     <p style="margin-top:24px"><strong style="color:#ffffff">Il Comando</strong><br><span style="color:#888">Voltra</span></p>`,
    'https://voltrasolutions.com/login', 'Accesso al Quartier Generale', support
  )
  try {
    await resend.emails.send({ from, to: email, subject: 'Ammissione confermata — Benvenuto in Voltra', html, replyTo: support })
  } catch (e) { console.error('[email] approval failed:', e.message) }
}

export async function sendContactEmail({ name, email, subject, message }) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#000;font-family:Arial,sans-serif;color:#f0f0f0">
    <div style="max-width:560px;margin:40px auto;background:#0a0a0a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px">
      <h1 style="margin:0 0 20px;color:#B4FF39;font-size:20px">Linea Diretta HQ — Nuovo messaggio</h1>
      <table style="width:100%;font-size:14px;line-height:1.7">
        <tr><td style="color:#888;width:100px">Mittente:</td><td><strong>${name}</strong></td></tr>
        <tr><td style="color:#888">Linea:</td><td><a href="mailto:${email}" style="color:#B4FF39">${email}</a></td></tr>
        <tr><td style="color:#888">Oggetto:</td><td>${subject || '—'}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:20px 0">
      <div style="white-space:pre-wrap;line-height:1.6;color:#cccccc">${message}</div>
    </div></body></html>`
  try {
    await resend.emails.send({ from, to: support, replyTo: email, subject: `[Linea HQ] ${subject || 'Da ' + name}`, html })
  } catch (e) { console.error('[email] contact failed:', e.message) }
}
