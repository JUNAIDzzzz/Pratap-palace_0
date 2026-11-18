import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const serverEnvFile = new URL('../server/.env', import.meta.url);

function readBackendPort() {
  if (process.env.PORT) return process.env.PORT;
  try {
    return parseEnv(readFileSync(serverEnvFile, 'utf8')).PORT || 5000;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return 5000;
  }
}

export default defineConfig(() => {
  const port = readBackendPort();

  return {
    plugins: [react(), tailwindcss()],
    server: { proxy: { '/api': `http://127.0.0.1:${port}` } },
  };
});
