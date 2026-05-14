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
<body style="margin:0;padding:0;background:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#f5f5f5">
  <div style="max-width:560px;margin:40px auto;background:#0c0c0c;border:1px solid #1f1f1f;border-radius:16px;overflow:hidden">
    <div style="padding:28px 32px;border-bottom:1px solid #1f1f1f">
      <span style="font-size:24px;color:#B4FF39;vertical-align:middle">⚡</span>
      <span style="font-size:20px;font-weight:700;letter-spacing:0.02em;vertical-align:middle;margin-left:8px">VOLTRA</span>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;letter-spacing:-0.02em;color:#fff">${title}</h1>
      <div style="font-size:15px;line-height:1.6;color:#cccccc">${content}</div>
      ${ctaUrl ? `<div style="margin:28px 0"><a href="${ctaUrl}" style="display:inline-block;background:#B4FF39;color:#000;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;font-size:15px">${ctaText}</a></div>` : ''}
    </div>
    <div style="padding:20px 32px;border-top:1px solid #1f1f1f;font-size:11px;color:#888">
      <p style="margin:0 0 6px">© 2026 Voltra Solutions. Tutti i diritti riservati.</p>
      <p style="margin:0">Aiuto? <a href="mailto:${support}" style="color:#B4FF39;text-decoration:none">${support}</a></p>
    </div>
  </div>
</body></html>`

export async function sendVerificationEmail(email, name, token) {
  if (!resend) { console.warn('[email] RESEND_API_KEY missing'); return }
  const { from, support } = await getEmailConfig()
  const verifyUrl = `https://voltrasolutions.com/verify-email?token=${token}`
  const html = baseTemplate(
    `Benvenuto in Voltra, ${name || 'trader'}!`,
    `<p>Grazie per esserti registrato. <strong>Verifica la tua email</strong> per attivare l'account e iniziare a tradare.</p>
     <p>Una volta verificato, potrai:</p>
     <ul style="padding-left:20px;line-height:1.8">
       <li>Acquistare il programma che ti rappresenta</li>
       <li>Accedere alla dashboard professionale</li>
       <li>Richiedere payout in crypto</li>
     </ul>
     <p style="color:#888;font-size:13px;margin-top:24px">Se non ti sei registrato, ignora questa email.</p>`,
    verifyUrl, 'Verifica email', support
  )
  try {
    await resend.emails.send({ from, to: email, subject: 'Benvenuto in Voltra — Verifica la tua email', html, replyTo: support })
  } catch (e) { console.error('[email] verify failed:', e.message) }
}

export async function sendWelcomeEmail(email, name) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const html = baseTemplate(
    `Account attivo, ${name}!`,
    `<p>La tua email è stata verificata. Ora puoi accedere a tutti i servizi Voltra.</p>
     <p><strong>Prossimi passi:</strong></p>
     <ol style="padding-left:20px;line-height:1.8">
       <li>Scegli il programma che fa per te</li>
       <li>Completa il pagamento in crypto</li>
       <li>Ricevi le credenziali del tuo account</li>
       <li>Inizia a tradare</li>
     </ol>`,
    'https://voltrasolutions.com/buy', 'Vedi i programmi', support
  )
  try {
    await resend.emails.send({ from, to: email, subject: 'Account attivo — Inizia a tradare', html, replyTo: support })
  } catch (e) { console.error('[email] welcome failed:', e.message) }
}

export async function sendContactEmail({ name, email, subject, message }) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#050505;font-family:Arial,sans-serif;color:#f5f5f5">
    <div style="max-width:560px;margin:40px auto;background:#0c0c0c;border:1px solid #1f1f1f;border-radius:16px;padding:28px">
      <h1 style="margin:0 0 20px;color:#B4FF39;font-size:20px">Nuovo messaggio dal sito</h1>
      <table style="width:100%;font-size:14px;line-height:1.7">
        <tr><td style="color:#888;width:100px">Nome:</td><td><strong>${name}</strong></td></tr>
        <tr><td style="color:#888">Email:</td><td><a href="mailto:${email}" style="color:#B4FF39">${email}</a></td></tr>
        <tr><td style="color:#888">Oggetto:</td><td>${subject || '—'}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #1f1f1f;margin:20px 0">
      <div style="white-space:pre-wrap;line-height:1.6">${message}</div>
    </div></body></html>`
  try {
    await resend.emails.send({ from, to: support, replyTo: email, subject: `[Contatto] ${subject || 'Da ' + name}`, html })
  } catch (e) { console.error('[email] contact failed:', e.message) }
}
