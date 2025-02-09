'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 静默记录错误,但不显示给用户
    console.log('Error occurred:', error)
  }, [error])

  // 返回 null 或者优雅降级的 UI
  return null
} 