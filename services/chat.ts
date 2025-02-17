export type Message = {
  role: 'system' | 'assistant' | 'user';
  content: string;
  timestamp?: string;
  loading?: boolean;
};

export async function* streamChat(messages: Message[], model: string, signal?: AbortSignal) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages, model }),
      signal,
    });

    if (!response.ok) {
      throw new Error('Chat request failed');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      if (signal?.aborted) {
        reader.cancel();
        break;
      }
      
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Request aborted');
      return;
    }
    console.error('Chat error:', error);
    throw error;
  }
} 