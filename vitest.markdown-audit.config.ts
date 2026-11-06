import { defineConfig } from 'vitest/config';

// Diagnostic Markdown audit (Cycle 15). Not part of the normal green suite:
// genuine product failures keep this run non-zero. Run explicitly:
//   npm exec -- vitest run --config vitest.markdown-audit.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/markdown-audit/*.audit.ts'],
  },
});
