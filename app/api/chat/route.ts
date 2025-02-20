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

// 添加 grok client
const grokClient = new OpenAI({
  apiKey: 'xai-zUE6gLv8j4bLf1XPzsIsFlpvmw4WB3gpRl3MDn9HsmIRJDCdl960bogRNcNlZRSjdOTR8kAkPXOpMmdx',
  baseURL: 'https://api.x.ai/v1',
});

// 修改 cursorai client
const cursoraiClient = new OpenAI({
  apiKey: 'sk-9ZnOLUmDfjNb65pQiiJ9lF1fyIAlSzoi8SZbWC37Cyj9bcBG',
  baseURL: 'https://api.cursorai.art/v1',
});

// 添加友好的错误消息
const ERROR_MESSAGES = {
  timeout: '抱歉,我现在有点累了,请稍后再试...',
  noResponse: '抱歉,我好像走神了,能重新问一遍吗?',
  default: '抱歉,我现在状态不太好,请稍后再试...'
};

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    const response = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages.map(({ role, content }) => ({ role, content })),
      stream: true,
    });

    // 创建一个 ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const text = chunk.choices[0]?.delta?.content || '';
          controller.enqueue(new TextEncoder().encode(text));
        }
        controller.close();
      },
    });

    return new Response(stream);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Chat request failed' },
      { status: 500 }
    );
  }
} 