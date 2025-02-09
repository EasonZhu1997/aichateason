'use client'

import dynamic from 'next/dynamic';

const Chat = dynamic(
  () => import('@/components/chat/chat').then(mod => ({ default: mod.Chat })),
  { ssr: false }
);

export default function ChatPage() {
  return (
    <div className="flex min-h-screen">
      <Chat />
    </div>
  );
} 