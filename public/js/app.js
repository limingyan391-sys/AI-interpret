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
    this.isDemoMode = false;
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

    // 初始化 canvas 尺寸
    this._resizeVisualizer();
    window.addEventListener("resize", () => this._resizeVisualizer());

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

    // 检查服务器状态并尝试自动连接
    this._checkServerHealth();

    console.log("[应用] AI同声传译助手已初始化");
  }

  /**
   * 连接到 WebSocket 服务
   */
  async connect() {
    const url = this.elements.serverUrl.value.trim() || this.serverUrl;

    // 如果已有连接,先关闭
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    try {
      this._setStatus("connecting", "连接中...");

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this._setStatus("connected", this.isDemoMode ? "演示模式" : "已连接");
        this.elements.btnRecord.disabled = false;
        this.elements.connectModal.style.display = "none";

        // 发送语言配置
        this._sendLangConfig();

        console.log(`[WebSocket] 已连接到服务器`);
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

        if (!this.isRecording) {
          this.elements.connectModal.style.display = "flex";
        }

        if (this.isRecording) {
          this.stopRecording();
        }

        console.log("[WebSocket] 连接已断开");
      };

      this.ws.onerror = () => {
        this._setStatus("error", "连接失败");
        this.elements.connectModal.style.display = "flex";

        if (!this.isDemoMode) {
          console.error("[WebSocket] 连接失败，请确认服务器已启动");
        }
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
      this._setStatus("connected", this.isDemoMode ? "演示模式" : "已连接");
    }

    this.elements.sttBadge.textContent = "已停止";
    this.elements.transBadge.textContent = "已停止";

    // 重置可视化
    this._drawIdleVisualizer();
  }

  /**
   * 重置会话
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
        if (data.message) {
          console.log(`[服务器] ${data.message}`);
        }
        break;

      case "partial_stt":
        this.elements.sttBadge.textContent = `已识别 ${data.text.length}字`;
        this.subtitleManager.addOriginalText({
          text: data.text,
          timestamp: data.timestamp,
          segmentId: data.segmentId,
        });
        break;

      case "translation":
        this.elements.transBadge.textContent = `${data.translatedText.length}字`;
        this.subtitleManager.addTranslation({
          translatedText: data.translatedText,
          originalText: data.originalText,
          segmentId: data.segmentId ? `trans_${data.segmentId}` : `trans_${Date.now()}`,
          isCorrection: data.isCorrection,
          corrections: data.corrections,
          timestamp: data.timestamp,
        });
        break;

      case "correction":
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
        console.log("[服务器] 未知消息类型:", data.type);
    }
  }

  /**
   * 调整 canvas 尺寸以适应容器
   */
  _resizeVisualizer() {
    const canvas = this.elements.visualizer;
    if (!canvas) return;

    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = 60 * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = "60px";

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    this._drawIdleVisualizer();
  }

  /**
   * 绘制音频可视化
   */
  _drawVisualizer(data) {
    const canvas = this.elements.visualizer;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, width, height);

    // 背景
    ctx.fillStyle = "#1e1b4b";
    ctx.fillRect(0, 0, width, height);

    if (!data || data.length === 0) {
      this._drawIdleText(ctx, width, height);
      return;
    }

    // 绘制频率柱状图
    const barCount = Math.min(data.length, 64);
    const barWidth = width / barCount;
    const barSpacing = 1;

    for (let i = 0; i < barCount; i++) {
      const value = data[i] / 255;
      const barHeight = Math.max(1, value * height);

      // 从紫色渐变到青色
      const hue = 260 - value * 180;
      ctx.fillStyle = `hsl(${hue}, 85%, ${40 + value * 40}%)`;

      ctx.fillRect(
        i * barWidth + barSpacing / 2,
        height - barHeight,
        barWidth - barSpacing,
        barHeight
      );
    }

    // 绘制底部水平指示线
    if (this.isRecording) {
      ctx.fillStyle = "rgba(16, 185, 129, 0.2)";
      ctx.fillRect(0, height - 2, width, 2);
    }
  }

  /**
   * 绘制空闲状态可视化
   */
  _drawIdleVisualizer() {
    const canvas = this.elements.visualizer;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#1e1b4b";
    ctx.fillRect(0, 0, width, height);

    this._drawIdleText(ctx, width, height);
  }

  /**
   * 绘制空闲提示文字
   */
  _drawIdleText(ctx, width, height) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.font = "14px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const text = this.isRecording ? "" : "点击「开始录音」查看音频可视化";
    if (text) {
      ctx.fillText(text, width / 2, height / 2);
    }

    // 绘制底部状态点
    if (this.isRecording) {
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.fillText("正在录音...", width / 2 + 10, height / 2);
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
   * 检查服务器健康状态，尝试自动连接
   */
  async _checkServerHealth() {
    const serverUrl = this.elements.serverUrl.value.trim() || this.serverUrl;
    const httpUrl = serverUrl.replace("ws://", "http://").replace("wss://", "https://");

    try {
      const response = await fetch(`${httpUrl}/api/health`, {
        // 快速超时
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("[应用] 后端服务:", data);

        this.isDemoMode = data.mode === "demo";

        if (this.isDemoMode) {
          this.elements.connectModal.querySelector("h2").textContent = "🎯 演示模式";
          this.elements.connectModal.querySelector("p").innerHTML =
            "服务器以<strong>演示模式</strong>运行，使用模拟数据。<br>可正常体验界面，无需 API Key。";
          this.elements.btnConnect.textContent = "🎯 进入演示模式";
        } else {
          this.elements.btnConnect.textContent = "✓ 已配置 API Key";
        }

        // 自动连接
        this.connect();
      }
    } catch {
      // 服务器未启动，等待用户手动连接
      console.log("[应用] 服务器未启动，等待用户操作");
      this.elements.connectModal.style.display = "flex";
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
