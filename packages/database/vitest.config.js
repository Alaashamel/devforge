import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    globalSetup: ['./test/global-setup.js'],
    setupFiles: ['./test/setup.js'],
    testTimeout: 30000,
  },
});
