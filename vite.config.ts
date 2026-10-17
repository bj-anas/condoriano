/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// `base: './'` keeps every URL relative, so the build works at any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [vue()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
