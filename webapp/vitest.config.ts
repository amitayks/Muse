import { defineConfig } from 'vitest/config';

// Node-environment unit tests (pure helpers). The app itself is exercised manually in Telegram.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
