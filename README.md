# IELTS7+

A theme-driven, local-first personal IELTS learning system for moving from B1 toward IELTS 7.0.

## Learning flow

Reading → Listening → Speaking → Writing → Review

## Features

- Daily Theme and daily training plan
- Reading knowledge extraction
- Listening, speaking, and writing training
- Vocabulary Bank and mistake tracking
- FSRS review workflow
- Learning-progress K-line chart
- Learning Supervisor / 先生
- Local JSON data backup and restore

## No account required

IELTS7+ has no user registration or login. Learning data stays in the browser's local storage, so the core system works immediately after opening the site.

## Installation

```bash
pnpm install
pnpm dev
```

### Windows 快捷启动

双击项目根目录的 `启动本地网站.bat`，然后在浏览器打开
`http://localhost:3000`。本地网址会继续使用这台电脑此前保存的
学习时间、任务与 K 线记录。

## Build

```bash
pnpm build
```

## Deployment

The public site is deployed with GitHub Pages:

https://ccbunnyggf.github.io/ielts7-plus/

Every push to `main` runs the GitHub Pages workflow automatically. See
[deployment skills and runbook](docs/deployment-skills.md) for the exact
tools, configuration, validation steps, and troubleshooting notes.

## Optional Cloudflare Workers deployment

This project uses the Cloudflare Vite plugin and deploys as a Cloudflare Worker
with static assets. After logging in to Cloudflare with Wrangler, run:

```bash
pnpm run deploy
```

The command builds the application first and then deploys the generated Worker.
Do not configure this project as a standard Next.js site on Netlify.

## Data backup

Use **Settings → Export Data** to download a JSON backup, and **Import Data** to restore it in another browser or after clearing local data.

## AI features

The core learning system does not need an API key. Future optional AI capabilities can be connected through environment variables. Copy `.env.example` to `.env.local` and provide your own key:

```bash
OPENAI_API_KEY=
```

Never commit real keys or exported personal learning data.

## License

[MIT](LICENSE) © 2026 ccbunnyggf
