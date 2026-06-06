// public/js/subtitles.js
// AI同声传译 - 字幕显示模块
// 管理原文和翻译结果的字幕渲染，支持修正动画

class SubtitleManager {
  constructor(options = {}) {
    this.originalContainer = document.getElementById("originalContent");
    this.translationContainer = document.getElementById("translationContent");
    this.correctionList = document.getElementById("correctionList");
    this.correctionPanel = document.getElementById("correctionPanel");

    this.maxItems = options.maxItems || 15;
    this.segmentMap = new Map(); // segmentId -> DOM元素

    // 格式化时间
    this.timeFormatter = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  /**
   * 添加/更新原文识别结果
   * @param {object} data - { text, timestamp, segmentId }
   */
  addOriginalText(data) {
    if (!data.text) return;

    // 检查是否已有相同内容的最新条目
    const lastItem = this.originalContainer.querySelector(".subtitle-item:last-child");
    if (lastItem && lastItem.dataset.text === data.text) {
      return; // 相同文本不重复添加
    }

    const time = this._formatTime(data.timestamp);
    const item = this._createItem({
      text: data.text,
      time,
      type: "original",
      segmentId: data.segmentId,
    });

    // 如果是修正，标记
    if (data.isCorrection) {
      item.classList.add("correction");
    }

    this.originalContainer.appendChild(item);
    this.segmentMap.set(`original_${data.segmentId || Date.now()}`, item);
    this._trimContainer(this.originalContainer);
    this._scrollToBottom(this.originalContainer);
  }

  /**
   * 添加翻译结果
   * @param {object} data - { translatedText, originalText, segmentId, isCorrection, timestamp }
   */
  addTranslation(data) {
    if (!data.translatedText) return;

    const time = this._formatTime(data.timestamp);
    const item = this._createItem({
      text: data.translatedText,
      originalText: data.originalText,
      time,
      type: "translated",
      segmentId: data.segmentId,
    });

    if (data.isCorrection) {
      item.classList.add("correction");
      // 添加修正标记
      const badge = document.createElement("span");
      badge.className = "item-correction-badge";
      badge.textContent = "🔄 已修正";
      item.querySelector(".item-text").appendChild(badge);
    }

    this.translationContainer.appendChild(item);
    this.segmentMap.set(`trans_${data.segmentId || Date.now()}`, item);
    this._trimContainer(this.translationContainer);
    this._scrollToBottom(this.translationContainer);
  }

  /**
   * 添加修正通知
   * @param {object} data - { originalSegmentId, originalText, originalTranslation, correctedTranslation, timestamp }
   */
  addCorrection(data) {
    // 显示修正面板
    this.correctionPanel.style.display = "block";

    const time = this._formatTime(data.timestamp);
    const item = document.createElement("div");
    item.className = "correction-item";
    item.innerHTML = `
      [${time}] <span class="old">${this._escapeHtml(data.originalTranslation || data.originalText)}</span>
      → <span class="new">${this._escapeHtml(data.correctedTranslation)}</span>
    `;

    this.correctionList.appendChild(item);
    this._scrollToBottom(this.correctionList);

    // 自动隐藏旧修正
    if (this.correctionList.children.length > 5) {
      this.correctionList.removeChild(this.correctionList.firstChild);
    }
  }

  /**
   * 清除所有字幕
   */
  clearAll() {
    this.originalContainer.innerHTML = `<div class="placeholder-text">等待语音输入...</div>`;
    this.translationContainer.innerHTML = `<div class="placeholder-text">等待翻译结果...</div>`;
    this.correctionList.innerHTML = "";
    this.correctionPanel.style.display = "none";
    this.segmentMap.clear();
  }

  /**
   * 创建字幕条目 DOM 元素
   */
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

    // 如果有原文，用小字显示
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

  /**
   * 修剪容器，保留最新的N条
   */
  _trimContainer(container) {
    const items = container.querySelectorAll(".subtitle-item");
    while (items.length > this.maxItems) {
      container.removeChild(items[0]);
    }
  }

  /**
   * 滚动到底部
   */
  _scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
  }

  /**
   * 格式化时间戳
   */
  _formatTime(timestamp) {
    if (!timestamp) return "";
    return this.timeFormatter.format(new Date(timestamp));
  }

  /**
   * HTML 转义
   */
  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}

// 导出全局对象
window.SubtitleManager = SubtitleManager;
