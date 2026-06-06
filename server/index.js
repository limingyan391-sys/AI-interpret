// server/index.js
// AI同声传译 - 主服务入口
// 支持 DeepSeek / OpenAI 双模式
//
// 使用方式:
//   DeepSeek: 配置 .env (OPENAI_BASE_URL=https://api.deepseek.com/v1, STT_ENGINE=browser)
//   OpenAI:   配置 .env (OPENAI_API_KEY=sk-..., STT_ENGINE=whisper)
//   Demo:     npm run demo (无需API Key)

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");

const config = require("./config");

// 确保音频临时目录存在
const audioDir = path.join(__dirname, "..", "public", "audio");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// 判断是否使用模拟模式
const useMock = process.argv.includes("--demo") || !config.hasApiKey();

let SpeechToText, Translator, MockSTT, MockTranslator;
let modeLabel, sttLabel;

if (useMock) {
  console.log("🎯 演示模式: 使用模拟数据 (无需 API Key)\n");
  ({ MockSTT, MockTranslator } = require("./mock"));
  modeLabel = "演示模式";
  sttLabel = "模拟";
} else {
  SpeechToText = require("./stt");
  Translator = require("./translator");

  const mode = config.getMode();
  modeLabel = mode === "deepseek" ? "DeepSeek" : "OpenAI";
  sttLabel = config.sttEngine === "browser" ? "浏览器Web Speech API" : "Whisper";

  console.log(`🚀 ${modeLabel} 模式`);
  console.log(`   翻译模型: ${config.translation.model}`);
  console.log(`   STT引擎:  ${sttLabel}\n`);
}

const WebSocketManager = require("./websocket");

// ====================================
// 创建 HTTP 服务
// ====================================
const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    mode: useMock ? "demo" : config.getMode(),
    config: {
      sttEngine: config.sttEngine,
      translationModel: config.translation.model,
      sourceLang: config.translation.sourceLang,
      targetLang: config.translation.targetLang,
      apiKeyConfigured: config.hasApiKey(),
    },
  });
});

// 初始化模块
const stt = useMock ? new MockSTT() : new SpeechToText();
const translator = useMock ? new MockTranslator() : new Translator();
const wsManager = new WebSocketManager(server, stt, translator);

// ====================================
// 启动
// ====================================
const PORT = config.server.port;
server.listen(PORT, () => {
  console.log("=" .repeat(50));
  console.log("  AI 同声传译助手 v1.0.0");
  console.log("=" .repeat(50));
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`  模式: ${modeLabel}`);
  console.log(`  STT: ${sttLabel}`);
  console.log(`  翻译: ${config.translation.model}`);
  console.log(`  源语言 → 目标语言: ${config.translation.sourceLang} → ${config.translation.targetLang}`);
  console.log("=" .repeat(50));
  console.log("");

  if (!config.hasApiKey() && !useMock) {
    console.log("⚠  请配置 .env 后重启服务");
  }
});

process.on("SIGINT", () => {
  console.log("\n关闭服务...");
  wsManager.wss.close();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
