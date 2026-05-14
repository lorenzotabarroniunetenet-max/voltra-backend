import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function sendVerificationEmail(email, token) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured, skipping email')
    return
  }
  const verifyUrl = `https://voltrasolutions.com/verify-email?token=${token}`
  try {
    await resend.emails.send({
      from: 'Voltra <noreply@voltrasolutions.com>',
      to: email,
      subject: 'Verifica la tua email - Voltra',
      html: `<p>Clicca sul link per verificare la tua email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`
    })
  } catch (e) {
    console.error('[email] send failed:', e.message)
  }
}
