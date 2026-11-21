import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  server: { 
    proxy: { '/api': 'http://127.0.0.1:8787' },
    allowedHosts: ['.trycloudflare.com']
},
  test: { include: ['test/**/*.test.ts'] },
})
