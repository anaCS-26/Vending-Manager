import { Prisma, PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    // Driver.pin is a bcrypt hash of a 4-digit PIN — brute-forceable offline in
    // seconds. Several actions `include: { driver: true }` and hand the result to
    // client components, which serialises it into the RSC payload. Omitting it at
    // the client level makes leaking it opt-in rather than opt-out.
    //
    // The two places that legitimately need the hash (credential login in
    // `src/auth.ts` and the current-PIN check in `changeDriverPin`) re-enable it
    // per-query with `omit: { pin: false }`.
    omit: {
      driver: { pin: true },
    },
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
