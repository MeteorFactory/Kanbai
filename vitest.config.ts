import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/index.ts'],
      thresholds: {
        'src/renderer/components/**': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
        },
        resolve: {
          alias: {
            '@shared': path.resolve(__dirname, 'src/shared'),
            '@main': path.resolve(__dirname, 'src/main'),
            '@renderer': path.resolve(__dirname, 'src/renderer'),
          },
        },
      },
      {
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['tests/components/**/*.test.tsx'],
          setupFiles: ['tests/setup.ts', 'tests/components/setup.ts'],
        },
        resolve: {
          alias: {
            '@shared': path.resolve(__dirname, 'src/shared'),
            '@main': path.resolve(__dirname, 'src/main'),
            '@renderer': path.resolve(__dirname, 'src/renderer'),
            'pdfjs-dist': path.resolve(__dirname, 'tests/mocks/pdfjs-dist.ts'),
          },
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
})
