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
npm install
npm run dev
```

## Build

```bash
npm run build
```

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
