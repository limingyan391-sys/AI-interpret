// public/js/subtitles.js
// AI同声传译 - 字幕显示模块
// 管理原文和翻译结果的字幕渲染，支持修正动画和原位更新

class SubtitleManager {
  constructor(options = {}) {
    this.originalContainer = document.getElementById("originalContent");
    this.translationContainer = document.getElementById("translationContent");
    this.correctionList = document.getElementById("correctionList");
    this.correctionPanel = document.getElementById("correctionPanel");

    this.maxItems = options.maxItems || 20;
    // segmentId -> DOM元素映射 (用于原位修正)
    this.translationItemMap = new Map();
    this.originalItemMap = new Map();

    // 格式化时间
    this.timeFormatter = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  /**
   * 添加/更新原文识别结果
   * @param {object} data - { text, timestamp, segmentId, isCorrection }
   */
  addOriginalText(data) {
    if (!data.text || !data.text.trim()) return;

    const segmentId = data.segmentId || `orig_${Date.now()}`;

    // 如果是对已有片段的修正，进行原位更新
    if (data.isCorrection) {
      const existingItem = this.originalItemMap.get(segmentId);
      if (existingItem) {
        this._updateItemText(existingItem, data.text, false);
        return;
      }
    }

    // 去重: 检查最后一条是否内容相同
    const lastItem = this.originalContainer.querySelector(".subtitle-item:last-child");
    if (lastItem && lastItem.dataset.text === data.text) {
      return;
    }

    // 去重: 检查是否与上一条过于相似
    const prevItem = this.originalContainer.querySelector(".subtitle-item:nth-last-child(1)");
    if (prevItem) {
      const prevText = prevItem.dataset.text || "";
      if (this._isDuplicate(prevText, data.text)) {
        return;
      }
    }

    const time = this._formatTime(data.timestamp);
    const item = this._createItem({
      text: data.text,
      time,
      type: "original",
      segmentId,
    });

    if (data.isCorrection) {
      item.classList.add("correction");
    }

    this.originalContainer.appendChild(item);
    this.originalItemMap.set(segmentId, item);
    this._trimContainer(this.originalContainer);
    this._scrollToBottom(this.originalContainer);
  }

  /**
   * 添加翻译结果
   * @param {object} data - { translatedText, originalText, segmentId, isCorrection, timestamp, corrections }
   */
  addTranslation(data) {
    if (!data.translatedText || !data.translatedText.trim()) return;

    const segmentId = data.segmentId || `trans_${Date.now()}`;

    // 如果是修正，更新已有的翻译条目
    if (data.isCorrection && data.corrections && data.corrections.length > 0) {
      for (const correction of data.corrections) {
        const targetSegmentId = `trans_${correction.originalSegmentId}`;
        const existingItem = this.translationItemMap.get(targetSegmentId);
        if (existingItem) {
          // 更新现有条目，添加修正标记
          this._updateItemText(existingItem, data.translatedText, true);
        }
      }
      // 同时添加为新条目
    }

    // 如果已有相同 segmentId 的条目，更新它
    const existingItem = this.translationItemMap.get(segmentId);
    if (existingItem) {
      this._updateItemText(existingItem, data.translatedText, data.isCorrection);
      return;
    }

    // 去重: 检查最后一条是否内容相同
    const lastItem = this.translationContainer.querySelector(".subtitle-item:last-child");
    if (lastItem) {
      const lastText = lastItem.querySelector(".item-text")?.textContent?.trim() || "";
      // 如果最后一条与当前翻译完全相同，跳过
      if (lastText === data.translatedText) {
        return;
      }
    }

    const time = this._formatTime(data.timestamp);
    const item = this._createItem({
      text: data.translatedText,
      originalText: data.originalText,
      time,
      type: "translated",
      segmentId,
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
   * 原位更新已有的字幕文本
   */
  _updateItemText(item, newText, isCorrection) {
    const textEl = item.querySelector(".item-text");
    if (!textEl) return;

    const oldText = textEl.textContent;
    if (oldText === newText) return;

    textEl.textContent = newText;

    if (isCorrection) {
      item.classList.add("correction");

      // 添加修正标记（如果还没有）
      if (!item.querySelector(".item-correction-badge")) {
        this._addCorrectionBadge(item);
      }

      // 触发修正闪烁动画
      item.style.animation = "none";
      // 强制回流
      void item.offsetHeight;
      item.style.animation = "correctionFlash 0.5s ease-out";
    }

    // 更新时间戳
    const timeEl = item.querySelector(".item-time");
    if (timeEl) {
      timeEl.textContent = this._formatTime(Date.now());
    }
  }

  /**
   * 添加修正徽标
   */
  _addCorrectionBadge(item) {
    const badge = document.createElement("span");
    badge.className = "item-correction-badge";
    badge.textContent = "🔄 已修正";
    const textEl = item.querySelector(".item-text");
    if (textEl) {
      textEl.appendChild(badge);
    }
  }

  /**
   * 添加修正通知 (显示在独立的修正面板中)
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

    // 限制修正记录数量
    while (this.correctionList.children.length > 10) {
      this.correctionList.removeChild(this.correctionList.firstChild);
    }
  }

  /**
   * 检查两条文本是否重复（编辑距离简单判定）
   */
  _isDuplicate(textA, textB) {
    if (!textA || !textB) return false;
    if (textA === textB) return true;

    // 如果短的文本是长文本的子串，且长度接近
    const short = textA.length <= textB.length ? textA : textB;
    const long = textA.length > textB.length ? textA : textB;

    if (short.length > long.length * 0.5 && long.includes(short)) {
      return true;
    }

    return false;
  }

  /**
   * 清除所有字幕
   */
  clearAll() {
    this.originalContainer.innerHTML = `<div class="placeholder-text">等待语音输入...</div>`;
    this.translationContainer.innerHTML = `<div class="placeholder-text">等待翻译结果...</div>`;
    this.correctionList.innerHTML = "";
    this.correctionPanel.style.display = "none";
    this.translationItemMap.clear();
    this.originalItemMap.clear();
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
      const first = items[0];
      container.removeChild(first);
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
