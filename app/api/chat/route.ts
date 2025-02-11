import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

// 创建两个客户端实例
const siliconClient = new OpenAI({
  apiKey: process.env.SILICON_API_KEY,
  baseURL: 'https://api.siliconflow.cn/v1'
});

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_API_BASE,
});

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();

    // 验证消息格式
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // 验证消息内容
    const validMessages = messages.every(msg => 
      msg && 
      typeof msg === 'object' && 
      'role' in msg && 
      'content' in msg &&
      typeof msg.content === 'string' &&
      ['user', 'assistant', 'system'].includes(msg.role)
    );

    if (!validMessages) {
      return NextResponse.json(
        { error: 'Invalid message format in array' },
        { status: 400 }
      );
    }

    const client = model === 'deepseek-chat' ? deepseekClient : siliconClient;
    const modelId = model;

    // 添加请求日志
    console.log('API Request Details:', {
      provider: model === 'deepseek-chat' ? 'deepseek' : 'silicon',
      modelId,
      messageCount: messages.length,
      firstMessagePreview: messages[0]?.content?.substring(0, 50)
    });

    try {
      const response = await client.chat.completions.create({
        model: modelId,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
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

    } catch (apiError: any) {
      console.error('API request failed:', apiError);
      // 返回详细的错误信息
      return NextResponse.json({
        error: 'API request failed',
        details: {
          message: apiError.message,
          status: apiError.status,
          response: apiError.response?.data
        }
      }, { status: apiError.status || 500 });
    }

  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    );
  }
} 