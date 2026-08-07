import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/path2plot/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/core/**/*.test.ts'],
  },
})
