import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  // GitHub Pages has no server runtime. Cloudflare's normal build keeps route
  // handlers available for the Reading Vision API.
  output: isGitHubPages ? 'export' : undefined,
  trailingSlash: true,
  basePath: isGitHubPages ? '/ielts7-plus' : '',
  assetPrefix: isGitHubPages ? '/ielts7-plus/' : undefined,
};

export default nextConfig;
