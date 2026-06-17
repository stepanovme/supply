import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig({
  base: '/vk-mini/',
  plugins: [
    vue(),
  ],
  server: {
    host: '192.168.88.2',
    port: 5188,
    https: {
      key: fs.readFileSync(path.resolve(process.cwd(), 'key.pem')),
      cert: fs.readFileSync(path.resolve(process.cwd(), 'cert.pem')),
    },
    cors: true,
    proxy: {
      '/api': {
        target: 'http://192.168.88.2:8382',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/apisup': {
        target: 'http://192.168.88.2:8384',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/apiref': {
        target: 'http://192.168.88.2:8388',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/ws': {
        target: 'ws://192.168.88.2:8083',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '192.168.88.2',
    port: 5188,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
