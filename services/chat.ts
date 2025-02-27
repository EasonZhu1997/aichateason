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

      // 检查文本中是否包含JSON对象格式的内容
      const jsonPattern = /\{\"msg_type\":.*\}/;
      const cleanedText = text.replace(jsonPattern, '');
      
      // 如果清理后的文本不为空，则返回
      if (cleanedText.trim()) {
        yield cleanedText;
      } else {
        console.log('跳过无效内容', text);
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