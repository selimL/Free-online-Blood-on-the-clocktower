import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const here = import.meta.dirname; // the client folder (Node 20.11+)

export default defineConfig({
  root: here,
  plugins: [react()],
  build: {
    outDir: path.resolve(here, '../dist'),
    emptyOutDir: true,
    // the main bundle includes the voice library and the 3D engine is loaded on demand; both are
    // large by nature but compress to ~300 KB / ~150 KB, so only warn above 1.2 MB
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': 'http://localhost:3001',
    },
  },
});
