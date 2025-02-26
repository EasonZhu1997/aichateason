export type Message = {
  id: string;
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
      throw new Error('聊天请求失败');
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
      
      // 解码响应
      const text = decoder.decode(value, { stream: true });

      // 检查是否是有效的文本内容
      try {
        // 尝试解析为JSON，如果成功则说明这是一个对象而不是纯文本
        JSON.parse(text);
        console.log('跳过JSON对象:', text);
      } catch (e) {
        // 解析失败说明这是纯文本，可以安全地yield
        yield text;
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('请求已中止');
      return;
    }
    console.error('聊天错误:', error);
    throw error;
  }
} 