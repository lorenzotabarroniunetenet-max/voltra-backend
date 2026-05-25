import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/middleware.js'

const r = Router()

// ── GET /api/certificato/pdf — genera PDF certificato per il membro loggato ──
r.get('/pdf', requireAuth, async (req, res) => {
  try {
    // Admin può richiedere il certificato di qualsiasi utente
    const targetId = (req.user.role === 'ADMIN' && req.query.userId)
      ? req.query.userId
      : req.user.id

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        name: true, rank: true, matricola: true, memberNumber: true,
        enrolledAt: true, approvedAt: true, membershipTxHash: true, membershipTokenId: true,
        oathDone: true,
      },
    })
    if (!user) return res.status(404).json({ error: 'not found' })

    const PDFDocument = (await import('pdfkit')).default
    const QRCode = await import('qrcode')

    const doc = new PDFDocument({ size: 'A4', margin: 0 })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="voltra-certificato-${user.matricola || 'membro'}.pdf"`)
    doc.pipe(res)

    const W = 595.28, H = 841.89
    const LIME = '#B4FF39'
    const GOLD = '#E8C84A'

    // ── SFONDO NERO ──
    doc.rect(0, 0, W, H).fill('#000000')

    // ── HEADER BAND ──
    doc.rect(0, 0, W, 180).fill('#050505')

    // Linea lime in cima
    doc.moveTo(60, 4).lineTo(W - 60, 4).lineWidth(1).stroke(LIME)

    // VOLTRA logo
    doc.fontSize(11).font('Helvetica-Bold')
      .fillColor(LIME).text('VOLTRA', 54, 28)

    doc.fontSize(7).font('Helvetica')
      .fillColor('rgba(180,255,57,0.5)')
      .text('CLUB PRIVATO · DOCUMENTO UFFICIALE', 54, 44, { characterSpacing: 2 })

    // Classificato badge
    doc.roundedRect(W - 156, 26, 100, 20, 3)
      .strokeColor('rgba(255,255,255,0.15)').lineWidth(1).stroke()
    doc.fontSize(7).font('Helvetica')
      .fillColor('rgba(255,255,255,0.3)').text('DOC. RISERVATO', W - 150, 32, { characterSpacing: 1 })

    // Tipo certificato
    doc.fontSize(8).font('Helvetica-Bold')
      .fillColor('rgba(180,255,57,0.7)')
      .text('CERTIFICATO DI ARRUOLAMENTO', 54, 80, { characterSpacing: 2 })

    // Nome membro
    doc.fontSize(32).font('Helvetica-Bold')
      .fillColor('#FFFFFF').text(user.name || 'Membro', 54, 100)

    // Grado
    doc.fontSize(10).font('Helvetica')
      .fillColor('rgba(255,255,255,0.4)')
      .text((user.rank || 'Caporale').toUpperCase(), 54, 142, { characterSpacing: 2 })

    // Linea separatrice
    doc.moveTo(54, 168).lineTo(W - 54, 168).lineWidth(0.5)
      .stroke('rgba(255,255,255,0.08)')

    // ── BODY ──
    const bodyY = 196
    const enrollDate = (user.enrolledAt || user.approvedAt)
      ? new Date(user.enrolledAt || user.approvedAt).toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'data non disponibile'

    doc.fontSize(11).font('Helvetica')
      .fillColor('rgba(255,255,255,0.55)')
      .text(
        `Il presente certificato attesta che ${user.name} ha prestato giuramento davanti al Comando Voltra in data ${enrollDate} ed e membro a tutti gli effetti del club privato, con il grado di ${user.rank || 'Caporale'}. Il suo arruolamento e registrato in modo permanente sulla blockchain Polygon e non puo essere alterato o cancellato.`,
        54, bodyY, { width: 360, lineGap: 4 }
      )

    // ── DATI GRID ──
    const gridY = bodyY + 100
    const enrolledDate = user.enrolledAt || user.approvedAt
    const cells = [
      { label: 'MATRICOLA', value: user.matricola || 'N/A' },
      { label: 'MEMBRO N.', value: user.memberNumber ? `#${String(user.memberNumber).padStart(3, '0')}` : 'N/A' },
      { label: 'GRADO', value: user.rank || 'Caporale' },
      { label: 'ARRUOLATO IL', value: enrolledDate ? new Date(enrolledDate).toLocaleDateString('it-IT') : 'N/A' },
    ]

    cells.forEach((cell, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = 54 + col * 240
      const y = gridY + row * 60

      doc.roundedRect(x, y, 220, 48, 3)
        .fillColor('#0a0a0a').fill()
      doc.roundedRect(x, y, 220, 48, 3)
        .strokeColor('rgba(255,255,255,0.07)').lineWidth(0.5).stroke()
      doc.rect(x, y, 3, 48).fillColor(LIME).fill()

      doc.fontSize(7).font('Helvetica')
        .fillColor('rgba(255,255,255,0.3)')
        .text(cell.label, x + 12, y + 10, { characterSpacing: 1.5 })

      doc.fontSize(13).font('Helvetica-Bold')
        .fillColor(cell.label === 'MEMBRO N.' ? LIME : '#FFFFFF')
        .text(cell.value, x + 12, y + 24)
    })

    // ── BLOCKCHAIN SECTION ──
    const chainY = gridY + 140

    doc.moveTo(54, chainY).lineTo(W - 54, chainY).lineWidth(0.5)
      .stroke('rgba(255,255,255,0.06)')

    if (user.membershipTxHash) {
      doc.fontSize(7).font('Helvetica-Bold')
        .fillColor('rgba(180,255,57,0.6)')
        .text('CERTIFICAZIONE BLOCKCHAIN', 54, chainY + 14, { characterSpacing: 2 })

      doc.fontSize(7).font('Helvetica')
        .fillColor('rgba(255,255,255,0.2)').text('Rete:', 54, chainY + 30)
      doc.fillColor('rgba(130,71,229,0.8)').text('Polygon PoS Mainnet', 90, chainY + 30)

      doc.fillColor('rgba(255,255,255,0.2)').text('Token ID:', 54, chainY + 44)
      doc.fillColor(LIME).text(`#${user.membershipTokenId || 'N/A'}`, 100, chainY + 44)

      doc.fillColor('rgba(255,255,255,0.2)').text('TX Hash:', 54, chainY + 58)
      doc.fillColor('rgba(255,255,255,0.45)').fontSize(6)
        .text(user.membershipTxHash, 96, chainY + 60, { width: 300 })

      doc.fontSize(7).font('Helvetica').fillColor(LIME)
        .text('Verifica su Polygonscan ->', 54, chainY + 78)
    }

    // ── QR CODE ──
    const verifyUrl = `https://voltrasolutions.com/verifica/${user.matricola || user.memberNumber}`
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 100, margin: 1,
        color: { dark: '#000000', light: '#B4FF39' },
      })
      const qrBase64 = qrDataUrl.replace('data:image/png;base64,', '')
      const qrBuf = Buffer.from(qrBase64, 'base64')
      const qrX = W - 54 - 100, qrY2 = chainY + 14

      doc.roundedRect(qrX - 8, qrY2 - 8, 116, 116, 6)
        .fillColor('#050505').fill()
      doc.roundedRect(qrX - 8, qrY2 - 8, 116, 116, 6)
        .strokeColor(LIME).lineWidth(1).stroke()
      doc.image(qrBuf, qrX, qrY2, { width: 100, height: 100 })

      doc.fontSize(6).font('Helvetica').fillColor('rgba(180,255,57,0.5)')
        .text('Scansiona per verificare', qrX - 8, qrY2 + 108, { width: 116, align: 'center' })
    } catch (e) { console.error('[cert] QR error:', e.message) }

    // ── FIRMA ──
    const sigY = H - 140

    doc.moveTo(54, sigY).lineTo(W - 54, sigY).lineWidth(0.5)
      .stroke('rgba(255,255,255,0.06)')

    doc.fontSize(7).font('Helvetica').fillColor('rgba(255,255,255,0.2)')
      .text('FIRMA DEL MEMBRO', 54, sigY + 14, { characterSpacing: 1.5 })

    doc.moveTo(54, sigY + 50).lineTo(220, sigY + 50).lineWidth(0.5)
      .stroke('rgba(255,255,255,0.12)')

    doc.fontSize(14).font('Helvetica-Oblique').fillColor('rgba(255,255,255,0.4)')
      .text(user.name, 54, sigY + 28)

    // Sigillo
    doc.fontSize(7).font('Helvetica').fillColor('rgba(255,255,255,0.2)')
      .text('IL COMANDO VOLTRA', W - 200, sigY + 14, { characterSpacing: 1.5 })
    doc.circle(W - 120, sigY + 40, 30)
      .strokeColor('rgba(180,255,57,0.3)').lineWidth(1).stroke()
    doc.circle(W - 120, sigY + 40, 24)
      .strokeColor('rgba(180,255,57,0.15)').lineWidth(0.5).stroke()
    doc.fontSize(14).font('Helvetica-Bold').fillColor(LIME)
      .text('V', W - 126, sigY + 32)

    // ── FOOTER ──
    doc.rect(0, H - 36, W, 36).fill('#050505')
    doc.moveTo(60, H - 36).lineTo(W - 60, H - 36).lineWidth(0.5)
      .stroke('rgba(180,255,57,0.3)')

    doc.fontSize(7).font('Helvetica').fillColor('rgba(255,255,255,0.15)')
      .text('SILENTIO AGIMUS', 54, H - 23, { characterSpacing: 3 })
    doc.fillColor('rgba(255,255,255,0.15)')
      .text(`(c) ${new Date().getFullYear()} VOLTRA SOLUTIONS · voltrasolutions.com`, W / 2 - 100, H - 23)
    doc.fillColor('rgba(180,255,57,0.4)')
      .text('DOCUMENTO UFFICIALE', W - 170, H - 23, { characterSpacing: 1 })

    doc.end()

  } catch (e) {
    console.error('[cert] PDF error:', e)
    if (!res.headersSent) res.status(500).json({ error: e.message })
  }
})

// ── GET /api/certificato/verifica/:matricola — pagina pubblica dati ──
r.get('/verifica/:matricola', async (req, res) => {
  try {
    const { matricola } = req.params
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { matricola: matricola },
          { memberNumber: parseInt(matricola.replace(/\D/g, '')) || -1 },
        ],
        approved: true,
      },
      select: {
        name: true, rank: true, matricola: true, memberNumber: true,
        enrolledAt: true, membershipTxHash: true, membershipTokenId: true,
      },
    })

    if (!user) return res.status(404).json({ found: false, error: 'Matricola non trovata' })

    res.json({
      found: true,
      matricola: user.matricola,
      memberNumber: user.memberNumber,
      rank: user.rank,
      enrolledAt: user.enrolledAt,
      membershipTokenId: user.membershipTokenId,
      membershipTxHash: user.membershipTxHash,
      polygonscanUrl: user.membershipTxHash
        ? `https://polygonscan.com/tx/${user.membershipTxHash}`
        : null,
      contractUrl: `https://polygonscan.com/token/${process.env.MEMBERSHIP_ADDRESS}`,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default r
