/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
  server: { port: 5178, strictPort: true },
  preview: { port: 5179, strictPort: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
});
