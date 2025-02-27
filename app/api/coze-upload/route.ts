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
    const apiKey = process.env.COZE_API_KEY;
    
    if (!apiKey) {
      throw new Error('缺少必要的环境变量: COZE_API_KEY');
    }

    // 将文件转换为Base64编码，直接在前端使用
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    // 创建一个新的FormData对象来发送到Coze API
    const cozeFormData = new FormData();
    cozeFormData.append('file', file);
    cozeFormData.append('purpose', 'chat');  // 指定上传目的为聊天

    console.log('开始上传图片到Coze...', file.name, file.type, file.size);

    try {
      // 调用Coze文件上传API
      const cozeResponse = await fetch('https://api.coze.cn/v1/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: cozeFormData
      });

      if (!cozeResponse.ok) {
        const errorText = await cozeResponse.text();
        console.error('Coze上传API错误:', cozeResponse.status, errorText);
        return NextResponse.json(
          { error: `上传到Coze失败: ${cozeResponse.status} ${errorText}` },
          { status: cozeResponse.status }
        );
      }

      const cozeData = await cozeResponse.json();

      console.log('Coze上传响应:', JSON.stringify(cozeData));

      if (!cozeData.data || !cozeData.data.id) {
        console.error('Coze上传API返回无效数据:', cozeData);
        return NextResponse.json(
          { error: '文件上传到Coze返回无效数据' },
          { status: 500 }
        );
      }

      // 上传成功，返回文件信息
      // 我们同时返回Base64数据URL用于前端显示
      // 和Coze文件ID用于API调用
      return NextResponse.json({
        success: true,
        fileUrl: dataUrl, // 使用数据URL直接在前端显示
        fileName: file.name,
        fileType: file.type,
        fileId: cozeData.data.id // 保存Coze返回的文件ID，用于API调用
      });
    } catch (uploadError) {
      console.error('Coze上传请求失败:', uploadError);
      
      // 尝试使用替代方法：如果上传失败，但我们有Base64数据，仍然返回它用于前端显示
      return NextResponse.json({
        success: true,
        fileUrl: dataUrl, // 使用数据URL直接在前端显示
        fileName: file.name,
        fileType: file.type,
        // 没有fileId，前端将使用URL代替
      });
    }
  } catch (error) {
    console.error('Coze图片上传处理错误:', error);
    return NextResponse.json(
      { error: '文件上传失败' },
      { status: 500 }
    );
  }
} 