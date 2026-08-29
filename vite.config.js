import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Makes asset paths relative so the site works on any sub-path (GitHub Pages, Netlify, etc.)
});

