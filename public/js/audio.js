// public/js/audio.js
// AI同声传译 - 音频捕获模块 (Web Speech API 版)
// 使用浏览器内置的 Web Speech API 进行语音识别
// 无需 API Key，免费使用，支持多语言
//
// 兼容性: Chrome 25+, Edge 79+, Safari 14.1+
// MDN: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

class SpeechCapture {
  constructor() {
    this.recognition = null;
    this.isCapturing = false;
    this.isListening = false;
    this.restartTimeout = null;
    this.audioContext = null;
    this.analyserNode = null;
    this.stream = null;
    this.animationId = null;

    // 回调
    this.onResult = null;         // 最终识别结果: function(text)
    this.onInterimResult = null;  // 中间识别结果: function(text)
    this.onVisualizationData = null;
    this.onError = null;

    // 语言映射
    this.langMap = {
      en: "en-US",
      zh: "zh-CN",
      ja: "ja-JP",
      ko: "ko-KR",
      fr: "fr-FR",
      de: "de-DE",
      es: "es-ES",
    };

    this.currentLang = "en-US";
    this.lastFinalText = "";
  }

  /**
   * 启动语音识别
   * @param {object} options
   * @param {string} options.language - ISO 639-1 语言代码
   * @returns {Promise<boolean>}
   */
  async start(options = {}) {
    if (this.isCapturing) {
      console.warn("[语音] 已在运行中");
      return false;
    }

    // 检查浏览器是否支持 Web Speech API
    if (!this._isSupported()) {
      const msg = "您的浏览器不支持 Web Speech API。请使用 Chrome 或 Edge。";
      console.error("[语音]", msg);
      if (this.onError) this.onError(msg);
      return false;
    }

    this.currentLang = this.langMap[options.language] || "en-US";

    try {
      // 获取麦克风权限 (用于可视化)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      // 设置音频分析器 (可视化)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      source.connect(this.analyserNode);

      this._startVisualization();

      // 启动 Web Speech API
      this._startRecognition();

      this.isCapturing = true;
      console.log(`[语音] Web Speech API 已启动 (${this.currentLang})`);
      return true;
    } catch (error) {
      console.error("[语音] 启动失败:", error);
      if (error.name === "NotAllowedError") {
        if (this.onError) this.onError("麦克风权限被拒绝");
      } else if (error.name === "NotFoundError") {
        if (this.onError) this.onError("未检测到麦克风");
      }
      return false;
    }
  }

  /**
   * 启动/重启 SpeechRecognition
   */
  _startRecognition() {
    if (this.isListening) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    this.recognition.lang = this.currentLang;
    this.recognition.continuous = true;    // 持续识别
    this.recognition.interimResults = true; // 返回中间结果
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      let interimText = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      // 发送中间结果 (用于实时显示)
      if (interimText && this.onInterimResult) {
        this.onInterimResult(interimText.trim());
      }

      // 发送最终结果 (用于翻译)
      if (finalText) {
        const trimmed = finalText.trim();
        // 去重: 避免发送重复的短片段
        if (trimmed && trimmed !== this.lastFinalText) {
          this.lastFinalText = trimmed;
          if (this.onResult) {
            this.onResult(trimmed);
          }
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.warn(`[语音] 识别错误: ${event.error}`);

      // 处理常见错误，自动恢复
      if (event.error === "no-speech" || event.error === "aborted") {
        // 静默重启
        this._scheduleRestart();
      } else if (event.error === "not-allowed") {
        if (this.onError) this.onError("语音识别被阻止，请允许麦克风权限");
      } else {
        this._scheduleRestart();
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      // 如果还在运行状态，自动重启
      if (this.isCapturing) {
        this._scheduleRestart();
      }
    };

    try {
      this.recognition.start();
      this.isListening = true;
      console.log("[语音] SpeechRecognition 已启动");
    } catch (error) {
      console.error("[语音] 启动识别失败:", error);
      this._scheduleRestart();
    }
  }

  /**
   * 安排重启 (识别断开后自动恢复)
   */
  _scheduleRestart() {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    if (!this.isCapturing) return;

    this.restartTimeout = setTimeout(() => {
      if (this.isCapturing && !this.isListening) {
        console.log("[语音] 自动重启识别...");
        this._startRecognition();
      }
    }, 300);
  }

  /**
   * 停止语音识别
   */
  stop() {
    this.isCapturing = false;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) { /* ignore */ }
      this.recognition = null;
    }

    this.isListening = false;

    // 停止可视化
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    this.lastFinalText = "";
    console.log("[语音] 已停止");
  }

  /**
   * 音频可视化循环
   */
  _startVisualization() {
    const draw = () => {
      if (!this.analyserNode) return;
      const data = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.analyserNode.getByteFrequencyData(data);
      if (this.onVisualizationData) this.onVisualizationData(data);
      this.animationId = requestAnimationFrame(draw);
    };
    draw();
  }

  /**
   * 更新识别语言 (运行时切换)
   */
  setLanguage(langCode) {
    this.currentLang = this.langMap[langCode] || "en-US";
    if (this.isCapturing && this.isListening) {
      // 重启识别以应用新语言
      if (this.recognition) {
        try { this.recognition.stop(); } catch (e) { /* ignore */ }
      }
      this.isListening = false;
      setTimeout(() => this._startRecognition(), 200);
    }
  }

  _isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  static isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
}

window.SpeechCapture = SpeechCapture;
