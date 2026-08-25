# Website deployment skills & runbook

This document records the deployment skills used for IELTS7+ and the final,
repeatable publishing path.

## Final public deployment

- Repository: `ccbunnyggf/ielts7-plus`
- Hosting: GitHub Pages
- Public URL: <https://ccbunnyggf.github.io/ielts7-plus/>
- Trigger: every push to the `main` branch
- Workflow: `.github/workflows/deploy-pages.yml`

The application is a browser-first product. Its study data is stored in each
visitor's browser `localStorage`, so publishing the static site does not expose
or share any learner's records.

## Skills used

### 1. Package-manager discipline

The project contains `pnpm-lock.yaml`, so installation and CI use pnpm only.

```bash
pnpm install --frozen-lockfile
pnpm build
```

Do not mix `npm install`, `yarn install`, and `pnpm install` in this project:
mixing lockfiles can cause different dependency trees and failed cloud builds.

### 2. Static export for GitHub Pages

GitHub Pages can only host static files. `next.config.ts` therefore enables
Next static export and adds the repository base path during a GitHub Actions
build:

- `output: 'export'`
- `trailingSlash: true`
- `basePath: '/ielts7-plus'` in GitHub Actions
- `assetPrefix: '/ielts7-plus/'` in GitHub Actions

The dedicated command is:

```bash
pnpm run build:pages
```

Its output is the `out/` directory, which contains `index.html`, assets, and
the 404 page required by GitHub Pages.

### 3. Type-safe production builds

Static export performs TypeScript checking. Before publishing, verify both
build paths:

```bash
pnpm run build:pages
pnpm build
```

The first validates the GitHub Pages artifact; the second preserves the
existing Vinext/Cloudflare build path.

### 4. Git and GitHub repository workflow

The source of truth is the `main` branch.

```bash
git status
git add <files>
git commit -m "Describe the change"
git push github main
```

After a push, GitHub Actions automatically rebuilds and redeploys the public
site. Never commit `.env*`, API keys, browser exports, or personal learning
data.

### 5. GitHub Actions deployment

The workflow has two jobs:

1. **build**: checks out code, installs Node 22 and pnpm 10, configures Pages,
   installs locked dependencies, runs `pnpm run build:pages`, and uploads `out/`.
2. **deploy**: publishes that artifact to GitHub Pages.

Required repository setting (one-time):

`Settings → Pages → Build and deployment → Source → GitHub Actions`

Once enabled, workflow status can be checked at:

<https://github.com/ccbunnyggf/ielts7-plus/actions>

### 6. Deployment verification

Use this checklist after every public release:

- The newest **Deploy to GitHub Pages** run is green.
- Its **build** and **deploy** jobs are both successful.
- <https://ccbunnyggf.github.io/ielts7-plus/> loads in a normal browser.
- Navigation, local storage, responsive layout, and static assets still work.

## Troubleshooting history

### GitHub Pages returns 404

If the URL says “There isn't a GitHub Pages site here”, the workflow has not
created the site yet. Check the Actions page. If the workflow fails at
`Configure Pages`, set the Pages source to **GitHub Actions** in repository
settings, then push a new commit or rerun the workflow.

### Cloudflare Workers builds but the URL times out

The previous Worker deployment built successfully, but the free
`*.workers.dev` endpoint timed out from the target network. This is an
external reachability issue, not a local development-server issue. GitHub
Pages is the primary public link for this repository.

### Local development is not public hosting

`localhost:3000` is only a local development server. It does not need to stay
open after a successful GitHub Pages deployment.
