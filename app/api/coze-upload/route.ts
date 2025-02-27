import { NextRequest, NextResponse } from 'next/server';

// 支持的文件类型
const allowedTypes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

// 最大文件大小 (8MB)
const MAX_FILE_SIZE = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: '没有找到文件' },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: '不支持的文件类型，请上传JPG、PNG、GIF或WEBP图片' },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '文件大小超过限制 (8MB)' },
        { status: 400 }
      );
    }

    // 获取Coze API相关环境变量
    const baseUrl = process.env.BASE_URL;
    const apiKey = process.env.COZE_API_KEY;
    const botId = process.env.COZE_BOT_ID;
    
    if (!baseUrl || !apiKey || !botId) {
      throw new Error('缺少必要的环境变量');
    }

    // 将文件转换为Base64编码
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const fileUrl = `data:${file.type};base64,${base64}`;

    // 返回图片URL，可以在聊天中使用
    return NextResponse.json({
      success: true,
      fileUrl,
      fileName: file.name,
      fileType: file.type
    });
  } catch (error) {
    console.error('Coze图片上传处理错误:', error);
    return NextResponse.json(
      { error: '文件上传失败' },
      { status: 500 }
    );
  }
} 