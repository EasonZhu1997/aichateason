import { NextRequest, NextResponse } from 'next/server';

// 定义消息类型
type MessageItem = {
  role: string;
  content: string | any[];
};

// 只保留Coze API客户端实现
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
          // 创建适合Coze API的内容数组
          const contentItems = [];
          
          // 处理文本和图片内容
          for (const item of msg.content) {
            if (item.type === 'text') {
              contentItems.push({
                type: "text",
                text: item.text
              });
            } else if (item.type === 'image') {
              // 检查图片URL是否为data:URL格式
              if (item.url.startsWith('data:image/')) {
                contentItems.push({
                  type: "image_url",
                  image_url: {
                    url: item.url
                  }
                });
              } else {
                contentItems.push({
                  type: "image_url",
                  image_url: {
                    url: item.url
                  }
                });
              }
            }
          }
          
          return {
            role: msg.role,
            content: contentItems
          };
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

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        user_id: "user_" + Date.now(), // 生成一个唯一的用户ID
        bot_id: botId,
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

    // 使用一个数据结构记录已处理的内容块
    const processedChunks = new Set();

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
            let lastContent = ''; // 用于跟踪上一次发送的内容
            
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
                    const jsonStr = line.substring(5).trim();
                    
                    // 跳过空数据行
                    if (!jsonStr) continue;
                    
                    // 尝试解析JSON
                    let data;
                    try {
                      data = JSON.parse(jsonStr);
                    } catch (e) {
                      console.error('JSON解析失败:', jsonStr);
                      continue;
                    }
                    
                    // 只处理有效的文本内容
                    if (typeof data.content === 'string' && 
                        data.role === 'assistant' && 
                        data.content_type === 'text') {
                      
                      // 检查是否与上一次发送的内容相同
                      if (data.content !== lastContent) {
                        if (!processedChunks.has(data.content)) {
                          // 过滤掉JSON元数据，只保留纯文本内容
                          let cleanContent = data.content.replace(/\s*\{\"msg_type\":.*$/g, '');
                          
                          // 检测并去除重复内容
                          // 重复检测函数
                          const removeDuplication = (text: string): string => {
                            // 如果文本长度小于20，不处理
                            if (text.length < 20) return text;
                            
                            // 将文本分成两半
                            const halfLength = Math.floor(text.length / 2);
                            const firstHalf = text.substring(0, halfLength);
                            const secondHalf = text.substring(halfLength);
                            
                            // 检查第二半是否与第一半相似
                            if (firstHalf.length > 20 && secondHalf.length > 20) {
                              // 计算两半之间的相似度
                              let similarityScore = 0;
                              const words1 = firstHalf.split(/\s+/);
                              const words2 = secondHalf.split(/\s+/);
                              
                              // 如果词语数量差异太大，不认为是重复
                              if (Math.abs(words1.length - words2.length) > words1.length * 0.3) {
                                return text;
                              }
                              
                              // 计算共同词语数量
                              const set1 = new Set(words1);
                              let commonWords = 0;
                              for (const word of words2) {
                                if (set1.has(word)) {
                                  commonWords++;
                                }
                              }
                              
                              similarityScore = commonWords / Math.min(words1.length, words2.length);
                              
                              // 如果相似度超过阈值，只保留第一半
                              if (similarityScore > 0.5) {
                                console.log('检测到重复内容，移除第二部分');
                                return firstHalf;
                              }
                            }
                            
                            return text;
                          };
                          
                          cleanContent = removeDuplication(cleanContent);
                          controller.enqueue(encoder.encode(cleanContent));
                          processedChunks.add(cleanContent);
                        }
                        lastContent = data.content; // 更新上一次发送的内容
                      } else {
                        console.log('跳过重复内容:', data.content);
                      }
                    } else {
                      // 记录不符合预期的数据格式
                      console.log('跳过非文本内容:', JSON.stringify(data));
                    }
                  } catch (e) {
                    console.error('处理数据行失败:', e);
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
            if (error instanceof Error && error.name !== 'AbortError') {
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
    if (error instanceof Error && error.name === 'AbortError') {
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