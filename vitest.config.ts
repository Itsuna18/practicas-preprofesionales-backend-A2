import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'
import 'dotenv/config'

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    env: {
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://practicas:practicas@localhost:5432/practicas?schema=public',
      JWT_SECRET: process.env.JWT_SECRET || 'ci-secret',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/**/*.module.ts'],
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
})
