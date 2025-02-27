import { NextRequest, NextResponse } from 'next/server';

// 定义消息类型
type MessageItem = {
  role: string;
  content: string | any[];
};

// 添加友好的错误消息
const ERROR_MESSAGES = {
  timeout: '抱歉,我现在有点累了,请稍后再试...',
  noResponse: '抱歉,我好像走神了,能重新问一遍吗?',
  default: '抱歉,我现在状态不太好,请稍后再试...'
};

// 更新Coze API客户端实现，符合v3规范
const cozeClient = {
  chat: async (messages: MessageItem[], signal?: AbortSignal) => {
    // 将消息转换为Coze API所需的格式
    const additionalMessages = messages
      .filter((msg) => msg.role !== 'system') // 过滤掉系统消息
      .map((msg) => {
        // 检查消息内容是否为字符串
        if (typeof msg.content === 'string') {
          return {
            content_type: "text",
            role: msg.role,
            content: msg.content
          };
        } 
        // 如果是数组，处理多模态内容
        else if (Array.isArray(msg.content)) {
          // 处理包含图片的消息
          const hasImage = msg.content.some(item => item.type === 'image');
          
          if (hasImage) {
            // 创建多模态内容数组
            const items = [];
            
            for (const item of msg.content) {
              if (item.type === 'text') {
                items.push({
                  type: "text",
                  text: item.text
                });
              } else if (item.type === 'image') {
                // 检查是否包含文件ID
                if (item.fileId) {
                  items.push({
                    type: "image",
                    file_id: item.fileId // 直接使用file_id，不是嵌套的image对象
                  });
                } else if (item.url) {
                  items.push({
                    type: "image",
                    url: item.url
                  });
                }
              }
            }
            
            // 使用object_string格式处理多模态内容，并将items数组序列化为字符串
            return {
              content_type: "object_string",
              role: msg.role,
              content: JSON.stringify(items),
              type: "question"
            };
          } else {
            // 如果只有文本，则提取文本内容
            const textContent = msg.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join(' ');
            
            return {
              content_type: "text",
              role: msg.role,
              content: textContent || ""
            };
          }
        }
        
        // 默认文本消息
        return {
          content_type: "text",
          role: msg.role,
          content: String(msg.content)
        };
      });

    // 确保环境变量存在
    const baseUrl = process.env.BASE_URL;
    const apiKey = process.env.COZE_API_KEY;
    const botId = process.env.COZE_BOT_ID;
    
    if (!baseUrl || !apiKey || !botId) {
      throw new Error('Missing required environment variables');
    }

    // 构建请求体，严格按照curl命令中的格式
    const requestBody = {
      user_id: "user_" + Date.now(), // 生成一个唯一的用户ID
      bot_id: botId,
      additional_messages: additionalMessages,
      auto_save_history: true,
      stream: true
    };

    console.log('发送到Coze的请求:', JSON.stringify(requestBody));

    // 在请求前记录原始请求消息，帮助调试
    console.log('原始消息:', messages);
    console.log('处理后的消息:', additionalMessages);

    // 添加超时处理 - 使用独立的AbortController避免干扰主流程
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort();
      console.error('请求超时');
    }, 30000); // 30秒超时

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: signal || timeoutController.signal
      });
      
      // 清除超时计时器
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Coze API响应错误:', response.status, errorText);
        throw new Error(`Coze API 错误: ${response.status} ${errorText}`);
      }
      
      return response;
    } catch (error) {
      // 清除超时计时器
      clearTimeout(timeoutId);
      throw error;
    }
  }
};

export async function POST(request: NextRequest) {
  const controller = new AbortController();
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
    const response = await cozeClient.chat(messages, signal);
    
    // 创建一个可读流来处理响应
    const reader = response.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // 记录调试信息
    const debugInfo = "开始处理Coze API响应流";
    console.log(debugInfo);

    // 创建一个TransformStream来处理数据
    const stream = new ReadableStream({
      async start(controller) {
        if (!reader) {
          const errorMsg = "无法获取响应流读取器";
          console.error(errorMsg);
          controller.enqueue(encoder.encode(`[错误: ${errorMsg}]`));
          controller.close();
          return;
        }

        try {
          let buffer = '';
          let receivedAnyContent = false;
          
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              if (!receivedAnyContent) {
                controller.enqueue(encoder.encode('没有收到回复，请重试'));
              }
              controller.close();
              break;
            }
            
            // 解码响应
            const text = decoder.decode(value, { stream: true });
            buffer += text;
            
            // 记录原始响应
            console.log('收到的原始响应片段:', text);
            
            // 处理缓冲区中的所有完整事件
            let processedBuffer = '';
            const lines = buffer.split('\n');
            
            // 跟踪当前事件类型
            let currentEvent = '';
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              
              // 检查是否是事件行
              if (line.startsWith('event:')) {
                currentEvent = line.substring(6).trim(); // 提取事件名称
                console.log('事件行:', line, '事件类型:', currentEvent);
                continue;
              }
              
              // 检查是否是数据行
              if (line.startsWith('data:')) {
                try {
                  // 提取JSON数据
                  const jsonStr = line.substring(5).trim();
                  
                  // 跳过空数据行或结束标记
                  if (!jsonStr || jsonStr === '[DONE]') {
                    if (jsonStr === '[DONE]') {
                      console.log('收到结束标记 [DONE]');
                    }
                    continue;
                  }

                  // 记录处理的JSON数据
                  console.log('处理的JSON数据:', jsonStr, '当前事件类型:', currentEvent);
                  
                  // 尝试解析JSON
                  let data;
                  try {
                    data = JSON.parse(jsonStr);
                    receivedAnyContent = true;
                  } catch (error) {
                    const e = error as Error;
                    console.error('JSON解析失败:', jsonStr);
                    continue;
                  }
                  
                  // 根据事件类型和数据格式处理响应
                  if (currentEvent === 'conversation.message.delta' && data.content && data.content_type === 'text') {
                    // 检查是否是元数据JSON字符串
                    const isMetadata = typeof data.content === 'string' && 
                      (data.content.includes('"msg_type"') || 
                       data.content.includes('"finish_reason"') ||
                       data.content.includes('"from_module"') ||
                       data.content.includes('"FinData"'));
                    
                    if (!isMetadata) {
                      // 处理会话消息增量，直接发送内容
                      console.log('发送会话消息增量到前端:', data.content);
                      controller.enqueue(encoder.encode(data.content));
                    } else {
                      console.log('跳过元数据:', data.content);
                    }
                  }
                  // 处理object_string类型的内容（多模态）
                  else if (currentEvent === 'conversation.message.delta' && data.content && data.content_type === 'object_string') {
                    try {
                      // 尝试解析JSON字符串
                      const parsedContent = JSON.parse(data.content);
                      // 找出所有文本类型的项目
                      const textItems = Array.isArray(parsedContent) 
                        ? parsedContent.filter(item => item.type === 'text')
                        : [];
                      
                      // 输出所有文本内容
                      for (const item of textItems) {
                        if (item.text) {
                          console.log('发送多模态文本内容到前端:', item.text);
                          controller.enqueue(encoder.encode(item.text));
                        }
                      }
                    } catch (error) {
                      console.error('解析object_string内容失败:', error);
                      // 如果解析失败，尝试直接发送内容
                      if (!data.content.includes('"msg_type"') && 
                          !data.content.includes('"finish_reason"') && 
                          !data.content.includes('"from_module"')) {
                        controller.enqueue(encoder.encode(data.content));
                      }
                    }
                  }
                  // 其他事件类型处理
                  else if (data.content_type === 'text' && data.content) {
                   
                    const isMetadata = typeof data.content === 'string' && 
                      (data.content.includes('"msg_type"') || 
                       data.content.includes('"finish_reason"') ||
                       data.content.includes('"from_module"') ||
                       data.content.includes('"FinData"'));
                       
                  } 
                  else if ((data.content_type === 'multimodal' || data.content_type === 'object_string') && data.content) {
                    // 处理多模态响应
                    try {
                      // 如果是object_string类型，尝试解析JSON
                      let contentItems = data.content;
                      if (data.content_type === 'object_string' && typeof data.content === 'string') {
                        contentItems = JSON.parse(data.content);
                      }
                      
                      // 提取所有文本类型的项目
                      const textItems = Array.isArray(contentItems)
                        ? contentItems.filter((item: any) => item.type === 'text')
                        : [];
                      
                      for (const item of textItems) {
                        if (item.text) {
                          console.log('发送多模态文本内容到前端:', item.text);
                          controller.enqueue(encoder.encode(item.text));
                        }
                      }
                    } catch (error) {
                      console.error('处理多模态内容失败:', error);
                    }
                  }
                  // 还处理choices格式（兼容其他格式）
                  else if (data.choices && data.choices[0] && data.choices[0].delta) {
                    const delta = data.choices[0].delta;
                    console.log('解析的delta对象:', JSON.stringify(delta));
                    
                    // 处理文本类型响应
                    if (delta.content_type === 'text' && delta.content) {
                      controller.enqueue(encoder.encode(delta.content));
                    }
                    // 处理多模态响应
                    else if ((delta.content_type === 'multimodal' || delta.content_type === 'object_string') && delta.content) {
                      try {
                        // 如果是object_string类型，尝试解析JSON
                        let contentItems = delta.content;
                        if (delta.content_type === 'object_string' && typeof delta.content === 'string') {
                          contentItems = JSON.parse(delta.content);
                        }
                        
                        // 提取文本内容
                        const textItems = Array.isArray(contentItems)
                          ? contentItems.filter((item: any) => item.type === 'text')
                          : [];
                          
                        for (const item of textItems) {
                          if (item.text) {
                            controller.enqueue(encoder.encode(item.text));
                          }
                        }
                      } catch (error) {
                        console.error('处理delta多模态内容失败:', error);
                      }
                    }
                  }
                  else if (data.msg) {
                    // 处理错误消息
                    console.log('收到错误消息:', data.msg);
                    if (!receivedAnyContent) {
                      controller.enqueue(encoder.encode(`[API错误: ${data.msg}]`));
                      receivedAnyContent = true;
                    }
                  }
                } catch (error) {
                  const e = error as Error;
                  console.error('处理数据行失败:', e);
                }
              } else if (line !== '') {
                // 保留未处理的行到下一次循环
                processedBuffer += line + '\n';
                console.log('未处理的行:', line);
              }
            }
            
            // 更新缓冲区为未处理的内容
            buffer = processedBuffer;
          }
        } catch (error) {
          const err = error as Error;
          console.error('流处理错误:', err);
          controller.enqueue(encoder.encode(`抱歉，处理回复时出现错误，请重试`));
          controller.close();
        }
      },
      
      // 当流被取消时，确保我们也取消底层请求
      cancel() {
        reader?.cancel();
      }
    });

    return new NextResponse(stream);
  } catch (error) {
    console.error('Chat error:', error);
    
    // 根据错误类型返回不同的友好消息
    let errorMessage = ERROR_MESSAGES.default;
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = ERROR_MESSAGES.timeout;
      }
      errorMessage += `\n\n[调试信息: ${error.message}]`;
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
    // 不要在这里中止控制器，会导致流处理被中断
    // controller.abort();
  }
} 