import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['sql.js', 'node:sqlite', /^node:/],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'preload.cjs' } } },
        },
      },
    }),
  ],
  root: '.',
  build: {
    outDir: 'dist',
  },
});
