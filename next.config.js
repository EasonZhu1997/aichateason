/** @type {import('next').NextConfig} */
const nextConfig = {
  // 确保启用了实验性功能
  experimental: {
    // 如果使用 Turbopack
    turbo: {
      // 解决字体加载问题
      resolveAlias: {
        '@vercel/turbopack-next/internal/font/google/font': require.resolve('next/dist/compiled/@next/font/google')
      }
    }
  }
}

module.exports = nextConfig 