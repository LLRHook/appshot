# Appshot

Local-first App Store screenshot generator. Upload raw app screenshots, pick a template, customize colors and layout, export pixel-perfect PNGs at exact App Store dimensions.

## Quick Start

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173` — pick a template, upload a screenshot, customize, and preview in real-time.

### Exporting PNGs

Export requires a local Chrome instance with remote debugging:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

Then click "Export" in the editor to render at exact device dimensions.

## Templates

Templates live in `app/static/templates/{id}/`. Each template is a self-contained HTML/CSS file that reads URL query params to configure itself.

### Adding a Template

1. Create `app/static/templates/{your-id}/index.html` — HTML/CSS that reads params from `URLSearchParams`
2. Create `app/static/templates/{your-id}/schema.json` — param definitions
3. Add the template to the `TEMPLATES` array in `app/src/lib/templates.ts`

Param types: `text`, `enum`, `color`, `number`, `image`.

### Built-in Templates

| Template | Description |
|----------|-------------|
| `gradient-bezel` | Warm-to-cool gradient background with dark device bezel and Dynamic Island |
| `clean-flat` | Solid color background, no device frame, rounded screenshot with shadow |
| `dark-minimal` | Near-black background with white text and thin device outline |

## Device Sizes

| Device | Dimensions |
|--------|------------|
| iPhone 6.9" | 1320 x 2868 |
| iPhone 6.7" | 1284 x 2778 |
| iPhone 6.5" | 1242 x 2688 |
| iPad 13" | 2064 x 2752 |

## Tech Stack

- **SvelteKit** + **Svelte 5** (runes)
- **Tailwind CSS v4**
- **TypeScript**
- **chrome-remote-interface** (CDP) for server-side PNG export
- **client-zip** for multi-size zip downloads
- **Claude API** (optional) for AI headlines and style matching

## AI Features

Both AI endpoints check for `ANTHROPIC_API_KEY` in the environment. Without it, they return mock data.

- **AI Headlines**: Generate marketing copy from an app description
- **Style Match**: Upload a competitor screenshot to extract visual style params

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run check        # TypeScript + Svelte type checking
npm run test         # Run unit tests (Vitest)
npm run test:watch   # Run tests in watch mode
```
