// server/websocket.js
// AI同声传译 - WebSocket 通信模块
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

    // 存储所有活跃连接及音频缓冲区
    this.clients = new Map();

    this._setupHandlers();
    console.log("[WebSocket] 服务已启动");
  }

  _setupHandlers() {
    this.wss.on("connection", (ws, req) => {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.log(`[WebSocket] 客户端连接: ${clientId} (${req.socket.remoteAddress})`);

      // 每个连接的音频缓冲区
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

      // 发送连接确认和配置信息
      this._sendToClient(ws, {
        type: "connected",
        clientId,
        config: clientState.config,
        message: "已连接到AI同声传译服务",
      });
    });
  }

  async _handleMessage(ws, data, state) {
    // 尝试解析为JSON (控制消息)
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      // 不是JSON => 视为二进制音频数据
      await this._handleAudioData(ws, data, state);
      return;
    }

    // 处理控制消息
    switch (message.type) {
      case "audio_config":
        // 配置音频参数
        state.config = { ...state.config, ...message.config };
        this._sendToClient(ws, {
          type: "audio_config_ack",
          config: state.config,
        });
        break;

      case "audio_chunk":
        // 音频数据块 (base64编码)
        if (message.data) {
          const audioBuffer = Buffer.from(message.data, "base64");
          await this._handleAudioData(ws, audioBuffer, state);
        }
        break;

      case "audio_end":
        // 音频流结束 - 处理剩余缓冲区
        if (state.audioBuffer.length > 0) {
          await this._processAudioBuffer(ws, state);
        }
        this._sendToClient(ws, { type: "audio_end_ack" });
        break;

      case "reset":
        // 重置翻译上下文
        this.translator.reset();
        state.audioBuffer = Buffer.alloc(0);
        state.pendingSegments = [];
        this._sendToClient(ws, { type: "reset_ack" });
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
    // 累积音频数据
    state.audioBuffer = Buffer.concat([state.audioBuffer, audioBuffer]);

    // 如果缓冲区足够大或距离上次处理超过一定时间，触发处理
    const minChunkSize = 16000; // ~1秒的16kHz音频
    const maxInterval = 3000; // 最大间隔3秒

    if (
      state.audioBuffer.length >= minChunkSize &&
      !state.isProcessing
    ) {
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

        // 向客户端发送部分识别结果
        this._sendToClient(ws, {
          type: "partial_stt",
          text: sttResult.text,
          duration: sttResult.duration,
          timestamp: Date.now(),
        });

        // 步骤2: 翻译
        const translationResult = await this.translator.translate(sttResult.text, {
          timestamp: Date.now(),
        });

        if (translationResult.translatedText) {
          console.log(`[翻译] ${translationResult.translatedText}`);

          // 发送翻译结果
          this._sendToClient(ws, {
            type: "translation",
            segmentId: translationResult.segmentId,
            originalText: sttResult.text,
            translatedText: translationResult.translatedText,
            isCorrection: translationResult.isCorrection,
            timestamp: Date.now(),
          });

          // 如果有修正，发送修正通知
          if (translationResult.isCorrection && translationResult.corrections) {
            for (const correction of translationResult.corrections) {
              this._sendToClient(ws, {
                type: "correction",
                originalSegmentId: correction.originalSegmentId,
                originalText: correction.originalText,
                originalTranslation: correction.originalTranslation,
                correctedTranslation: translationResult.translatedText,
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

  /**
   * 广播给所有连接的客户端
   */
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
