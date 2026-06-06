// server/config.js
// AI同声传译 - 系统配置
// 基于环境变量加载配置，支持 .env 文件

const path = require("path");
const result = require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

if (result.error) {
  console.warn("[配置] 未找到 .env 文件，将使用默认配置");
  console.warn("[配置] 请复制 .env.example 为 .env 并填入你的 OpenAI API Key");
}

const config = {
  // OpenAI 配置
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  },

  // STT 配置 (Whisper)
  stt: {
    model: process.env.STT_MODEL || "whisper-1",
    language: process.env.SOURCE_LANG || "en",
    // Whisper API 限制: 最大25MB, 建议每个chunk不超过10秒
    maxChunkDuration: 10,
  },

  // 翻译配置 (GPT)
  translation: {
    model: process.env.TRANSLATION_MODEL || "gpt-4o-mini",
    sourceLang: process.env.SOURCE_LANG || "en",
    targetLang: process.env.TARGET_LANG || "zh",
    // 上下文窗口大小: 保留最近的N条对话用于修正
    contextWindowSize: 10,
  },

  // 服务器配置
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    wsMaxPayload: parseInt(process.env.WS_MAX_PAYLOAD, 10) || 1048576,
  },
};

module.exports = config;
