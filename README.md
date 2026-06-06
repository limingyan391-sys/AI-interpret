PR 2：后端服务 - WebSocket + STT + 翻译 + 演示模式
标题：feat: backend service with WebSocket handling, Whisper STT, GPT translation, and demo mode

功能描述（实现后端核心业务模块）：
1.SpeechToText（server/stt.js）：调用 OpenAI Whisper API 将音频流转为文字
2.Translator（server/translator.js）：调用 GPT 进行上下文感知翻译，保留最近 10 条历史用于语义连贯
3.WebSocketManager（server/websocket.js）：管理客户端连接、音频流接收、结果推送
4.Mock 模块（server/mock.js）：当未配置 API Key 时提供模拟英语演讲文本和中文翻译，用于离线演示
5.支持 --demo 启动参数自动切换为演示模式

实现思路：
1.Whisper API：接收 base64 编码的音频数据，写入临时文件后调用 API，识别完成后清理
2.GPT 翻译：构建含系统提示词和对话历史的 messages 数组，temperature=0.3 保证翻译稳定性
3.WebSocket 路由：区分 JSON 控制消息（audio_config / reset / ping）和二进制音频数据
4.自动降级：检测到 API Key 未配置时自动加载 Mock 模块，无需改动业务代码

测试方式：
1.执行 npm run demo 启动演示模式
2.确认日志输出 "🎯 演示模式" 和 "✅ 配置完成"
3.确认日志显示 [WebSocket] 服务已启动
4.访问 /api/health 确认 "mode":"demo"
5.打开浏览器连接 WebSocket，检查终端是否打印 [WebSocket] 客户端连接
