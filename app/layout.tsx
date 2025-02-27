import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "分掌门AI答疑老师",
  description: "分掌门AI答疑老师",
  icons: {
    icon: '/fzmlogo.png'
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 禁用所有错误UI
  if (typeof window !== 'undefined') {
    // 禁用错误 overlay
    (window as any).__NEXT_ERROR_OVERLAY__ = false;
    (window as any).__NEXT_ERROR__ = false;
    (window as any).NEXT_OVERLAY_DISABLED = true;
    
    // 禁用所有错误显示
    (window as any).__NEXT_DATA__.props.pageProps.error = null;
    (window as any).__NEXT_DATA__.props.pageProps.errorInfo = null;
    
    // 拦截所有错误
    window.addEventListener('error', (event) => {
      event.preventDefault();
      event.stopPropagation();
      return false;
    });
    
    // 拦截未处理的 promise 错误
    window.addEventListener('unhandledrejection', (event) => {
      event.preventDefault();
      event.stopPropagation();
      return false;
    });

    // 禁用控制台错误
    const noop = () => {};
    (window as any).console.error = noop;
    (window as any).console.warn = noop;
    
    // 移除错误 overlay
    const removeErrorOverlay = () => {
      const overlays = document.querySelectorAll(
        '[data-nextjs-error-dialog], [data-nextjs-toast], [data-nextjs-error], .nextjs-error'
      );
      overlays.forEach(overlay => overlay.remove());
    };
    
    removeErrorOverlay();
    window.addEventListener('load', removeErrorOverlay);
  }

  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <style>{`
          #__next-error-overlay,
          #__next-error,
          .nextjs-error,
          [data-nextjs-error-dialog],
          [data-nextjs-toast],
          [data-nextjs-error],
          [data-nextjs-error-overlay],
          [data-nextjs-toast-errors],
          [data-nextjs-dialog-overlay],
          [data-nextjs-dialog-content],
          [data-nextjs-build-error],
          [data-nextjs-refresh],
          [data-nextjs-version],
          .nextjs-container {
            display: none !important;
            visibility: hidden !important;
            width: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
            position: absolute !important;
            pointer-events: none !important;
            z-index: -1 !important;
          }
          [data-nextjs-static-route-indicator],
          .nextjs-static-route-indicator,
          #__next-static-route-indicator {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
        `}</style>
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
