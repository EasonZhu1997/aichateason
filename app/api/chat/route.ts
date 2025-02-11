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

    // 创建一个 TransformStream 来处理响应
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk);
        controller.enqueue(encoder.encode(text));
      },
    });

    const writer = stream.writable.getWriter();
    
    // 处理流式响应
    for await (const chunk of response) {
      const text = chunk.choices[0]?.delta?.content || '';
      writer.write(encoder.encode(text));
    }
    writer.close();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    if (error.response) {
      console.error('Error response:', {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers,
      });
    }
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
} 