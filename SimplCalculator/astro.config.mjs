// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://simplcalculator.com',
  // Static by default for SEO/perf; individual API routes opt into SSR via
  // `export const prerender = false` and are served by the Node adapter.
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
