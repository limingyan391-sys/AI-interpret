// server/stt.js
// AI同声传译 - 语音识别模块
// 支持两种模式:
//   1. browser: 前端 Web Speech API 已识别文本，服务端只做校验
//   2. whisper: 使用 OpenAI Whisper API 将音频转换为文本
//
// 依赖: openai (https://www.npmjs.com/package/openai)
// API参考: https://platform.openai.com/docs/guides/speech-to-text

const OpenAI = require("openai");
const config = require("./config");
const fs = require("fs");
const path = require("path");

class SpeechToText {
  constructor() {
    this.engine = config.sttEngine;
    console.log(`[STT] 使用引擎: ${this.engine}`);

    if (this.engine === "whisper") {
      if (!config.hasApiKey()) {
        console.warn("[STT] 警告: 使用 Whisper 引擎但未配置 API Key");
      }
      this.client = new OpenAI({
        apiKey: config.llm.apiKey,
        baseURL: config.llm.baseURL,
      });
      this.model = config.stt.model;
      this.language = config.stt.language;
      this.tempDir = path.join(__dirname, "..", "public", "audio");
    }
  }

  /**
   * 处理语音识别
   * browser 模式: 直接透传前端识别结果
   * whisper 模式: 调用 OpenAI Whisper API
   *
   * @param {Buffer|string} input - whisper模式: 音频Buffer; browser模式: 文本
   * @param {string} format - 音频格式 (仅whisper)
   * @returns {Promise<{text: string, segments: Array, duration: number}>}
   */
  async transcribe(input, format = "webm") {
    if (this.engine === "browser") {
      return this._browserTranscribe(input);
    }
    return this._whisperTranscribe(input, format);
  }

  /**
   * 浏览器模式: 前端已用 Web Speech API 完成识别
   * 服务端只做基本校验和清理
   */
  async _browserTranscribe(text) {
    if (!text || typeof text !== "string") {
      return { text: "", segments: [], duration: 0 };
    }

    const cleaned = text.trim();
    if (!cleaned) {
      return { text: "", segments: [], duration: 0 };
    }

    return {
      text: cleaned,
      segments: [{ text: cleaned, start: 0, end: cleaned.split(/\s+/).length * 0.3 }],
      duration: cleaned.split(/\s+/).length * 0.3,
    };
  }

  /**
   * Whisper 模式: 调用 OpenAI Whisper API
   */
  async _whisperTranscribe(audioBuffer, format) {
    try {
      const timestamp = Date.now();
      const filename = `audio_${timestamp}.${format}`;
      const filepath = path.join(this.tempDir, filename);

      fs.writeFileSync(filepath, audioBuffer);

      const transcription = await this.client.audio.transcriptions.create({
        model: this.model,
        file: fs.createReadStream(filepath),
        language: this.language,
        response_format: "verbose_json",
        temperature: 0.0,
      });

      fs.unlinkSync(filepath);

      return {
        text: transcription.text.trim(),
        segments: transcription.segments || [],
        duration: transcription.duration || 0,
      };
    } catch (error) {
      console.error("[STT] Whisper 识别错误:", error.message);
      if (error.status === 401) console.error("[STT] API Key 无效");
      if (error.status === 413) console.error("[STT] 音频文件过大");
      return { text: "", segments: [], duration: 0 };
    }
  }
}

module.exports = SpeechToText;
