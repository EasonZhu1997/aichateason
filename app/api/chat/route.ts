import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

// 创建四个客户端实例
const siliconClient = new OpenAI({
  apiKey: process.env.SILICON_API_KEY,
  baseURL: process.env.SILICON_API_BASE_URL,
  defaultHeaders: {
    'Content-Type': 'application/json',
  }
});

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_API_BASE,
});

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const wildClient = new OpenAI({
  apiKey: 'sk-fjL382d8c1fdfe3212415a2f0536a2ac2bc7effac09xKhV5',
  baseURL: 'https://api.gptsapi.net/v1',
});

// 添加友好的错误消息
const ERROR_MESSAGES = {
  timeout: '抱歉,我现在有点累了,请稍后再试...',
  noResponse: '抱歉,我好像走神了,能重新问一遍吗?',
  default: '抱歉,我现在状态不太好,请稍后再试...'
};

export async function POST(req: Request) {
  let controller: AbortController | null = new AbortController();
  
  try {
    const { messages, model } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // 根据模型选择使用不同的客户端
    let client;
    let modelId = model;
    
    if (model === 'deepseek-chat') {
      client = deepseekClient;
    } else if (model.startsWith('gpt-')) {
      client = openaiClient;
    } else if (model.startsWith('wild-')) {
      client = wildClient;
    } else {
      client = siliconClient;
    }

    // 设置30秒超时
    const timeoutId = setTimeout(() => {
      if (controller) {
        controller.abort();
      }
    }, 30000);

    const response = await client.chat.completions.create({
      model: modelId,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
      top_p: 0.95,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 检查是否收到了任何响应
    let hasReceivedContent = false;

    // 创建响应流
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              hasReceivedContent = true;
              controller.enqueue(new TextEncoder().encode(content));
            }
          }
          
          // 如果没有收到任何内容,发送友好的错误消息
          if (!hasReceivedContent) {
            controller.enqueue(new TextEncoder().encode(ERROR_MESSAGES.noResponse));
          }
          
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          // 发送友好的错误消息
          controller.enqueue(new TextEncoder().encode(ERROR_MESSAGES.default));
          controller.close();
        }
      },
      cancel() {
        // 清理资源
        if (controller) {
          controller.abort();
          controller = null;
        }
      }
    });

    // 返回流式响应
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });

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