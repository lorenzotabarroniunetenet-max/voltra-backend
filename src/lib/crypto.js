import crypto from 'crypto'
const ALGO = 'aes-256-gcm'
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || '0'.repeat(64), 'hex')
export function encrypt(plain) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv(ALGO, KEY, iv)
  const enc = Buffer.concat([c.update(plain,'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
}
export function decrypt(b64) {
  const d = Buffer.from(b64,'base64')
  const dc = crypto.createDecipheriv(ALGO, KEY, d.subarray(0,12))
  dc.setAuthTag(d.subarray(12,28))
  return Buffer.concat([dc.update(d.subarray(28)), dc.final()]).toString('utf8')
}
