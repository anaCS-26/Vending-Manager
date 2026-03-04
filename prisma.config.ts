import { defineConfig } from '@prisma/config'

export default defineConfig({
    earlyAccess: true,
    datasource: {
        url: process.env.DATABASE_URL,
        directUrl: process.env.DIRECT_URL,
    },
})
