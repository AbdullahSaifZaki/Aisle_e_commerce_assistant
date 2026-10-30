import { defineConfig, loadEnv } from 'vite';

const proxy = {
  '^/api/': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    rewrite: path => path.replace(/^\/api/, ''),
  },
};

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (command === 'build' && !env.VITE_API_URL?.startsWith('https://')) {
    throw new Error('Set VITE_API_URL to your deployed HTTPS backend /chat URL before building.');
  }
  return { server: { proxy }, preview: { proxy } };
});
