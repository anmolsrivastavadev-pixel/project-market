# Project Market

A clean market for launching and discovering projects — submit a project, get a card with its website logo, and appear in the weekly rankings.

**Live:** https://project-market.anmol-srivastava-dev.workers.dev

![Project Market](marketing/product-market.png)

## Features

- Launch video on the homepage
- Persistent project submissions (Cloudflare Workers KV, free tier)
- Automatic project logos pulled from each project's website
- Market index card view and weekly ranking table
- Static pages: About, Methods, Badge, Privacy

## Structure

```
public/           static site (HTML, CSS, JS, fonts, images, media)
worker/index.js   Cloudflare Worker entry: /api/* routes, KV storage, video range requests
worker/api.js     API handlers for project submissions and logos
wrangler.toml     Cloudflare deploy config
marketing/       launch video and product screenshot
```

## Deploy

```bash
npx wrangler login
npx wrangler deploy
```

Runs entirely on Cloudflare's free plan (Workers + static assets + KV); no payment method needed.

## Marketing

[`marketing/project-market-launch.mp4`](marketing/project-market-launch.mp4) — 16s, 1080p launch video.
