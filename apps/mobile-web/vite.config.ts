import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const gatewayTarget = process.env.VITE_GATEWAY_URL ?? 'http://127.0.0.1:3101'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    proxy: {
      '/api': gatewayTarget,
      '/healthz': gatewayTarget,
    },
  },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
})
