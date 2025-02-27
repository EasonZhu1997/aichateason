export type MessageContent = 
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt?: string; fileId?: string };

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

    console.log('发送聊天请求:', JSON.stringify(processedMessages));

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: processedMessages, model }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('聊天请求失败:', response.status, errorText);
      yield `请求失败，请稍后重试`;
      throw new Error(`聊天请求失败: ${response.status} ${errorText}`);
    }

    console.log('收到响应, 状态码:', response.status);

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      const errorMsg = '无法读取响应流';
      console.error(errorMsg);
      yield `请求出错，请重试`;
      throw new Error(errorMsg);
    }

    let chunkCount = 0;
    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        break;
      }
      
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      // 解码响应
      const text = decoder.decode(value, { stream: true });
      chunkCount++;
      
      console.log(`收到第${chunkCount}块数据，长度：${text.length}字节`);
      
      // 只输出有实际内容的文本
      if (text.trim()) {
        yield text;
      } else {
        console.log('收到空文本块');
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