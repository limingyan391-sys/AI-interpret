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
    this.onAudioChunk = null;
    this.onVisualizationData = null;

    this.chunkInterval = 3000;
    this.intervalId = null;
    this.animationId = null;
  }

  /**
   * 请求麦克风权限并启动音频捕获
   * @param {object} options
   * @param {number} options.chunkInterval - 音频块间隔(ms)
   * @returns {Promise<boolean>}
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

      // 设置音频分析器
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

      let audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          audioChunks = [];

          if (this.onAudioChunk) {
            this.onAudioChunk(audioBlob);
          }
        }
      };

      // 使用 timeslice 参数让 MediaRecorder 按间隔产生数据块
      // 避免手动 stop/start 导致的音频间隙
      try {
        this.mediaRecorder.start(this.chunkInterval);
      } catch (e) {
        // 如果浏览器不支持 timeslice 参数，回退到手动模式
        console.warn("[音频] timeslice 模式不支持，回退到手动分段");
        this.mediaRecorder.start();
        this.intervalId = setInterval(() => {
          if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
            this.mediaRecorder.stop();
            audioChunks = [];
            try {
              this.mediaRecorder.start(this.chunkInterval);
            } catch {
              this.mediaRecorder.start();
            }
          }
        }, this.chunkInterval);
      }

      this.isCapturing = true;
      console.log("[音频] 音频捕获已启动");
      return true;
    } catch (error) {
      console.error("[音频] 启动失败:", error);

      if (error.name === "NotAllowedError") {
        alert("麦克风权限被拒绝，请在浏览器设置中允许麦克风访问");
      } else if (error.name === "NotFoundError") {
        alert("未检测到麦克风设备，请连接麦克风后重试");
      } else if (error.name === "NotReadableError") {
        alert("麦克风被其他应用占用，请关闭其他录音程序后重试");
      }

      return false;
    }
  }

  /**
   * 停止音频捕获
   */
  stop() {
    if (!this.isCapturing) return;

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

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

    return "";
  }

  /**
   * 启动音频可视化循环
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
