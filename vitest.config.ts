import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    pool: 'forks',
    env: {
      TZ: 'Asia/Riyadh',
      NEXT_PUBLIC_USE_DISPATCHLESS: 'true',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/actions/**', 'src/lib/**', 'src/stores/**', 'src/components/AssignmentAckBanner.tsx', 'src/components/DriverReturnSheet.tsx', 'src/components/DriverSettingsForm.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/lib/prisma.ts',
        'src/lib/rate-limit.ts',
        'src/lib/notify.ts',
        'prisma/**',
        'scripts/**',
        '.next/**',
        '.serwist/**',
      ],
    },
  },
});
