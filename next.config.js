/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: {
    appIsrStatus: false  // 禁用开发指示器
  },
  // 确保启用了实验性功能
  experimental: {
    // 如果使用 Turbopack
    turbo: {
      // 解决字体加载问题
      resolveAlias: {
        '@vercel/turbopack-next/internal/font/google/font': require.resolve('next/dist/compiled/@next/font/google')
      }
    }
  },
  // 添加这个配置禁用ESLint检查
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig 