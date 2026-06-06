// public/js/app.js
// AI同声传译 - 主应用逻辑
// 协调 WebSocket 通信、音频捕获和字幕显示

class InterpretApp {
  constructor() {
    this.ws = null;
    this.audioCapture = null;
    this.subtitleManager = null;
    this.isConnected = false;
    this.isRecording = false;
    this.serverUrl = "ws://localhost:3000";

    // DOM 元素引用
    this.elements = {
      btnRecord: document.getElementById("btnRecord"),
      btnReset: document.getElementById("btnReset"),
      btnClear: document.getElementById("btnClear"),
      btnConnect: document.getElementById("btnConnect"),
      statusIndicator: document.getElementById("statusIndicator"),
      statusText: document.getElementById("statusText"),
      sttBadge: document.getElementById("sttBadge"),
      transBadge: document.getElementById("transBadge"),
      sourceLang: document.getElementById("sourceLang"),
      targetLang: document.getElementById("targetLang"),
      connectModal: document.getElementById("connectModal"),
      serverUrl: document.getElementById("serverUrl"),
      visualizer: document.getElementById("audioVisualizer"),
    };
  }

  /**
   * 初始化应用
   */
  init() {
    this.subtitleManager = new SubtitleManager({ maxItems: 20 });

    // 绑定事件
    this.elements.btnConnect.addEventListener("click", () => this.connect());
    this.elements.btnRecord.addEventListener("click", () => this.toggleRecording());
    this.elements.btnReset.addEventListener("click", () => this.resetSession());
    this.elements.btnClear.addEventListener("click", () => this.subtitleManager.clearAll());
    this.elements.sourceLang.addEventListener("change", () => this.updateLangConfig());
    this.elements.targetLang.addEventListener("change", () => this.updateLangConfig());

    // 回车键连接
    this.elements.serverUrl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.connect();
    });

    // 检查是否已有服务运行
    this._checkServerHealth();

    console.log("[应用] AI同声传译助手已初始化");
    console.log("[应用] 请点击「连接」按钮连接到后端服务");
  }

  /**
   * 连接到 WebSocket 服务
   */
  async connect() {
    const url = this.elements.serverUrl.value.trim() || this.serverUrl;

    try {
      this._setStatus("connecting", "连接中...");

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this._setStatus("connected", "已连接");
        this.elements.btnRecord.disabled = false;
        this.elements.connectModal.style.display = "none";

        // 发送语言配置
        this._sendLangConfig();
        console.log("[WebSocket] 已连接到服务器");
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this._handleServerMessage(data);
        } catch (error) {
          console.error("[WebSocket] 消息解析失败:", error);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this._setStatus("error", "已断开");
        this.elements.btnRecord.disabled = true;
        this.elements.connectModal.style.display = "flex";

        if (this.isRecording) {
          this.stopRecording();
        }

        console.log("[WebSocket] 连接已断开");
      };

      this.ws.onerror = (error) => {
        console.error("[WebSocket] 连接错误:", error);
        this._setStatus("error", "连接失败");
        alert(`无法连接到服务器 (${url})\n请确保后端服务已启动: npm start`);
      };
    } catch (error) {
      console.error("[WebSocket] 连接异常:", error);
      this._setStatus("error", "连接异常");
    }
  }

  /**
   * 切换录音状态
   */
  async toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  /**
   * 开始录音
   */
  async startRecording() {
    if (!this.isConnected) {
      alert("请先连接到服务器");
      return;
    }

    this.audioCapture = new AudioCapture();

    // 设置音频块回调：通过WebSocket发送到服务器
    this.audioCapture.onAudioChunk = async (audioBlob) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          // 将音频 blob 转换为 base64 发送
          const buffer = await audioBlob.arrayBuffer();
          const base64 = this._arrayBufferToBase64(buffer);
          const format = audioBlob.type.split("/")[1]?.split(";")[0] || "webm";

          this.ws.send(JSON.stringify({
            type: "audio_chunk",
            data: base64,
            format: format,
            timestamp: Date.now(),
          }));
        } catch (error) {
          console.error("[音频] 发送失败:", error);
        }
      }
    };

    // 设置可视化回调
    this.audioCapture.onVisualizationData = (data) => {
      this._drawVisualizer(data);
    };

    const success = await this.audioCapture.start({
      chunkInterval: 3000,
    });

    if (success) {
      this.isRecording = true;
      this.elements.btnRecord.classList.add("recording");
      this.elements.btnRecord.querySelector(".btn-text").textContent = "停止录音";
      this.elements.btnRecord.querySelector(".btn-icon").textContent = "⏹️";
      this._setStatus("recording", "录音中...");
      this.elements.sttBadge.textContent = "聆听中...";
      this.elements.transBadge.textContent = "翻译中...";
    }
  }

  /**
   * 停止录音
   */
  stopRecording() {
    if (this.audioCapture) {
      this.audioCapture.stop();
      this.audioCapture = null;
    }

    this.isRecording = false;
    this.elements.btnRecord.classList.remove("recording");
    this.elements.btnRecord.querySelector(".btn-text").textContent = "开始录音";
    this.elements.btnRecord.querySelector(".btn-icon").textContent = "🎤";

    if (this.isConnected) {
      this._setStatus("connected", "已连接");
    }

    this.elements.sttBadge.textContent = "已停止";
    this.elements.transBadge.textContent = "已停止";
  }

  /**
   * 重置会话 (清空翻译上下文)
   */
  resetSession() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "reset" }));
    }
    this.subtitleManager.clearAll();
    this.elements.sttBadge.textContent = "等待输入...";
    this.elements.transBadge.textContent = "等待翻译...";
    console.log("[应用] 会话已重置");
  }

  /**
   * 更新语言配置
   */
  updateLangConfig() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._sendLangConfig();
    }
  }

  _sendLangConfig() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "audio_config",
        config: {
          sourceLang: this.elements.sourceLang.value,
          targetLang: this.elements.targetLang.value,
        },
      }));
    }
  }

  /**
   * 处理服务器消息
   */
  _handleServerMessage(data) {
    switch (data.type) {
      case "connected":
        console.log(`[服务器] 已连接, ID: ${data.clientId}`);
        break;

      case "partial_stt":
        // 更新原文识别状态
        this.elements.sttBadge.textContent = `已识别 ${data.text.length}字`;
        this.subtitleManager.addOriginalText({
          text: data.text,
          timestamp: data.timestamp,
          segmentId: data.segmentId,
        });
        break;

      case "translation":
        // 显示翻译结果
        this.elements.transBadge.textContent = `${data.translatedText.length}字`;
        this.subtitleManager.addTranslation({
          translatedText: data.translatedText,
          originalText: data.originalText,
          segmentId: data.segmentId,
          isCorrection: data.isCorrection,
          timestamp: data.timestamp,
        });
        break;

      case "correction":
        // 显示修正通知
        this.subtitleManager.addCorrection({
          originalSegmentId: data.originalSegmentId,
          originalText: data.originalText,
          originalTranslation: data.originalTranslation,
          correctedTranslation: data.correctedTranslation,
          timestamp: data.timestamp,
        });
        break;

      case "reset_ack":
        console.log("[服务器] 会话已重置");
        break;

      case "error":
        console.error("[服务器] 错误:", data.message);
        break;

      case "pong":
        break;

      default:
        console.log("[服务器] 未知消息:", data.type);
    }
  }

  /**
   * 绘制音频可视化
   */
  _drawVisualizer(data) {
    const canvas = this.elements.visualizer;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 绘制背景
    ctx.fillStyle = "#1e1b4b";
    ctx.fillRect(0, 0, width, height);

    // 绘制频率柱
    const barCount = Math.min(data.length, 64);
    const barWidth = width / barCount;

    for (let i = 0; i < barCount; i++) {
      const value = data[i] / 255;
      const barHeight = value * height;

      // 颜色渐变
      const hue = 240 - value * 180;
      ctx.fillStyle = `hsl(${hue}, 80%, ${50 + value * 30}%)`;

      ctx.fillRect(
        i * barWidth,
        height - barHeight,
        barWidth - 1,
        barHeight
      );
    }
  }

  /**
   * 设置连接状态指示
   */
  _setStatus(state, text) {
    const indicator = this.elements.statusIndicator;
    const statusText = this.elements.statusText;

    indicator.className = "status-indicator";
    if (state !== "disconnected") {
      indicator.classList.add(state);
    }
    statusText.textContent = text;
  }

  /**
   * 检查服务器健康状态
   */
  async _checkServerHealth() {
    try {
      const httpUrl = this.elements.serverUrl.value.replace("ws://", "http://").replace("wss://", "https://");
      const response = await fetch(`${httpUrl}/api/health`);
      if (response.ok) {
        const data = await response.json();
        console.log("[应用] 后端服务运行中:", data);

        if (data.config.apiKeyConfigured) {
          this.elements.btnConnect.textContent = "✓ 自动连接";
          this.connect();
        } else {
          console.warn("[应用] API Key 未配置，请创建 .env 文件");
        }
      }
    } catch {
      // 服务未启动，等待用户点击连接
      console.log("[应用] 等待用户连接...");
    }
  }

  /**
   * ArrayBuffer 转 Base64
   */
  _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

// ====================================
// 启动应用
// ====================================
document.addEventListener("DOMContentLoaded", () => {
  const app = new InterpretApp();
  app.init();

  // 暴露到全局以便调试
  window.__app = app;
});
