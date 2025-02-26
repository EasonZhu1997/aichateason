import { NextRequest, NextResponse } from 'next/server';

// 只保留Coze API客户端实现
const cozeClient = {
  chat: async (messages, signal) => {
    // 将消息转换为Coze API所需的格式
    const additionalMessages = messages
      .filter((msg: any) => msg.role !== 'system') // 过滤掉系统消息
      .map((msg: any) => ({
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

export async function POST(request: NextRequest) {
  let controller: AbortController | null = new AbortController();
  const { signal } = controller;
  
  try {
    const { messages, model } = await request.json();
    
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // 直接使用Coze API
    try {
      const response = await cozeClient.chat(messages, signal);
      
      // 创建一个可读流来处理响应
      const reader = response.body?.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      // 创建一个TransformStream来处理数据
      const stream = new ReadableStream({
        async start(controller) {
          if (!reader) {
            controller.close();
            return;
          }

          try {
            let buffer = '';
            
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                controller.close();
                break;
              }
              
              // 解码响应
              const text = decoder.decode(value, { stream: true });
              buffer += text;
              
              // 处理缓冲区中的所有完整事件
              let processedBuffer = '';
              const lines = buffer.split('\n');
              
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // 检查是否是事件行
                if (line.startsWith('event:')) {
                  continue;
                }
                
                // 检查是否是数据行
                if (line.startsWith('data:')) {
                  try {
                    // 提取JSON数据
                    const jsonStr = line.substring(5);
                    const data = JSON.parse(jsonStr);
                    
                    // 只提取content字段，并且过滤掉控制消息
                    if (data.content && data.type !== "generate_answer_finish" && 
                        !data.msg_type && data.content_type === "text") {
                      controller.enqueue(encoder.encode(data.content));
                    }
                  } catch (e) {
                    // 忽略解析错误，继续处理下一行
                    console.error('解析JSON失败:', e);
                  }
                } else if (line !== '') {
                  // 保留未处理的行到下一次循环
                  processedBuffer += line + '\n';
                }
              }
              
              // 更新缓冲区为未处理的内容
              buffer = processedBuffer;
            }
          } catch (error) {
            // 只有在不是AbortError的情况下才报告错误
            if (error.name !== 'AbortError') {
              console.error('流处理错误:', error);
              controller.error(error);
            }
          }
        },
        
        // 当流被取消时，确保我们也取消底层请求
        cancel() {
          reader?.cancel();
        }
      });

      return new NextResponse(stream);
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

    return new NextResponse(stream);
  } finally {
    // 清理资源
    if (controller && !signal.aborted) {
      controller = null;
    }
  }
} 