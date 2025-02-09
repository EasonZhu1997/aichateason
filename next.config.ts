import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 禁用开发模式指示器和遥测
  devIndicators: {
    buildActivity: false,
    buildActivityPosition: "bottom-right",
  },
  // 禁用遥测
  telemetry: {
    enabled: false,
  },
  // 禁用路由指示器
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  webpack: (config) => {
    // 禁用 HMR 指示器
    config.entry = async () => {
      const entries = await (typeof config.entry === 'function' ? config.entry() : config.entry);
      if (entries['main.js'] && !entries['main.js'].includes('./client/dev/static-route-indicator')) {
        return entries;
      }
      return entries;
    };
    return config;
  },
  experimental: {
    turbo: {}  // 禁用额外的 turbo 功能
  }
};

export default nextConfig;
