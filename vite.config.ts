import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // MuseAI Bridge on-prem chưa bật CORS -> đi qua proxy cùng origin.
        proxy: {
          '/muse': {
            target: env.MUSE_API_URL || 'http://100.126.145.3:8770',
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/muse/, ''),
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
