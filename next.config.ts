import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: isGitHubPages ? '/ielts7-plus' : '',
  assetPrefix: isGitHubPages ? '/ielts7-plus/' : undefined,
};

export default nextConfig;
