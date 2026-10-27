// @ts-ignore -- module Node disponible à la construction (types Node non installés)
import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

// Version exacte affichée dans l'app (Réglages) et publiée dans version.json : identifiant du commit.
const sha = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'local';
  }
})();
const builtAt = new Date().toISOString();

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: sha, builtAt }) });
      },
    },
  ],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(sha),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
