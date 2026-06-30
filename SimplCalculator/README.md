# Simpl Calculator

**Calculators that explain results.** An AI-powered calculation platform — not just another calculator site. Every calculator takes you from **input → output → visualization → AI insight → scenarios → decision**.

Built with **Astro 6**, **Tailwind CSS v4**, **TypeScript**, **ECharts**, and **OpenRouter** (DeepSeek primary, Gemini fallback).

## What makes it different

| Traditional calculators | Simpl Calculator |
|---|---|
| Input → Output | Input → Output → Charts → AI Insights → Scenarios → Reports |
| One static page each | Data-driven framework scaling to 1000+ calculators |
| No explanation | AI insights, formula breakdowns, guides, FAQs |

## Architecture (scales to 1000+ calculators)

Four strictly separated layers — adding a calculator is "add a logic module + an MDX file," never "build a page":

1. **Pure calculation logic** — `src/lib/calculators/<slug>.ts`. One typed pure `compute(inputs) => result` per calculator. No DOM, no IO — fully unit-testable.
2. **Zod schemas + registry** — `src/lib/calculators/registry.ts`. Each calculator is one `CalculatorDefinition` whose `fields` drive form generation, validation, and AI payloads.
3. **Content (prose only)** — Astro Content Layer (`src/content.config.ts`) over MDX in `src/content/calculators/`. Editorial/SEO content; never calculation logic.
4. **Generic templates** — `src/pages/calculators/[category]/[slug].astro` renders every calculator from the registry + content.

Only the active calculator's math is shipped to the client (`src/lib/calculators/client.ts` code-splits per slug). ECharts is tree-shaken and lazy-loaded.

## Calculators included

EMI · SIP · Compound Interest · BMI · Percentage · Age — across Finance, Health, Math, and Utilities. Plus the full category taxonomy and curated calculator chains.

## Getting started

```sh
npm install
npm run dev        # http://localhost:4321
```

### Enable AI features (optional)

The site works fully without AI — AI sections degrade gracefully. To turn them on:

```sh
cp .env.example .env
# add your OpenRouter key (https://openrouter.ai/keys) to OPENROUTER_API_KEY
```

## Commands

| Command | Action |
|---|---|
| `npm run dev` | Dev server with HMR + API routes |
| `npm run build` | Static build + Node server bundle for `/api/*` |
| `node ./dist/server/entry.mjs` | Run the production server (Node adapter) |
| `npm test` | Run the calculator math unit tests (Vitest) |

## Tech & deployment

- **Rendering**: static-by-default (SEO/perf) with on-demand server endpoints for AI (`export const prerender = false`), served by `@astrojs/node` (standalone).
- **Design**: a Vercel-inspired system defined in `DESIGN.md`, mapped token-for-token into Tailwind v4 `@theme` in `src/styles/global.css`, with a derived dark palette.
- **Theme**: system / light / dark, persisted, no flash of unstyled content.
- **SEO**: per-calculator JSON-LD (`WebApplication`, `FAQPage`, `BreadcrumbList`), OpenGraph/Twitter meta, sitemap, robots.
