/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// The extension has five entry points: the background service worker and
// four pages. Vite builds them as one project so they share code.
export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Extensions load from disk; there's nothing to gain from preloading,
    // and the polyfill would add code to every page.
    modulePreload: { polyfill: false },
    target: 'es2023',
    rolldownOptions: {
      input: {
        background: 'src/background/index.ts',
        popup: 'src/ui/popup/popup.html',
        saved: 'src/ui/saved/saved.html',
        options: 'src/ui/options/options.html',
        suspended: 'src/ui/suspended/suspended.html',
      },
      output: {
        // The manifest refers to the service worker by a fixed name.
        entryFileNames: (chunk) =>
          chunk.name === 'background'
            ? 'background.js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
  },
})
