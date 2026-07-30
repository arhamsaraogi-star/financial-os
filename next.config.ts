import type { NextConfig } from 'next'

/**
 * Static export for GitHub Pages.
 *
 * When the site is served from https://<user>.github.io/<repo>, every asset and
 * link needs the /<repo> prefix. The deploy workflow sets NEXT_PUBLIC_BASE_PATH
 * from the repository name; locally it stays empty so `next dev` works at /.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
}

export default nextConfig
