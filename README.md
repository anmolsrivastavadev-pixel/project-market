# Project Market

A clean market for launching and discovering projects — submit a project, get a card with its website logo, and appear in the weekly rankings.

**Live:** https://project-market-app.netlify.app

![Project Market](marketing/product-market.png)

## Features

- Launch video on the homepage
- Persistent project submissions (Netlify Blobs; Cloudflare KV adapter also included)
- Automatic project logos pulled from each project's website
- Market index card view and weekly ranking table
- Static pages: About, Methods, Badge, Privacy

## Structure

```
public/           static site (HTML, CSS, JS, fonts, images, media)
worker/api.js            API handlers for project submissions and logos (platform-agnostic)
netlify/functions/api.mjs Netlify Function: /api/* on Netlify Blobs
netlify.toml             Netlify deploy config
worker/index.js          Cloudflare Worker alternative: /api/* on KV, video range requests
wrangler.toml            Cloudflare deploy config
marketing/       launch video and product screenshot
```

## Deploy

Netlify (primary):

```bash
npm install
npx netlify-cli login
npx netlify-cli deploy --prod --dir public --functions netlify/functions
```

Cloudflare (alternative):

```bash
npx wrangler login
npx wrangler deploy
```

Both run on free plans with no payment method needed.

## Marketing

[`marketing/project-market-launch.mp4`](marketing/project-market-launch.mp4) — 16s, 1080p launch video.
