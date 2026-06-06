// public/js/audio.js
// AI同声传译 - 音频捕获模块
// 使用浏览器 MediaRecorder API 捕获麦克风音频
// MDN参考: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder

class AudioCapture {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.audioContext = null;
    this.analyserNode = null;
    this.isCapturing = false;
    this.onAudioChunk = null; // 回调: function(audioBlob)
    this.onVisualizationData = null; // 回调: function(frequencyData)

    this.chunkInterval = 3000; // 每3秒发送一个音频块
    this.intervalId = null;
    this.animationId = null;
  }

  /**
   * 请求麦克风权限并启动音频捕获
   * @param {object} options
   * @param {number} options.chunkInterval - 音频块间隔(ms)，默认3000
   * @returns {Promise<boolean>} 是否成功启动
   */
  async start(options = {}) {
    if (this.isCapturing) {
      console.warn("[音频] 已在捕获中");
      return false;
    }

    this.chunkInterval = options.chunkInterval || 3000;

    try {
      // 请求麦克风权限
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      console.log("[音频] 麦克风权限已获取");

      // 设置音频分析器 (用于可视化)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      source.connect(this.analyserNode);

      // 启动可视化
      this._startVisualization();

      // 启动 MediaRecorder
      const mimeType = this._getSupportedMimeType();
      console.log(`[音频] 使用编码格式: ${mimeType}`);

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 64000,
      });

      // 收集音频数据
      let audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      // 每个 chunk 完成时触发
      this.mediaRecorder.onstop = () => {
        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          audioChunks = [];

          if (this.onAudioChunk) {
            this.onAudioChunk(audioBlob);
          }
        }
      };

      // 开始录制: 按间隔产生数据块
      this.mediaRecorder.start(this.chunkInterval);

      // 额外定时器确保即使 MediaRecorder 未按时触发也能发送
      this.intervalId = setInterval(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
          this.mediaRecorder.stop();
          // 立即开始新一段录制
          audioChunks = [];
          this.mediaRecorder.start(this.chunkInterval);
        }
      }, this.chunkInterval);

      this.isCapturing = true;
      console.log("[音频] 音频捕获已启动");
      return true;
    } catch (error) {
      console.error("[音频] 启动失败:", error);

      if (error.name === "NotAllowedError") {
        alert("麦克风权限被拒绝，请在浏览器设置中允许麦克风访问");
      } else if (error.name === "NotFoundError") {
        alert("未检测到麦克风设备，请连接麦克风后重试");
      }

      return false;
    }
  }

  /**
   * 停止音频捕获
   */
  stop() {
    if (!this.isCapturing) return;

    // 停止录制
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    // 停止定时器
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // 停止可视化
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // 释放音频资源
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.isCapturing = false;
    this.mediaRecorder = null;
    console.log("[音频] 音频捕获已停止");
  }

  /**
   * 获取支持的音频 MIME 类型
   */
  _getSupportedMimeType() {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return ""; // 让浏览器选择默认格式
  }

  /**
   * 启动音频可视化 (绘制频率波形)
   */
  _startVisualization() {
    const draw = () => {
      if (!this.analyserNode) return;

      const bufferLength = this.analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyserNode.getByteFrequencyData(dataArray);

      if (this.onVisualizationData) {
        this.onVisualizationData(dataArray);
      }

      this.animationId = requestAnimationFrame(draw);
    };

    draw();
  }
}

// 导出全局对象
window.AudioCapture = AudioCapture;
