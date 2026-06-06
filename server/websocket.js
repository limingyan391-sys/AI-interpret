// server/websocket.js
// AI同声传译 - WebSocket 通信模块
// 支持 browser STT 模式 (接收文本) 和 whisper 模式 (接收音频)
//
// browser 模式数据流:
//   浏览器: Web Speech API → text → stt_result → 服务端 → DeepSeek → translation
//
// whisper 模式数据流:
//   浏览器: MediaRecorder → audio → audio_chunk → 服务端 → Whisper → DeepSeek → translation

const WebSocket = require("ws");
const config = require("./config");

class WebSocketManager {
  constructor(server, stt, translator) {
    this.stt = stt;
    this.translator = translator;

    this.wss = new WebSocket.Server({ server });
    this.clients = new Map();

    this._setupHandlers();
    console.log("[WebSocket] 服务已启动");
    console.log(`[WebSocket] STT引擎: ${config.sttEngine}`);
  }

  _setupHandlers() {
    this.wss.on("connection", (ws, req) => {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.log(`[WebSocket] 客户端连接: ${clientId}`);

      const clientState = {
        id: clientId,
        audioBuffer: Buffer.alloc(0),
        isProcessing: false,
        lastProcessTime: Date.now(),
        config: {
          sourceLang: config.translation.sourceLang,
          targetLang: config.translation.targetLang,
          sttEngine: config.sttEngine,
        },
      };
      this.clients.set(ws, clientState);

      ws.on("message", async (data) => {
        try {
          await this._handleMessage(ws, data, clientState);
        } catch (error) {
          console.error(`[WS] 处理错误 [${clientId}]:`, error.message);
          this._send(ws, { type: "error", message: "处理出错" });
        }
      });

      ws.on("close", () => {
        console.log(`[WebSocket] 断开: ${clientId}`);
        this.clients.delete(ws);
      });

      ws.on("error", (error) => {
        console.error(`[WS] 连接错误 [${clientId}]:`, error.message);
        this.clients.delete(ws);
      });

      this._send(ws, {
        type: "connected",
        clientId,
        config: clientState.config,
        message: `已连接 (STT: ${config.sttEngine})`,
      });
    });
  }

  async _handleMessage(ws, data, state) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      // 非 JSON => 二进制音频 (whisper 模式)
      if (config.sttEngine === "whisper") {
        await this._handleAudioData(ws, data, state);
      }
      return;
    }

    switch (message.type) {
      case "stt_result":
        // browser 模式: 浏览器已识别文本，直接翻译
        await this._handleSttResult(ws, message, state);
        break;

      case "audio_chunk":
        // whisper 模式: 需要服务端做语音识别
        if (message.data) {
          const audioBuffer = Buffer.from(message.data, "base64");
          await this._handleAudioData(ws, audioBuffer, state);
        }
        break;

      case "audio_config":
        state.config = { ...state.config, ...message.config };
        this._send(ws, { type: "audio_config_ack", config: state.config });
        break;

      case "reset":
        this.translator.reset();
        state.audioBuffer = Buffer.alloc(0);
        this._send(ws, { type: "reset_ack" });
        console.log("[WebSocket] 会话已重置");
        break;

      case "ping":
        this._send(ws, { type: "pong" });
        break;
    }
  }

  /**
   * browser 模式: 处理前端 Web Speech API 识别结果
   */
  async _handleSttResult(ws, message, state) {
    const text = (message.text || "").trim();
    if (!text) return;

    // 去重: 忽略与上一条完全相同的文本
    if (state.lastSttText === text) return;
    state.lastSttText = text;

    console.log(`[浏览器STT] ${text}`);

    // 发送 STT 中间结果给前端
    this._send(ws, {
      type: "partial_stt",
      text,
      timestamp: Date.now(),
    });

    // 调用 stt 模块 (browser 模式仅做校验透传)
    const sttResult = await this.stt.transcribe(text);
    if (!sttResult.text) return;

    // 翻译
    const translationResult = await this.translator.translate(sttResult.text, {
      timestamp: Date.now(),
    });

    if (translationResult.translatedText) {
      console.log(`[翻译] ${translationResult.translatedText}`);

      this._send(ws, {
        type: "translation",
        segmentId: translationResult.segmentId,
        originalText: sttResult.text,
        translatedText: translationResult.translatedText,
        isCorrection: translationResult.isCorrection,
        corrections: translationResult.corrections || [],
        timestamp: Date.now(),
      });

      // 发送修正事件
      if (translationResult.isCorrection && translationResult.corrections) {
        for (const c of translationResult.corrections) {
          console.log(`[修正] ${c.originalText} → ${sttResult.text}`);
          this._send(ws, {
            type: "correction",
            originalSegmentId: c.originalSegmentId,
            originalText: c.originalText,
            originalTranslation: c.originalTranslation,
            correctedText: sttResult.text,
            correctedTranslation: translationResult.translatedText,
            correctionType: c.type,
            confidence: c.confidence,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  /**
   * whisper 模式: 处理音频数据
   */
  async _handleAudioData(ws, audioBuffer, state) {
    state.audioBuffer = Buffer.concat([state.audioBuffer, audioBuffer]);

    if (state.audioBuffer.length >= 16000 && !state.isProcessing) {
      if (Date.now() - state.lastProcessTime >= 3000) {
        await this._processAudioBuffer(ws, state);
      }
    }
  }

  async _processAudioBuffer(ws, state) {
    if (state.audioBuffer.length === 0) return;
    state.isProcessing = true;
    const buffer = state.audioBuffer;
    state.audioBuffer = Buffer.alloc(0);
    state.lastProcessTime = Date.now();

    try {
      const sttResult = await this.stt.transcribe(buffer, "webm");
      if (sttResult.text) {
        console.log(`[Whisper] ${sttResult.text}`);
        this._send(ws, {
          type: "partial_stt",
          text: sttResult.text,
          duration: sttResult.duration,
          timestamp: Date.now(),
        });

        const translationResult = await this.translator.translate(sttResult.text, {
          timestamp: Date.now(),
        });

        if (translationResult.translatedText) {
          console.log(`[翻译] ${translationResult.translatedText}`);
          this._send(ws, {
            type: "translation",
            segmentId: translationResult.segmentId,
            originalText: sttResult.text,
            translatedText: translationResult.translatedText,
            isCorrection: translationResult.isCorrection,
            corrections: translationResult.corrections || [],
            timestamp: Date.now(),
          });

          if (translationResult.isCorrection && translationResult.corrections) {
            for (const c of translationResult.corrections) {
              this._send(ws, {
                type: "correction",
                originalSegmentId: c.originalSegmentId,
                originalText: c.originalText,
                originalTranslation: c.originalTranslation,
                correctedText: sttResult.text,
                correctedTranslation: translationResult.translatedText,
                correctionType: c.type,
                confidence: c.confidence,
                timestamp: Date.now(),
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("[处理] 错误:", error.message);
    } finally {
      state.isProcessing = false;
    }
  }

  _send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}

module.exports = WebSocketManager;
