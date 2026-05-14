import { prisma } from './prisma.js'

const cache = new Map()
const TTL = 60 * 1000

export async function getSetting(key, fallback = '') {
  const c = cache.get(key)
  if (c && Date.now() - c.t < TTL) return c.v
  const s = await prisma.setting.findUnique({ where: { key } })
  const v = s?.value ?? fallback
  cache.set(key, { v, t: Date.now() })
  return v
}

export async function setSetting(key, value, isPublic = false) {
  const s = await prisma.setting.upsert({
    where: { key },
    update: { value, isPublic },
    create: { key, value, isPublic },
  })
  cache.delete(key)
  return s
}

export async function getPublicSettings() {
  const all = await prisma.setting.findMany({ where: { isPublic: true } })
  return all.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {})
}

export async function getAllSettings() {
  return prisma.setting.findMany({ orderBy: { key: 'asc' } })
}
