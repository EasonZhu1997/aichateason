import { NextResponse } from 'next/server';

// 只保留Coze API客户端实现
const cozeClient = {
  chat: async (messages, signal) => {
    // 将消息转换为Coze API所需的格式
    const additionalMessages = messages
      .filter(msg => msg.role !== 'system') // 过滤掉系统消息
      .map(msg => ({
        content_type: "text",
        role: msg.role,
        content: msg.content
      }));

    const response = await fetch(process.env.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.COZE_API_KEY}`
      },
      body: JSON.stringify({
        user_id: "user_" + Date.now(), // 生成一个唯一的用户ID
        bot_id: process.env.COZE_BOT_ID,
        additional_messages: additionalMessages,
        auto_save_history: true,
        stream: true
      }),
      signal
    });
    
    return response;
  }
};

// 添加友好的错误消息
const ERROR_MESSAGES = {
  timeout: '抱歉,我现在有点累了,请稍后再试...',
  noResponse: '抱歉,我好像走神了,能重新问一遍吗?',
  default: '抱歉,我现在状态不太好,请稍后再试...'
};

export async function POST(req: Request) {
  let controller: AbortController | null = new AbortController();
  let hasReceivedContent = false;

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // 直接使用Coze API
    try {
      const response = await cozeClient.chat(messages, controller.signal);
      
      // 创建响应流
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value, { stream: true });
              controller.enqueue(new TextEncoder().encode(chunk));
              hasReceivedContent = true;
            }
            controller.close();
          } catch (error) {
            console.error('Stream error:', error);
            controller.enqueue(new TextEncoder().encode(ERROR_MESSAGES.default));
            controller.close();
          }
        }
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      console.error('Coze API error:', error);
      throw error;
    }

  } catch (error) {
    console.error('Chat error:', error);
    
    // 根据错误类型返回不同的友好消息
    let errorMessage = ERROR_MESSAGES.default;
    if (error.name === 'AbortError') {
      errorMessage = ERROR_MESSAGES.timeout;
    }
    
    // 创建一个只包含错误消息的流
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(errorMessage));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } finally {
    // 清理资源
    if (controller) {
      controller.abort();
      controller = null;
    }
  }
} 