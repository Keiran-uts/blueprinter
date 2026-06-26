import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allow serving files regardless of how the root path was resolved
      // (the preview launcher may use a Windows 8.3 short path).
      strict: false,
      allow: ['..', '.'],
    },
  },
})
