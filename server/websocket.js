// server/websocket.js
// AI同声传译 - WebSocket 通信模块 (增强修正事件)
// 管理客户端连接、音频流接收和结果推送
// 依赖: ws (https://www.npmjs.com/package/ws)

const WebSocket = require("ws");
const config = require("./config");

class WebSocketManager {
  constructor(server, stt, translator) {
    this.stt = stt;
    this.translator = translator;

    this.wss = new WebSocket.Server({
      server,
      maxPayload: config.server.wsMaxPayload,
    });

    this.clients = new Map();
    this._setupHandlers();
    console.log("[WebSocket] 服务已启动");
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
        pendingSegments: [],
        config: {
          sourceLang: config.stt.language,
          targetLang: config.translation.targetLang,
        },
      };
      this.clients.set(ws, clientState);

      ws.on("message", async (data) => {
        try {
          await this._handleMessage(ws, data, clientState);
        } catch (error) {
          console.error(`[WebSocket] 消息处理错误 [${clientId}]:`, error.message);
          this._sendToClient(ws, {
            type: "error",
            message: "处理出错: " + error.message,
          });
        }
      });

      ws.on("close", () => {
        console.log(`[WebSocket] 客户端断开: ${clientId}`);
        this.clients.delete(ws);
      });

      ws.on("error", (error) => {
        console.error(`[WebSocket] 连接错误 [${clientId}]:`, error.message);
        this.clients.delete(ws);
      });

      this._sendToClient(ws, {
        type: "connected",
        clientId,
        config: clientState.config,
        message: "已连接到AI同声传译服务",
      });
    });
  }

  async _handleMessage(ws, data, state) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      await this._handleAudioData(ws, data, state);
      return;
    }

    switch (message.type) {
      case "audio_config":
        state.config = { ...state.config, ...message.config };
        this._sendToClient(ws, { type: "audio_config_ack", config: state.config });
        break;

      case "audio_chunk":
        if (message.data) {
          const audioBuffer = Buffer.from(message.data, "base64");
          await this._handleAudioData(ws, audioBuffer, state);
        }
        break;

      case "audio_end":
        if (state.audioBuffer.length > 0) {
          await this._processAudioBuffer(ws, state);
        }
        this._sendToClient(ws, { type: "audio_end_ack" });
        break;

      case "reset":
        this.translator.reset();
        state.audioBuffer = Buffer.alloc(0);
        state.pendingSegments = [];
        this._sendToClient(ws, { type: "reset_ack" });
        console.log("[WebSocket] 会话已重置");
        break;

      case "ping":
        this._sendToClient(ws, { type: "pong" });
        break;

      default:
        this._sendToClient(ws, {
          type: "error",
          message: `未知消息类型: ${message.type}`,
        });
    }
  }

  async _handleAudioData(ws, audioBuffer, state) {
    state.audioBuffer = Buffer.concat([state.audioBuffer, audioBuffer]);

    const minChunkSize = 16000;
    const maxInterval = 3000;

    if (state.audioBuffer.length >= minChunkSize && !state.isProcessing) {
      const now = Date.now();
      if (now - state.lastProcessTime >= maxInterval) {
        await this._processAudioBuffer(ws, state);
      }
    }
  }

  async _processAudioBuffer(ws, state) {
    if (state.audioBuffer.length === 0) return;

    state.isProcessing = true;
    const bufferToProcess = state.audioBuffer;
    state.audioBuffer = Buffer.alloc(0);
    state.lastProcessTime = Date.now();

    try {
      // 步骤1: 语音识别
      const sttResult = await this.stt.transcribe(bufferToProcess, "webm");

      if (sttResult.text) {
        console.log(`[识别] ${sttResult.text}`);

        // 发送识别结果
        this._sendToClient(ws, {
          type: "partial_stt",
          text: sttResult.text,
          duration: sttResult.duration,
          isCorrection: sttResult.isCorrection || false,
          timestamp: Date.now(),
        });

        // 步骤2: 翻译 (含修正检测)
        const translationResult = await this.translator.translate(sttResult.text, {
          timestamp: Date.now(),
        });

        if (translationResult.translatedText) {
          console.log(`[翻译] ${translationResult.translatedText}`);

          // 发送翻译结果 (包含修正信息)
          this._sendToClient(ws, {
            type: "translation",
            segmentId: translationResult.segmentId,
            originalText: sttResult.text,
            translatedText: translationResult.translatedText,
            isCorrection: translationResult.isCorrection,
            corrections: translationResult.corrections || [],
            timestamp: Date.now(),
          });

          // 如果有修正，发送独立的修正事件 (每条修正一条)
          if (translationResult.isCorrection && translationResult.corrections) {
            for (const correction of translationResult.corrections) {
              console.log(`[修正] ${correction.originalText} → ${sttResult.text}`);
              this._sendToClient(ws, {
                type: "correction",
                originalSegmentId: correction.originalSegmentId,
                originalText: correction.originalText,
                originalTranslation: correction.originalTranslation,
                correctedText: sttResult.text,
                correctedTranslation: translationResult.translatedText,
                correctionType: correction.type || "rephrase",
                confidence: correction.confidence || 80,
                timestamp: Date.now(),
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("[处理] 音频处理错误:", error.message);
    } finally {
      state.isProcessing = false;
    }
  }

  _sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

module.exports = WebSocketManager;
