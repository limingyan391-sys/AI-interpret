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
