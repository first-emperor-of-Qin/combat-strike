import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    deps: {
      // node:sqlite 等内置模块交由 Node 处理，不做包解析
      external: [/^node:/],
    },
  },
});
