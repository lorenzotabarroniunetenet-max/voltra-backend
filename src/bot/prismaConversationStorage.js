export function prismaConversationStorage(prisma) {
  return {
    type: 'key',
    version: 0,
    async read(key) {
      const row = await prisma.botKvStore.findUnique({ where: { key } })
      return row ? JSON.parse(row.value) : undefined
    },
    async write(key, value) {
      const serialized = JSON.stringify(value)
      await prisma.botKvStore.upsert({
        where: { key },
        create: { key, value: serialized },
        update: { value: serialized },
      })
    },
    async delete(key) {
      await prisma.botKvStore.delete({ where: { key } }).catch(() => {})
    },
  }
}
