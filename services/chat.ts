export type MessageContent = 
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt?: string };

export type Message = {
  id: string;
  role: 'system' | 'assistant' | 'user';
  content: string | MessageContent[];
  timestamp?: string;
  loading?: boolean;
};

// 辅助函数：检查消息内容是否为字符串或MessageContent数组
export const isContentString = (content: string | MessageContent[]): content is string => {
  return typeof content === 'string';
};

export async function* streamChat(messages: Message[], model: string, signal?: AbortSignal) {
  try {
    // 在发送前处理消息，确保格式正确
    const processedMessages = messages.map(msg => {
      // 如果content是字符串，直接使用
      if (isContentString(msg.content)) {
        return {
          ...msg,
          content: msg.content
        };
      }
      
      // 如果content是数组，维持数组格式，以便后端正确处理
      return {
        ...msg,
        content: msg.content
      };
    });

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: processedMessages, model }),
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
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('请求已中止');
      return;
    }
    console.error('聊天错误:', error);
    throw error;
  }
} 