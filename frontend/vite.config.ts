import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { mockDetection } from './mock/detection'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const mock = env.VITE_USE_MOCK === '1'
  return {
    plugins: [react(), ...(mock ? [mockDetection(env.VITE_MOCK_SCENARIO || 'success')] : [])],
    server: { proxy: mock ? undefined : { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8080', changeOrigin: true } } },
  }
})
