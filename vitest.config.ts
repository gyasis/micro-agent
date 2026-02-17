import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      '@agents': path.resolve(__dirname, './src/agents'),
      '@lifecycle': path.resolve(__dirname, './src/lifecycle'),
      '@memory': path.resolve(__dirname, './src/memory'),
      '@parsers': path.resolve(__dirname, './src/parsers'),
      '@llm': path.resolve(__dirname, './src/llm'),
      '@config': path.resolve(__dirname, './src/config'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
});
