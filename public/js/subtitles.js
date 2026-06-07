// public/js/subtitles.js
// AI同声传译 - 字幕显示模块 (增强修正显示)
// 管理原文和翻译结果的字幕渲染，支持原位修正更新和修正动画

class SubtitleManager {
  constructor(options = {}) {
    this.originalContainer = document.getElementById("originalContent");
    this.translationContainer = document.getElementById("translationContent");
    this.correctionList = document.getElementById("correctionList");
    this.correctionPanel = document.getElementById("correctionPanel");

    this.maxItems = options.maxItems || 20;
    this.translationItemMap = new Map();
    this.originalItemMap = new Map();
    this.streamingItemMap = new Map();

    this.timeFormatter = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  /**
   * 添加/更新原文识别结果
   */
  addOriginalText(data) {
    if (!data.text || !data.text.trim()) return;
    const segmentId = data.segmentId || `orig_${Date.now()}`;

    // 修正原位更新
    if (data.isCorrection) {
      const existingItem = this.originalItemMap.get(segmentId);
      if (existingItem) {
        this._updateItemText(existingItem, data.text, false);
        return;
      }
    }

    // 去重: 检查最后一条
    const lastItem = this.originalContainer.querySelector(".subtitle-item:last-child");
    if (lastItem) {
      const lastText = lastItem.dataset.text || "";
      if (this._isDuplicate(lastText, data.text)) {
        return;
      }
    }

    const time = this._formatTime(data.timestamp);
    const item = this._createItem({
      text: data.text, time, type: "original", segmentId,
    });

    if (data.isCorrection) item.classList.add("correction");

    this.originalContainer.appendChild(item);
    this.originalItemMap.set(segmentId, item);
    this._trimContainer(this.originalContainer);
    this._scrollToBottom(this.originalContainer);
  }

  /**
   * 添加翻译结果，支持原位修正
   */
  addTranslation(data) {
    if (!data.translatedText || !data.translatedText.trim()) return;
    const segmentId = data.segmentId || `trans_${Date.now()}`;

    // 处理修正: 更新之前被修正的条目
    if (data.isCorrection && data.corrections && data.corrections.length > 0) {
      for (const correction of data.corrections) {
        const targetSegmentId = `trans_${correction.originalSegmentId}`;
        const existingItem = this.translationItemMap.get(targetSegmentId);
        if (existingItem) {
          this._updateItemText(existingItem, data.translatedText, true);
          // 更新原文显示行
          const origTargetId = `orig_${correction.originalSegmentId}`;
          const origItem = this.originalItemMap.get(origTargetId);
          if (origItem) {
            this._updateItemText(origItem, correction.newText || data.originalText, true);
          }
        }
      }
    }

    // 清除对应的流式条目
    const streamKey = "stream_" + segmentId.replace(/^trans_/, "");
    const streamItem = this.streamingItemMap.get(streamKey);
    if (streamItem) {
      streamItem.remove();
      this.streamingItemMap.delete(streamKey);
    }
    // 检查是否已有相同 segmentId 的条目
    const existingItem = this.translationItemMap.get(segmentId);
    if (existingItem) {
      this._updateItemText(existingItem, data.translatedText, data.isCorrection);
      return;
    }

    // 去重
    const lastItem = this.translationContainer.querySelector(".subtitle-item:last-child");
    if (lastItem) {
      const lastText = lastItem.querySelector(".item-text")?.textContent?.trim() || "";
      if (lastText === data.translatedText) return;
    }

    const time = this._formatTime(data.timestamp);
    const item = this._createItem({
      text: data.translatedText,
      originalText: data.originalText,
      time, type: "translated", segmentId,
    });

    if (data.isCorrection) {
      item.classList.add("correction");
      this._addCorrectionBadge(item);
    }

    this.translationContainer.appendChild(item);
    this.translationItemMap.set(segmentId, item);
    this._trimContainer(this.translationContainer);
    this._scrollToBottom(this.translationContainer);
  }

  /**
   * 流式更新翻译文本
   */
  updateStreamingTranslation(segmentId, partialText) {
    if (!segmentId || !partialText) return;
    const key = "stream_" + segmentId;
    let item = this.streamingItemMap.get(key);
    if (item) {
      const textEl = item.querySelector(".item-text");
      if (textEl && textEl.textContent !== partialText) {
        textEl.textContent = partialText;
      }
      return;
    }
    const time = this._formatTime(Date.now());
    const div = document.createElement("div");
    div.className = "subtitle-item streaming";
    div.dataset.segmentId = key;
    const timeEl = document.createElement("span");
    timeEl.className = "item-time";
    timeEl.textContent = time;
    const label = document.createElement("span");
    label.className = "item-label translated";
    label.textContent = "翻译中...";
    const textEl = document.createElement("span");
    textEl.className = "item-text streaming-cursor";
    textEl.textContent = partialText;
    div.appendChild(timeEl);
    div.appendChild(label);
    div.appendChild(textEl);
    this.translationContainer.appendChild(div);
    this.streamingItemMap.set(key, div);
    this._scrollToBottom(this.translationContainer);
  }

  /**
   * 原位更新字幕文本
   */
  _updateItemText(item, newText, isCorrection) {
    const textEl = item.querySelector(".item-text");
    if (!textEl) return;
    if (textEl.textContent === newText) return;

    textEl.textContent = newText;

    if (isCorrection) {
      item.classList.add("correction");
      if (!item.querySelector(".item-correction-badge")) {
        this._addCorrectionBadge(item);
      }
      // 触发重新动画
      item.style.animation = "none";
      void item.offsetHeight;
      item.style.animation = "correctionFlash 0.5s ease-out";
    }

    const timeEl = item.querySelector(".item-time");
    if (timeEl) timeEl.textContent = this._formatTime(Date.now());
  }

  _addCorrectionBadge(item) {
    const badge = document.createElement("span");
    badge.className = "item-correction-badge";
    badge.textContent = "🔄 已修正";
    const textEl = item.querySelector(".item-text");
    if (textEl) textEl.appendChild(badge);
  }

  /**
   * 添加修正通知到修正面板
   */
  addCorrection(data) {
    this.correctionPanel.style.display = "block";

    const time = this._formatTime(data.timestamp);
    const item = document.createElement("div");
    item.className = "correction-item";

    // 构建修正类型标签
    const typeLabels = {
      rephrase: "改述",
      expansion: "补充",
      refinement: "精炼",
    };
    const typeLabel = typeLabels[data.correctionType] || "修正";

    item.innerHTML = `
      [${time}] <span class="correction-type">${typeLabel}</span>
      <span class="old">${this._escapeHtml(data.originalTranslation || data.originalText)}</span>
      → <span class="new">${this._escapeHtml(data.correctedTranslation)}</span>
      ${data.confidence ? `<span class="correction-confidence">${data.confidence}%</span>` : ""}
    `;

    this.correctionList.appendChild(item);
    this._scrollToBottom(this.correctionList);

    while (this.correctionList.children.length > 10) {
      this.correctionList.removeChild(this.correctionList.firstChild);
    }
  }

  /**
   * 检查两条文本是否重复
   */
  _isDuplicate(textA, textB) {
    if (!textA || !textB) return false;
    if (textA === textB) return true;
    const short = textA.length <= textB.length ? textA : textB;
    const long = textA.length > textB.length ? textA : textB;
    return short.length > long.length * 0.5 && long.includes(short);
  }

  /**
   * 导出字幕文件
   * @param {string} format - "srt" 或 "txt"
   */
  exportSubtitles(format = "srt") {
    const items = this.translationContainer.querySelectorAll(".subtitle-item");
    if (items.length === 0) {
      alert("没有可导出的字幕内容");
      return;
    }

    let content = "";
    let filename = "";
    let mimeType = "text/plain;charset=utf-8";
    let index = 1;

    for (const item of items) {
      const timeEl = item.querySelector(".item-time");
      const textEl = item.querySelector(".item-text");
      if (!timeEl || !textEl) continue;

      const time = timeEl.textContent;
      const translated = textEl.textContent;

      // 原文在 📝 提示中，或从 dataset 获取
      let original = "";
      const hint = item.querySelector("div[style]");
      if (hint && hint.textContent.startsWith("📝")) {
        original = hint.textContent.replace("📝 ", "");
      }

      if (!original && item.dataset.text) {
        original = item.dataset.text;
      }

      if (!translated && !original) continue;

      if (format === "srt") {
        // SRT 格式
        const [h, m, s] = time.split(":").map(Number);
        const startSec = (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
        const endSec = startSec + 3; // 每条字幕默认3秒
        const fmtTime = (sec) => {
          const hh = String(Math.floor(sec / 3600)).padStart(2, "0");
          const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
          const ss = String(Math.floor(sec % 60)).padStart(2, "0");
          return `${hh}:${mm}:${ss},000`;
        };
        content += `${index}\n`;
        content += `${fmtTime(startSec)} --> ${fmtTime(endSec)}\n`;
        if (original) content += `${original}\n`;
        content += `${translated}\n\n`;
        filename = "subtitles.srt";
      } else {
        // TXT 格式
        content += `[${time}]\n`;
        if (original) content += `原文: ${original}\n`;
        content += `译文: ${translated}\n\n`;
        filename = "subtitles.txt";
      }
      index++;
    }

        // 下载文件（优先使用「另存为」对话框）
    this._downloadFile(content, filename, mimeType);
  }


  /**
   * 下载文件，优先弹出「另存为」对话框
   */
  async _downloadFile(content, filename, mimeType) {
    if (window.showSaveFilePicker) {
      try {
        const ext = filename.endsWith(".srt") ? ".srt" : ".txt";
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: ext === ".srt" ? "SRT 字幕文件" : "文本文件",
            accept: { "text/plain": [ext] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
        console.warn("[export] showSaveFilePicker 失败，回退到默认下载", e);
      }
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  clearAll() {
    this.originalContainer.innerHTML = `<div class="placeholder-text">等待语音输入...</div>`;
    this.translationContainer.innerHTML = `<div class="placeholder-text">等待翻译结果...</div>`;
    this.correctionList.innerHTML = "";
    this.correctionPanel.style.display = "none";
    this.translationItemMap.clear();
    this.originalItemMap.clear();
  }

  _createItem({ text, originalText, time, type, segmentId }) {
    const item = document.createElement("div");
    item.className = "subtitle-item";
    item.dataset.text = text;
    if (segmentId) item.dataset.segmentId = segmentId;

    const timeEl = document.createElement("span");
    timeEl.className = "item-time";
    timeEl.textContent = time;

    const label = document.createElement("span");
    label.className = `item-label ${type}`;
    label.textContent = type === "original" ? "原文" : "译文";

    const textEl = document.createElement("span");
    textEl.className = "item-text";
    textEl.textContent = text;

    item.appendChild(timeEl);
    item.appendChild(label);
    item.appendChild(textEl);

    if (originalText && type === "translated") {
      const originalHint = document.createElement("div");
      originalHint.style.cssText = "font-size: 11px; color: #94a3b8; margin-top: 4px;";
      originalHint.textContent = `📝 ${originalText}`;
      item.appendChild(originalHint);
    }

    return item;
  }

  _trimContainer(container) {
    const items = container.querySelectorAll(".subtitle-item");
    while (items.length > this.maxItems) {
      container.removeChild(items[0]);
    }
  }

  _scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
  }

  _formatTime(timestamp) {
    if (!timestamp) return "";
    return this.timeFormatter.format(new Date(timestamp));
  }

  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}

window.SubtitleManager = SubtitleManager;

// ====================================
// TTS 语音合成引擎
// 使用浏览器 Web Speech Synthesis API
// 将翻译结果朗读出来，实现真正的同声传译
// API: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
// ====================================

class TTSManager {
  constructor() {
    this.enabled = true;
    this.isSpeaking = false;
    this.queue = [];
    this.currentUtterance = null;

    // 目标语言 → BCP-47 语言标签映射
    this.langMap = {
      zh: "zh-CN",
      en: "en-US",
      ja: "ja-JP",
      ko: "ko-KR",
      fr: "fr-FR",
      de: "de-DE",
      es: "es-ES",
    };

    this.currentLang = "zh-CN";

    // 回调: 通知 UI 朗读状态变化
    this.onSpeakingStateChange = null;

    // 监听 voices 加载完成
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => {}; // 触发 voice 加载
    }
  }

  /**
   * 设置目标语言 (用于选择对应的语音)
   */
  setLanguage(langCode) {
    this.currentLang = this.langMap[langCode] || "zh-CN";
  }

  /**
   * 切换 TTS 开关
   */
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stop();
    }
    return this.enabled;
  }

  /**
   * 朗读翻译文本
   * 自动排队，不会重叠朗读
   */
  speak(text) {
    if (!this.enabled || !text || text.trim().length === 0) return;

    // 如果正在朗读中，加入队列
    if (this.isSpeaking) {
      this.queue.push(text);
      return;
    }

    this._speakNow(text);
  }

  /**
   * 立即朗读
   */
  _speakNow(text) {
    if (typeof speechSynthesis === "undefined") {
      console.warn("[TTS] 浏览器不支持 Speech Synthesis API");
      return;
    }

    // 取消当前朗读
    if (this.currentUtterance) {
      speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.currentLang;
    utterance.rate = 1.0;  // 语速
    utterance.pitch = 1.0; // 音调
    utterance.volume = 1.0;

    // 选择合适的语音
    utterance.voice = this._findBestVoice(this.currentLang);

    this.isSpeaking = true;
    this.currentUtterance = utterance;

    if (this.onSpeakingStateChange) {
      this.onSpeakingStateChange(true);
    }

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;

      if (this.onSpeakingStateChange) {
        this.onSpeakingStateChange(false);
      }

      // 播放下一条队列
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        this._speakNow(next);
      }
    };

    utterance.onerror = (event) => {
      if (event.error !== "canceled" && event.error !== "interrupted") {
        console.warn("[TTS] 朗读错误:", event.error);
      }
      this.isSpeaking = false;
      this.currentUtterance = null;

      if (this.onSpeakingStateChange) {
        this.onSpeakingStateChange(false);
      }

      // 继续播放下一条
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        this._speakNow(next);
      }
    };

    speechSynthesis.speak(utterance);
  }

  /**
   * 停止朗读并清空队列
   */
  stop() {
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.cancel();
    }
    this.queue = [];
    this.isSpeaking = false;
    this.currentUtterance = null;

    if (this.onSpeakingStateChange) {
      this.onSpeakingStateChange(false);
    }
  }

  /**
   * 查找最适合目标语言的语音
   * 优先使用本地语音，回退到任意该语言的语音
   */
  _findBestVoice(lang) {
    if (typeof speechSynthesis === "undefined") return null;

    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    // 精确匹配语言
    const exact = voices.find((v) => v.lang === lang);
    if (exact) return exact;

    // 匹配语言前缀 (如 zh-CN 匹配 zh-HK, zh-TW)
    const langPrefix = lang.split("-")[0];
    const prefixMatch = voices.find((v) => v.lang.startsWith(langPrefix));
    if (prefixMatch) return prefixMatch;

    // 返回默认语音
    return voices[0] || null;
  }

  /**
   * 检查浏览器是否支持
   */
  static isSupported() {
    return typeof speechSynthesis !== "undefined";
  }
}

window.TTSManager = TTSManager;
