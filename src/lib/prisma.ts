import { Prisma, PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'stdout',
        level: 'error',
      },
      {
        emit: 'stdout',
        level: 'info',
      },
      {
        emit: 'stdout',
        level: 'warn',
      },
    ],
  })

  if (process.env.NODE_ENV !== 'production') {
    // @ts-ignore
    client.$on('query', (e: Prisma.QueryEvent) => {
      console.log(`⏱️  Query Duration: ${e.duration}ms`)
      // console.log(`📡 Query: ${e.query}`) // Option: uncomment this to see the SQL again
    })
  }

  return client
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
