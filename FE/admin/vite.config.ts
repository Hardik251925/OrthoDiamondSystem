import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Admin is served under /admin/ (gateway: /admin/* -> admin/dist). See AGENTS.md "Networking".
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_BACKEND_URL || 'http://localhost:4100';
  return {
    base: '/admin/',
    plugins: [react(), tailwindcss()],
    server: {
      host: true, // listen on LAN too (same-Wi-Fi testing)
      port: 5180,
      strictPort: true,
      allowedHosts: env.NGROK_DOMAIN ? [env.NGROK_DOMAIN] : [],
      proxy: {
        '/api': backend,
        '/uploads': backend,
        '/socket.io': { target: backend, ws: true },
      },
    },
  };
});
