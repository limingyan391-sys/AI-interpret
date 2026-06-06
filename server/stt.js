// server/stt.js
// AI同声传译 - 语音识别模块
// 使用 OpenAI Whisper API 将音频转换为文本
// 依赖: openai (https://www.npmjs.com/package/openai)
// API参考: https://platform.openai.com/docs/guides/speech-to-text

const OpenAI = require("openai");
const config = require("./config");
const fs = require("fs");
const path = require("path");

class SpeechToText {
  constructor() {
    if (!config.openai.apiKey || config.openai.apiKey === "sk-your-api-key-here") {
      console.error("[STT] 错误: 未配置 OPENAI_API_KEY");
      console.error("[STT] 请复制 .env.example 为 .env 并填入有效的 API Key");
    }

    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseURL,
    });

    this.model = config.stt.model;
    this.language = config.stt.language;
    this.tempDir = path.join(__dirname, "..", "public", "audio");
  }

  /**
   * 将音频缓冲区转换为文本
   * @param {Buffer} audioBuffer - 音频数据 (支持格式: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm)
   * @param {string} format - 音频格式 (默认为 webm)
   * @returns {Promise<{text: string, segments: Array}>} 识别结果
   */
  async transcribe(audioBuffer, format = "webm") {
    try {
      // 使用唯一文件名避免冲突
      const timestamp = Date.now();
      const filename = `audio_${timestamp}.${format}`;
      const filepath = path.join(this.tempDir, filename);

      // 写入临时文件 (Whisper API 需要上传文件)
      fs.writeFileSync(filepath, audioBuffer);

      const transcription = await this.client.audio.transcriptions.create({
        model: this.model,
        file: fs.createReadStream(filepath),
        language: this.language,
        response_format: "verbose_json",
        temperature: 0.0,
      });

      // 清理临时文件
      fs.unlinkSync(filepath);

      return {
        text: transcription.text.trim(),
        segments: transcription.segments || [],
        duration: transcription.duration || 0,
      };
    } catch (error) {
      console.error("[STT] 识别错误:", error.message);

      // 处理常见错误
      if (error.status === 401) {
        console.error("[STT] API Key 无效，请检查 OPENAI_API_KEY 配置");
      } else if (error.status === 413) {
        console.error("[STT] 音频文件过大，请减小 chunk 大小");
      } else if (error.code === "ENOENT") {
        console.error("[STT] 临时文件写入失败");
      }

      return { text: "", segments: [], duration: 0 };
    }
  }
}

module.exports = SpeechToText;
