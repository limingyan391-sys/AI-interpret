// server/index.js
// AI同声传译 - 主服务入口
// 启动 Express HTTP 服务和 WebSocket 服务
//
// 启动方式:
//   npm start          # 生产模式
//   npm run dev        # 开发模式 (热重载)
//   npm run demo       # 演示模式 (无需 API Key)
//
// 依赖:
//   express (https://www.npmjs.com/package/express)
//   ws (https://www.npmjs.com/package/ws)
//   openai (https://www.npmjs.com/package/openai)
//   dotenv (https://www.npmjs.com/package/dotenv)

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");

const config = require("./config");

// ====================================
// 初始化
// ====================================

console.log("=" .repeat(50));
console.log("  AI 同声传译助手 v1.0.0");
console.log("=" .repeat(50));
console.log("");

// 确保音频临时目录存在
const audioDir = path.join(__dirname, "..", "public", "audio");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// 判断是否使用模拟模式 (无 API Key 或指定 --demo)
const useMock = process.argv.includes("--demo") || !config.openai.apiKey || config.openai.apiKey === "sk-your-api-key-here";

let SpeechToText, Translator, MockSTT, MockTranslator;

if (useMock) {
  console.log("🎯 演示模式: 使用模拟数据 (无需 API Key)");
  console.log("   如需正式使用，请配置 .env 文件中的 OPENAI_API_KEY\n");
  ({ MockSTT, MockTranslator } = require("./mock"));
} else {
  SpeechToText = require("./stt");
  Translator = require("./translator");
}

const WebSocketManager = require("./websocket");

// ====================================
// 创建服务
// ====================================

const app = express();
const server = http.createServer(app);

// 静态文件服务 (前端页面)
app.use(express.static(path.join(__dirname, "..", "public")));

// API 健康检查
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    mode: useMock ? "demo" : "production",
    config: {
      sttModel: config.stt.model,
      translationModel: config.translation.model,
      sourceLang: config.stt.language,
      targetLang: config.translation.targetLang,
      apiKeyConfigured: !useMock,
    },
  });
});

// 初始化核心模块
const stt = useMock ? new MockSTT() : new SpeechToText();
const translator = useMock ? new MockTranslator() : new Translator();

// 初始化 WebSocket 管理器
const wsManager = new WebSocketManager(server, stt, translator);

// ====================================
// 启动服务
// ====================================

const PORT = config.server.port;

server.listen(PORT, () => {
  console.log(`🌐 服务已启动:`);
  console.log(`   HTTP:     http://localhost:${PORT}`);
  console.log(`   WS:       ws://localhost:${PORT}`);
  console.log(`   健康检查: http://localhost:${PORT}/api/health`);
  console.log("");
  console.log(`📋 配置:`);
  console.log(`   模式:          ${useMock ? "🎯 演示模式 (模拟数据)" : "🚀 生产模式"}`);
  console.log(`   语音识别模型:  ${config.stt.model}`);
  console.log(`   翻译模型:      ${config.translation.model}`);
  console.log(`   源语言:        ${config.translation.sourceLang}`);
  console.log(`   目标语言:      ${config.translation.targetLang}`);
  console.log("");

  if (useMock) {
    console.log("💡 提示: 配置 .env 中的 OPENAI_API_KEY 可使用真实 AI 翻译");
  }
  console.log("");
});

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n正在关闭服务...");
  wsManager.wss.close();
  server.close(() => {
    console.log("服务已关闭");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
