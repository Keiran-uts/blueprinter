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
    watch: {
      // The preview launcher runs Vite from a Windows 8.3 short path, which
      // crashes libuv's native fs-event watcher (path prefix mismatch).
      // Polling sidesteps the native watcher entirely.
      usePolling: true,
      interval: 200,
    },
  },
})
