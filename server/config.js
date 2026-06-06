// server/config.js
// AI同声传译 - 系统配置
// 支持 DeepSeek / OpenAI 双模式，支持浏览器端STT
//
// DeepSeek 配置示例:
//   OPENAI_API_KEY=sk-deepseek-key
//   OPENAI_BASE_URL=https://api.deepseek.com/v1
//   TRANSLATION_MODEL=deepseek-chat
//   STT_ENGINE=browser

const path = require("path");
const result = require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

if (result.error) {
  console.warn("[配置] 未找到 .env 文件，将使用默认配置");
  console.warn("[配置] 请复制 .env.example 为 .env 并填入 API Key");
}

const config = {
  // LLM API 配置 (兼容 OpenAI / DeepSeek)
  llm: {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  },

  // STT 引擎: "browser" (Web Speech API) 或 "whisper" (OpenAI Whisper)
  sttEngine: (process.env.STT_ENGINE || "browser").toLowerCase(),

  // STT 配置 (仅 Whisper 模式需要)
  stt: {
    model: process.env.STT_MODEL || "whisper-1",
    language: process.env.SOURCE_LANG || "en",
    maxChunkDuration: 10,
  },

  // 翻译配置
  translation: {
    model: process.env.TRANSLATION_MODEL || "deepseek-chat",
    sourceLang: process.env.SOURCE_LANG || "en",
    targetLang: process.env.TARGET_LANG || "zh",
    contextWindowSize: 10,
  },

  // 服务器配置
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
  },
};

// 检测 API Key 是否已配置
config.hasApiKey = function () {
  return !(!config.llm.apiKey || config.llm.apiKey === "sk-your-api-key-here");
};

// 检测当前模式
config.getMode = function () {
  if (!config.hasApiKey()) return "demo";
  if (config.llm.baseURL.includes("deepseek")) return "deepseek";
  return "openai";
};

module.exports = config;
