// public/js/app.js
// AI同声传译 - 主应用逻辑 (Web Speech API + DeepSeek 版 + TTS)
// 使用浏览器内置语音识别 + 后端翻译 + TTS语音朗读

class InterpretApp {
  constructor() {
    this.ws = null;
    this.speechCapture = null;
    this.subtitleManager = null;
    this.ttsManager = null;
    this.isConnected = false;
    this.isRecording = false;
    this.isDemoMode = false;
    this.serverUrl = "ws://localhost:3000";
    this._streamingTtsBuffer = new Map();

    this.elements = {
      btnRecord: document.getElementById("btnRecord"),
      btnReset: document.getElementById("btnReset"),
      btnClear: document.getElementById("btnClear"),
      btnExport: document.getElementById("btnExport"),
      exportFormat: document.getElementById("exportFormat"),
      btnConnect: document.getElementById("btnConnect"),
      btnTts: document.getElementById("btnTts"),
      statusIndicator: document.getElementById("statusIndicator"),
      statusText: document.getElementById("statusText"),
      speakingIndicator: document.getElementById("speakingIndicator"),
      sttBadge: document.getElementById("sttBadge"),
      transBadge: document.getElementById("transBadge"),
      sourceLang: document.getElementById("sourceLang"),
      targetLang: document.getElementById("targetLang"),
      connectModal: document.getElementById("connectModal"),
      serverUrl: document.getElementById("serverUrl"),
      visualizer: document.getElementById("audioVisualizer"),
    };
  }

  init() {
    this.subtitleManager = new SubtitleManager({ maxItems: 20 });

    // 初始化 TTS
    if (TTSManager.isSupported()) {
      this.ttsManager = new TTSManager();
      this.ttsManager.onSpeakingStateChange = (speaking) => {
        this._onTtsStateChange(speaking);
      };
      // 设置初始语言
      this.ttsManager.setLanguage(this.elements.targetLang.value);
    } else {
      console.warn("[TTS] 浏览器不支持语音合成");
      if (this.elements.btnTts) {
        this.elements.btnTts.disabled = true;
        this.elements.btnTts.textContent = "🔇 不支持";
      }
    }

    // 初始化 canvas
    this._resizeVisualizer();
    window.addEventListener("resize", () => this._resizeVisualizer());

    // 绑定事件
    this.elements.btnConnect.addEventListener("click", () => this.connect());
    this.elements.btnRecord.addEventListener("click", () => this.toggleRecording());
    this.elements.btnReset.addEventListener("click", () => this.resetSession());
    this.elements.btnClear.addEventListener("click", () => this.subtitleManager.clearAll());
    this.elements.btnExport.addEventListener("click", () => this.exportSubtitles());
    this.elements.sourceLang.addEventListener("change", () => this.updateLang());
    this.elements.targetLang.addEventListener("change", () => this.updateLangConfig());

    // TTS 开关
    if (this.elements.btnTts) {
      this.elements.btnTts.addEventListener("click", () => this.toggleTts());
    }

    this.elements.serverUrl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.connect();
    });

    if (!SpeechCapture.isSupported()) {
      alert("⚠️ 您的浏览器不支持 Web Speech API。\n请使用 Chrome 或 Edge 浏览器。");
      this.elements.btnRecord.disabled = true;
    }

    this._checkServerHealth();
    console.log("[应用] AI同声传译助手已初始化");
  }

  // =========== 连接管理 ===========

  async connect() {
    const url = this.elements.serverUrl.value.trim() || this.serverUrl;
    if (this.ws) { this.ws.close(); this.ws = null; }

    try {
      this._setStatus("connecting", "连接中...");

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this._setStatus("connected", this.isDemoMode ? "演示模式" : "已连接");
        this.elements.btnRecord.disabled = false;
        this.elements.connectModal.style.display = "none";
        this.updateLang();
        this.updateLangConfig();
      };

      this.ws.onmessage = (event) => {
        try {
          this._handleServerMessage(JSON.parse(event.data));
        } catch (e) {
          console.error("[WS] 解析失败:", e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this._setStatus("error", "已断开");
        this.elements.btnRecord.disabled = true;
        this.elements.connectModal.style.display = "flex";
        if (this.isRecording) this.stopRecording();
      };

      this.ws.onerror = () => {
        this._setStatus("error", "连接失败");
        this.elements.connectModal.style.display = "flex";
      };
    } catch (error) {
      console.error("[WS] 连接异常:", error);
    }
  }

  // =========== 录音管理 ===========

  async toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    if (!this.isConnected) { alert("请先连接到服务器"); return; }

    this.speechCapture = new SpeechCapture();

    this.speechCapture.onResult = (text) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: "stt_result",
          text,
          timestamp: Date.now(),
        }));
      }
    };

    this.speechCapture.onInterimResult = (text) => {
      this._showInterimText(text);
    };

    this.speechCapture.onVisualizationData = (data) => {
      this._drawVisualizer(data);
    };

    this.speechCapture.onError = (msg) => {
      console.error("[语音] 错误:", msg);
    };

    const lang = this.elements.sourceLang.value;
    const success = await this.speechCapture.start({ language: lang });

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

  stopRecording() {
    if (this.speechCapture) {
      this.speechCapture.stop();
      this.speechCapture = null;
    }

    this.isRecording = false;
    this.elements.btnRecord.classList.remove("recording");
    this.elements.btnRecord.querySelector(".btn-text").textContent = "开始录音";
    this.elements.btnRecord.querySelector(".btn-icon").textContent = "🎤";
    this._setStatus("connected", this.isDemoMode ? "演示模式" : "已连接");
    this.elements.sttBadge.textContent = "已停止";
    this.elements.transBadge.textContent = "已停止";
    this._drawIdleVisualizer();
    this._clearInterimText();
  }

  // =========== TTS 控制 ===========

  toggleTts() {
    if (!this.ttsManager) return;

    const enabled = this.ttsManager.toggle();
    const btn = this.elements.btnTts;
    if (btn) {
      btn.classList.toggle("active", enabled);
      btn.textContent = enabled ? "🔊 语音" : "🔇 静音";
    }

    if (!enabled) {
      this.elements.speakingIndicator.style.display = "none";
    }

    console.log(`[TTS] ${enabled ? "已开启" : "已关闭"}`);
  }

  _onTtsStateChange(speaking) {
    const indicator = this.elements.speakingIndicator;
    if (!indicator) return;

    if (speaking && this.ttsManager && this.ttsManager.enabled) {
      indicator.style.display = "inline-flex";
    } else {
      indicator.style.display = "none";
    }
  }

  // =========== 语言设置 ===========

  resetSession() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "reset" }));
    }
    if (this.ttsManager) this.ttsManager.stop();
    this.subtitleManager.clearAll();
    this._clearInterimText();
    this.elements.sttBadge.textContent = "等待输入...";
    this.elements.transBadge.textContent = "等待翻译...";
  }

  updateLang() {
    if (this.speechCapture && this.isRecording) {
      this.speechCapture.setLanguage(this.elements.sourceLang.value);
    }
    this.updateLangConfig();
  }

  updateLangConfig() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "audio_config",
        config: {
          sourceLang: this.elements.sourceLang.value,
          targetLang: this.elements.targetLang.value,
        },
      }));
    }
    // 同步更新 TTS 语言
    if (this.ttsManager) {
      this.ttsManager.setLanguage(this.elements.targetLang.value);
    }
  }

  // =========== 中间结果显示 ===========

  _showInterimText(text) {
    let interim = this.originalContainer?.querySelector(".interim-text");
    if (!interim) {
      interim = document.createElement("div");
      interim.className = "interim-text";
      const container = document.getElementById("originalContent");
      if (container) container.appendChild(interim);
    }
    interim.textContent = `🎤 ${text}`;
    this.elements.sttBadge.textContent = `聆听中...`;
  }

  _clearInterimText() {
    const el = document.querySelector(".interim-text");
    if (el) el.remove();
  }

  get originalContainer() {
    return document.getElementById("originalContent");
  }

  // =========== 消息处理 ===========

  // == 流式 TTS：按句子边界分段朗读 ===========

  /**
   * 从流式翻译文本中提取完整句子
   */
  _extractSentences(text) {
    const sentences = [];
    const re = /[^。！？.!?\n]+[。！？.!?\n]/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      sentences.push(match[0].trim());
    }
    return sentences;
  }

  /**
   * 流式翻译逐句朗读
   */
  _speakStreamingSentences(segmentId, partialText) {
    if (!this.ttsManager || !this.ttsManager.enabled) return;
    let entry = this._streamingTtsBuffer.get(segmentId);
    if (!entry) { entry = { spokenLen: 0 }; this._streamingTtsBuffer.set(segmentId, entry); }
    const newText = partialText.substring(entry.spokenLen);
    if (!newText) return;
    const sentences = this._extractSentences(newText);
    if (sentences.length > 0) {
      const lastSentence = sentences[sentences.length - 1];
      entry.spokenLen += newText.lastIndexOf(lastSentence) + lastSentence.length;
      for (const s of sentences) { this.ttsManager.speak(s); }
    }
  }

  /**
   * 翻译完成时朗读剩余文本
   */
  _flushStreamingTts(segmentId, fullText) {
    if (!this.ttsManager || !this.ttsManager.enabled) return;
    const entry = this._streamingTtsBuffer.get(segmentId);
    if (entry) {
      const remaining = fullText.substring(entry.spokenLen).trim();
      if (remaining) { this.ttsManager.speak(remaining); }
      this._streamingTtsBuffer.delete(segmentId);
    } else if (fullText) {
      this.ttsManager.speak(fullText);
    }
=======
  // =========== 导出字幕 ===========

  exportSubtitles() {
    const format = this.elements.exportFormat.value;
    this.subtitleManager.exportSubtitles(format);
  }

  _handleServerMessage(data) {
    switch (data.type) {
      case "connected":
        console.log("[服务器] 已连接");
        break;

      case "partial_stt":
        this.elements.sttBadge.textContent = `已识别 ${data.text.length}字`;
        this.subtitleManager.addOriginalText({
          text: data.text,
          timestamp: data.timestamp,
          segmentId: data.segmentId,
        });
        this._clearInterimText();
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

        // TTS: 朗读翻译结果（非修正内容不重复朗读）
        if (!data.isCorrection && this.ttsManager) {
          this._flushStreamingTts(data.segmentId, data.translatedText);
        }
        break;

      case "translation_chunk":
        // 流式翻译进度：实时显示翻译文本逐词展开
        if (data.partialText && data.segmentId) {
          this.subtitleManager.updateStreamingTranslation(data.segmentId, data.partialText);
        }
        break;

      case "correction":
        this.subtitleManager.addCorrection(data);
        break;

      case "error":
        console.error("[服务器] 错误:", data.message);
        break;

      case "reset_ack":
        console.log("[服务器] 已重置");
        break;

      case "pong":
        break;
    }
  }

  // =========== 可视化 ===========

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

  _drawVisualizer(data) {
    const canvas = this.elements.visualizer;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#1e1b4b";
    ctx.fillRect(0, 0, width, height);

    if (!data || data.length === 0) {
      this._drawIdleText(ctx, width, height);
      return;
    }

    const barCount = Math.min(data.length, 64);
    const barWidth = width / barCount;
    for (let i = 0; i < barCount; i++) {
      const value = data[i] / 255;
      const barHeight = Math.max(1, value * height);
      ctx.fillStyle = `hsl(${260 - value * 180}, 85%, ${40 + value * 40}%)`;
      ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    }
  }

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

  _drawIdleText(ctx, width, height) {
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "14px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (!this.isRecording) {
      ctx.fillText("点击「开始录音」— 浏览器自动识别语音", width / 2, height / 2);
    }
  }

  _setStatus(state, text) {
    this.elements.statusIndicator.className = "status-indicator";
    if (state !== "disconnected") this.elements.statusIndicator.classList.add(state);
    this.elements.statusText.textContent = text;
  }

  async _checkServerHealth() {
    const serverUrl = this.elements.serverUrl.value.trim() || this.serverUrl;
    const httpUrl = serverUrl.replace("ws://", "http://").replace("wss://", "https://");
    try {
      const resp = await fetch(`${httpUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const data = await resp.json();
        console.log("[应用] 后端服务:", data);
        this.isDemoMode = data.mode === "demo";

        if (this.isDemoMode) {
          this.elements.connectModal.querySelector("h2").textContent = "🎯 演示模式";
          this.elements.connectModal.querySelector("p").innerHTML =
            "服务器以<strong>演示模式</strong>运行。<br>可正常体验界面，无需 API Key。";
          this.elements.btnConnect.textContent = "🎯 进入演示模式";
        } else {
          const modeLabel = data.mode === "deepseek" ? "DeepSeek" : "OpenAI";
          this.elements.connectModal.querySelector("h2").textContent = `🚀 ${modeLabel} 模式`;
          this.elements.btnConnect.textContent = `✓ 进入${modeLabel}模式`;
        }
        this.connect();
      }
    } catch {
      console.log("[应用] 等待用户操作");
      this.elements.connectModal.style.display = "flex";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new InterpretApp();
  app.init();
  window.__app = app;
});
