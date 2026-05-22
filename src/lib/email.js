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

export async function sendPasswordResetEmail(email, name, token) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const resetUrl = `https://voltrasolutions.com/reset-password?token=${token}`
  const html = baseTemplate(
    `Reimpostazione credenziale richiesta`,
    `<p>Egregio/a ${name},</p>
     <p>è stata richiesta la reimpostazione della credenziale di accesso al Quartier Generale.</p>
     <p>Cliccare il pulsante sottostante per procedere. Il collegamento ha validità di un'ora.</p>
     <p style="color:#888;font-size:13px;margin-top:24px">Se non ha richiesto la reimpostazione, ignori questo messaggio. La credenziale corrente resta valida.</p>
     <p style="margin-top:24px"><strong style="color:#ffffff">Il Comando</strong><br><span style="color:#888">Voltra</span></p>`,
    resetUrl, 'Reimposta credenziale', support
  )
  try {
    await resend.emails.send({ from, to: email, subject: 'Reimpostazione credenziale — Voltra', html, replyTo: support })
  } catch (e) { console.error('[email] reset failed:', e.message) }
}

export async function sendLoginCodeEmail(email, name, code) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const html = baseTemplate(
    `Codice di accesso al Quartier Generale`,
    `<p>Egregio/a ${name},</p>
     <p>è in corso un tentativo di accesso al Suo account. Il codice di verifica è:</p>
     <div style="margin:24px 0;padding:24px;background:#0a0a0a;border:1px solid #B4FF39;border-radius:8px;text-align:center">
       <div style="font-family:'JetBrains Mono',monospace;font-size:36px;letter-spacing:0.3em;color:#B4FF39;font-weight:700">${code}</div>
       <div style="font-size:11px;color:#888;margin-top:8px;letter-spacing:0.1em">VALIDO 10 MINUTI</div>
     </div>
     <p style="color:#888;font-size:13px">Se non sta tentando di accedere, ignori questa email e cambi immediatamente la propria credenziale.</p>
     <p style="margin-top:24px"><strong style="color:#ffffff">Il Comando</strong><br><span style="color:#888">Voltra</span></p>`,
    null, null, support
  )
  try {
    await resend.emails.send({ from, to: email, subject: `Codice accesso ${code} — Voltra`, html, replyTo: support })
  } catch (e) { console.error('[email] login code failed:', e.message) }
}

// ── Template premium con accent color variabile ──
const premiumTemplate = (title, content, ctaUrl, ctaText, support, accentColor = '#B4FF39') => `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#f0f0f0">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <!-- Header -->
    <div style="background:#050505;border:1px solid rgba(255,255,255,.07);border-radius:16px 16px 0 0;padding:24px 32px;border-bottom:2px solid ${accentColor}">
      <table cellpadding="0" cellspacing="0" style="width:100%"><tr>
        <td><span style="font-size:22px;color:${accentColor};vertical-align:middle">⚡</span><span style="font-size:18px;font-weight:800;letter-spacing:.08em;vertical-align:middle;margin-left:8px;color:#fff">VOLTRA</span></td>
        <td style="text-align:right;font-size:10px;color:#444;letter-spacing:.1em;text-transform:uppercase">Comunicazione riservata</td>
      </tr></table>
    </div>
    <!-- Body -->
    <div style="background:#080808;border:1px solid rgba(255,255,255,.07);border-top:none;padding:36px 32px">
      <h1 style="font-size:24px;font-weight:800;margin:0 0 6px;letter-spacing:-.02em;color:#fff">${title}</h1>
      <div style="width:40px;height:2px;background:${accentColor};margin-bottom:24px"></div>
      <div style="font-size:14px;line-height:1.8;color:#bbb">${content}</div>
      ${ctaUrl ? `<div style="margin:32px 0 8px"><a href="${ctaUrl}" style="display:inline-block;background:${accentColor};color:#000;font-weight:800;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:14px;letter-spacing:.02em">${ctaText}</a></div>` : ''}
    </div>
    <!-- Footer -->
    <div style="background:#030303;border:1px solid rgba(255,255,255,.07);border-top:none;border-radius:0 0 16px 16px;padding:18px 32px">
      <p style="margin:0 0 4px;font-size:10px;letter-spacing:.08em;color:#333;text-transform:uppercase">Silentio agimus.</p>
      <p style="margin:0;font-size:11px;color:#444">© 2026 Voltra Solutions · <a href="mailto:${support}" style="color:#555;text-decoration:none">${support}</a></p>
    </div>
  </div>
</body></html>`

// ── Promozione approvata ──
export async function sendPromoApprovedEmail(email, { name, programName, accountSize, brokerLogin }) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const content = `
    <p>Soldato <strong style="color:#fff">${name}</strong>,</p>
    <p>la Sua richiesta di promozione è stata approvata dal Comando.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:24px 0;border-radius:10px;overflow:hidden;border:1px solid rgba(180,255,57,.2)">
      <tr style="background:rgba(180,255,57,.06)">
        <td style="padding:12px 16px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.08em;width:40%">Programma</td>
        <td style="padding:12px 16px;font-weight:700;color:#fff">${programName}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid rgba(255,255,255,.05)">Dotazione</td>
        <td style="padding:12px 16px;font-weight:700;color:#B4FF39;border-top:1px solid rgba(255,255,255,.05)">$${Number(accountSize).toLocaleString()}</td>
      </tr>
      ${brokerLogin && brokerLogin !== 'DA ASSEGNARE' ? `
      <tr>
        <td style="padding:12px 16px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid rgba(255,255,255,.05)">Login broker</td>
        <td style="padding:12px 16px;font-family:monospace;font-weight:700;color:#fff;border-top:1px solid rgba(255,255,255,.05)">${brokerLogin}</td>
      </tr>` : ''}
    </table>
    <p>La missione è ora attiva. Acceda al Quartier Generale per monitorare l'avanzamento.</p>
    <p style="margin-top:24px"><strong style="color:#fff">Il Comando</strong><br><span style="color:#555">Voltra</span></p>`
  const html = premiumTemplate('Promozione approvata', content, 'https://voltrasolutions.com/dashboard', 'Accedi al Quartier Generale', support, '#B4FF39')
  try {
    await resend.emails.send({ from, to: email, subject: `✅ Promozione approvata — ${programName}`, html, replyTo: support })
  } catch (e) { console.error('[email] promoApproved failed:', e.message) }
}

// ── Promozione rifiutata ──
export async function sendPromoRejectedEmail(email, { name, programName, reason }) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const content = `
    <p>Soldato <strong style="color:#fff">${name}</strong>,</p>
    <p>la Sua richiesta di promozione al programma <strong style="color:#fff">${programName}</strong> non è stata approvata dal Comando.</p>
    <div style="margin:24px 0;padding:20px;background:rgba(255,71,87,.06);border:1px solid rgba(255,71,87,.2);border-radius:10px;border-left:3px solid #ff4757">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Motivo del Comando</div>
      <div style="font-size:14px;color:#ccc;line-height:1.6">${reason || 'Non specificato'}</div>
    </div>
    <p>Può presentare una nuova richiesta non appena soddisfatti i requisiti indicati. Per chiarimenti contatti il supporto.</p>
    <p style="margin-top:24px"><strong style="color:#fff">Il Comando</strong><br><span style="color:#555">Voltra</span></p>`
  const html = premiumTemplate('Promozione non approvata', content, 'https://voltrasolutions.com/dashboard', 'Torna al Quartier Generale', support, '#ff4757')
  try {
    await resend.emails.send({ from, to: email, subject: `Esito promozione — ${programName}`, html, replyTo: support })
  } catch (e) { console.error('[email] promoRejected failed:', e.message) }
}

// ── Rimborso approvato ──
export async function sendPayoutApprovedEmail(email, { name, amount, wallet }) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const content = `
    <p>Soldato <strong style="color:#fff">${name}</strong>,</p>
    <p>il Suo rimborso missione è stato elaborato e approvato dal Comando.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:24px 0;border-radius:10px;overflow:hidden;border:1px solid rgba(232,200,74,.2)">
      <tr style="background:rgba(232,200,74,.06)">
        <td style="padding:12px 16px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.08em;width:40%">Importo</td>
        <td style="padding:12px 16px;font-weight:800;color:#E8C84A;font-size:18px">$${Number(amount).toLocaleString()}</td>
      </tr>
      ${wallet ? `
      <tr>
        <td style="padding:12px 16px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid rgba(255,255,255,.05)">Wallet</td>
        <td style="padding:12px 16px;font-family:monospace;font-size:12px;color:#ccc;word-break:break-all;border-top:1px solid rgba(255,255,255,.05)">${wallet}</td>
      </tr>` : ''}
    </table>
    <p>I fondi sono stati inviati al wallet indicato. I tempi di accredito dipendono dalla rete blockchain.</p>
    <p style="margin-top:24px"><strong style="color:#fff">Il Comando</strong><br><span style="color:#555">Voltra</span></p>`
  const html = premiumTemplate('Rimborso approvato', content, 'https://voltrasolutions.com/dashboard', 'Accedi al Quartier Generale', support, '#E8C84A')
  try {
    await resend.emails.send({ from, to: email, subject: `💰 Rimborso approvato — $${Number(amount).toLocaleString()}`, html, replyTo: support })
  } catch (e) { console.error('[email] payoutApproved failed:', e.message) }
}

// ── Missione compiuta ──
export async function sendMissionPassedEmail(email, { name, programName, accountSize }) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const content = `
    <p>Soldato <strong style="color:#fff">${name}</strong>,</p>
    <p>la missione <strong style="color:#fff">${programName}</strong> è stata completata con successo.</p>
    <div style="margin:24px 0;padding:20px;background:rgba(180,255,57,.05);border:1px solid rgba(180,255,57,.2);border-radius:10px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">🏅</div>
      <div style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.1em">Obiettivo raggiunto</div>
      <div style="font-size:24px;font-weight:800;color:#B4FF39;margin-top:4px">$${Number(accountSize).toLocaleString()}</div>
    </div>
    <p>Il Comando ha registrato la chiusura della missione. Il rimborso sarà elaborato e comunicato a breve.</p>
    <p>Può presentare una nuova richiesta di promozione non appena il rimborso è stato accreditato.</p>
    <p style="margin-top:24px"><strong style="color:#fff">Il Comando</strong><br><span style="color:#555">Voltra</span></p>`
  const html = premiumTemplate('Missione compiuta', content, 'https://voltrasolutions.com/dashboard', 'Accedi al Quartier Generale', support, '#B4FF39')
  try {
    await resend.emails.send({ from, to: email, subject: `🏅 Missione compiuta — ${programName}`, html, replyTo: support })
  } catch (e) { console.error('[email] missionPassed failed:', e.message) }
}

// ── Missione fallita ──
export async function sendMissionFailedEmail(email, { name, programName }) {
  if (!resend) return
  const { from, support } = await getEmailConfig()
  const content = `
    <p>Soldato <strong style="color:#fff">${name}</strong>,</p>
    <p>la missione <strong style="color:#fff">${programName}</strong> si è conclusa senza il raggiungimento dell'obiettivo.</p>
    <p>Il Comando ha registrato la chiusura della missione. Non è previsto rimborso per questa operazione.</p>
    <div style="margin:24px 0;padding:16px 20px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px">
      <div style="font-size:13px;color:#888;margin-bottom:8px">Prossimi passi</div>
      <ul style="margin:0;padding:0 0 0 18px;font-size:14px;color:#ccc;line-height:2">
        <li>Analizzare le cause dell'insuccesso</li>
        <li>Richiedere supporto alla Linea Diretta HQ se necessario</li>
        <li>Presentare una nuova richiesta di promozione quando pronto</li>
      </ul>
    </div>
    <p style="margin-top:24px"><strong style="color:#fff">Il Comando</strong><br><span style="color:#555">Voltra</span></p>`
  const html = premiumTemplate('Missione conclusa', content, 'https://voltrasolutions.com/dashboard', 'Torna al Quartier Generale', support, '#ff4757')
  try {
    await resend.emails.send({ from, to: email, subject: `Missione conclusa — ${programName}`, html, replyTo: support })
  } catch (e) { console.error('[email] missionFailed failed:', e.message) }
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

export async function sendTicketEmail({ user, category, subject, message }) {
  if (!resend) { console.warn('[email] RESEND_API_KEY missing'); return }
  const { from, support } = await getEmailConfig()
  const catLabel = { pagamento: 'Pagamento', tecnico: 'Tecnico', onorificenze: 'Onorificenze', grado: 'Grado', altro: 'Altro' }
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#000;font-family:Arial,sans-serif;color:#f0f0f0">
    <div style="max-width:560px;margin:40px auto;background:#0a0a0a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px">
      <h1 style="margin:0 0 8px;color:#B4FF39;font-size:18px">🎖 Nuovo Ticket Supporto</h1>
      <p style="color:#555;font-size:12px;margin:0 0 20px;text-transform:uppercase;letter-spacing:0.08em">${catLabel[category] || category}</p>
      <table style="width:100%;font-size:14px;line-height:1.8;margin-bottom:20px">
        <tr><td style="color:#888;width:110px">Membro:</td><td><strong>${user.name}</strong></td></tr>
        <tr><td style="color:#888">Email:</td><td><a href="mailto:${user.email}" style="color:#B4FF39">${user.email}</a></td></tr>
        <tr><td style="color:#888">Matricola:</td><td>${user.matricola || 'N/D'}</td></tr>
        <tr><td style="color:#888">Categoria:</td><td>${catLabel[category] || category}</td></tr>
        <tr><td style="color:#888">Oggetto:</td><td><strong>${subject}</strong></td></tr>
      </table>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:20px 0">
      <div style="white-space:pre-wrap;line-height:1.6;color:#cccccc;font-size:14px">${message}</div>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:20px 0">
      <p style="font-size:11px;color:#555;margin:0">Rispondi direttamente a questa email — il membro riceverà la risposta su ${user.email}</p>
    </div></body></html>`
  try {
    await resend.emails.send({
      from, to: support, replyTo: user.email,
      subject: `[Ticket ${catLabel[category]?.toUpperCase()}] ${subject}`,
      html,
    })
  } catch (e) { console.error('[email] ticket failed:', e.message) }
}
