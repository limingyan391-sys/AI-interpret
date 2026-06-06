PR 5：DeepSeek API 集成 + 浏览器端语音识别
标题：DeepSeek API integration with browser-based Web Speech API for zero-cost speech recognition

功能描述（将语音识别从服务端 Whisper API 迁移到浏览器端 Web Speech API，实现零成本的语音识别方案）：
1.Web Speech API（audio.js 重写）：使用浏览器内置的 SpeechRecognition API，免费、无需 API Key
2.文本传输：浏览器直接发送识别后的文本（stt_result），不再传输原始音频
3.DeepSeek 兼容：配置 OPENAI_BASE_URL=https://api.deepseek.com/v1 即可使用 DeepSeek 翻译
4.三模式自动检测：启动时自动识别 DeepSeek / OpenAI / Demo 模式
5.实时中间结果：浏览器显示虚线边框的实时语音识别中间结果（讲话时即时出现）

实现思路：
1.Web Speech API 设置 continuous: true + interimResults: true 实现持续识别
2.最终结果通过 WebSocket 以 stt_result 消息类型发送文本，不再需要服务端 Whisper 处理
3.DeepSeek API 与 OpenAI 格式兼容，只需改 baseURL 和 model 名，translator.js 无需改动
4.config.js 新增 hasApiKey() 和 getMode() 方法，server/index.js 自动检测并显示当前模式
5.Mock STT 的 transcribe() 方法同时兼容字符串（browser 模式）和 Buffer（whisper 模式）输入

测试方式：
1.配置 .env：OPENAI_BASE_URL=https://api.deepseek.com/v1 + TRANSLATION_MODEL=deepseek-chat
2.执行 npm start 启动，确认日志显示 "🚀 DeepSeek 模式"
3.用 Chrome 浏览器访问，点击「开始录音」
4.说英语，确认原文面板出现带虚线边框的中间结果（实时显示）
5.说话停顿后，中间结果变为正式条目并触发翻译
6.切换目标语言为日语/韩语，再次说话确认翻译语言切换
7.也可以执行 npm run demo 测试演示模式
