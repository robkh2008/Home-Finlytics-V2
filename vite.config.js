import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext',
    modulePreload: false,
    copyPublicDir: true,
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
});