import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

// 创建三个客户端实例
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
  apiKey: process.env.OPENAI_API_KEY, // 使用提供的 key
});

export async function POST(req: Request) {
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
    } else {
      client = siliconClient;
    }

    const response = await client.chat.completions.create({
      model: modelId,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
      top_p: 0.95,
    });

    // 创建响应流
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              // 确保内容是有效的文本
              controller.enqueue(new TextEncoder().encode(content));
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 