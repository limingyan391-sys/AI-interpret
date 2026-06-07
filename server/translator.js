// server/translator.js
// AI同声传译 - 翻译模块 (增强版修正机制)
// 支持 DeepSeek / OpenAI 双模式 (API格式兼容)
// 修正检测: 编辑距离 + 词级重叠 + 最小文本长度

const OpenAI = require("openai");
const config = require("./config");

class Translator {
  constructor() {
    if (!config.hasApiKey()) {
      console.error("[翻译] 错误: 未配置 API Key");
    }

    this.client = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseURL,
    });

    this.model = config.translation.model;
    this.sourceLang = config.translation.sourceLang;
    this.targetLang = config.translation.targetLang;
    this.contextWindowSize = config.translation.contextWindowSize;

    this.history = [];
    this.allSegments = [];
    this.segmentIdCounter = 0;

    const mode = config.getMode();
    console.log(`[翻译] 模型: ${this.model} (${mode === "deepseek" ? "DeepSeek" : mode === "openai" ? "OpenAI" : "未配置"})`);
    console.log(`[翻译] API: ${config.llm.baseURL}`);
  }

  _buildSystemPrompt() {
    const langNames = {
      en: "英语", zh: "中文", ja: "日语", ko: "韩语",
      fr: "法语", de: "德语", es: "西班牙语",
    };

    const sourceName = langNames[this.sourceLang] || this.sourceLang;
    const targetName = langNames[this.targetLang] || this.targetLang;

    return [
      "你是一个专业的实时同声传译系统。",
      "将输入文本实时翻译成目标语言，输出自然流畅。",
      "",
      "核心要求:",
      `1. 将${sourceName}翻译成${targetName}`,
      "2. 保持原意，使用自然的目标语言表达",
      "3. 如果原文不完整（如句子中途截断），根据上下文合理推断",
      "4. 专业术语保持一致性",
      "5. 只输出翻译结果，不加引号或原文",
      "6. 无法识别时输出: [无法识别]",
      "",
      "修正意识:",
      "- 如果新输入修正了之前的识别错误，在翻译中体现",
      "- 对之前不完整的句子，在上下文中补全含义",
    ].join("\n");
  }

  async translate(text, meta = {}) {
    if (!text || text.trim().length === 0) {
      return { translatedText: "", segmentId: -1, isCorrection: false, corrections: [] };
    }

    const segmentId = meta.segmentId || ++this.segmentIdCounter;
    const timestamp = meta.timestamp || Date.now();

    try {
      const correctionInfo = this._detectCorrections(text, segmentId);

      const messages = [
        { role: "system", content: this._buildSystemPrompt() },
      ];

      const recentHistory = this.history.slice(-this.contextWindowSize);
      for (const item of recentHistory) {
        messages.push({ role: "user", content: `原文: ${item.originalText}` });
        messages.push({ role: "assistant", content: item.translatedText });
      }

      messages.push({ role: "user", content: `原文: ${text}` });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 200,
      });

      const translatedText = response.choices[0]?.message?.content?.trim() || "";

      this.history.push({
        segmentId, originalText: text, translatedText, timestamp,
        isCorrection: correctionInfo.hasCorrection,
      });
      this.allSegments.push({ segmentId, originalText: text, translatedText, timestamp });

      return {
        translatedText, segmentId,
        isCorrection: correctionInfo.hasCorrection,
        corrections: correctionInfo.corrections,
      };
    } catch (error) {
      console.error("[翻译] 错误:", error.message);
      if (error.status === 401) console.error("[翻译] API Key 无效");
      return {
        translatedText: `[翻译失败: ${error.message}]`,
        segmentId, isCorrection: false, corrections: [],
      };
    }
  }

  /**
   * 智能修正检测 (v2 - 降低误报率)
   *
   * 两点改进:
   * 1. 要求文本长度至少 15 字符，避免短文本随机碰撞
   * 2. 新增词级重叠检测: 两条文本必须共享至少一个实词(≥4字母)
   */
  _detectCorrections(currentText, currentSegmentId) {
    const corrections = [];

    // 太短的文本不触发修正 (避免 "?" 或 "ok" 这种误报)
    if (currentText.length < 15) return { hasCorrection: false, corrections };

    const recentSegments = this.allSegments.filter(
      (s) => s.segmentId !== currentSegmentId
    ).slice(-5);

    for (const prev of recentSegments) {
      // 历史文本太短也不参与修正检测
      if (prev.originalText.length < 10) continue;

      const prevText = prev.originalText.toLowerCase();
      const currText = currentText.toLowerCase();

      // 前置检查: 必须有共同实词 (≥4字母的单词)
      if (!this._hasCommonWord(currText, prevText)) continue;

      const similarity = this._levenshteinSimilarity(currText, prevText);

      // 提高阈值到 0.45 (原来是 0.3)
      if (similarity > 0.45 && similarity < 0.95) {
        corrections.push({
          originalSegmentId: prev.segmentId,
          originalText: prev.originalText,
          originalTranslation: prev.translatedText,
          newText: currentText,
          type: "rephrase",
          confidence: Math.round(similarity * 100),
        });
        continue;
      }

      // 当前文本扩展了旧文本 (+ 词级重叠确认)
      if (currText.includes(prevText) && currText.length > prevText.length * 1.3) {
        corrections.push({
          originalSegmentId: prev.segmentId,
          originalText: prev.originalText,
          originalTranslation: prev.translatedText,
          newText: currentText,
          type: "expansion", confidence: 85,
        });
        continue;
      }

      // 旧文本包含当前文本的精炼 (+ 词级重叠确认)
      if (prevText.includes(currText) && prevText.length > currText.length * 1.3) {
        corrections.push({
          originalSegmentId: prev.segmentId,
          originalText: prev.originalText,
          originalTranslation: prev.translatedText,
          newText: currentText,
          type: "refinement", confidence: 75,
        });
      }
    }

    return { hasCorrection: corrections.length > 0, corrections };
  }

  /**
   * 检查两条文本是否有共同实词 (≥4字母)
   * 避免 "call yourself" 和 "take me to your home" 因字符随机匹配被误判
   */
  _hasCommonWord(a, b) {
    const wordsA = new Set(a.split(/\s+/).filter((w) => w.length >= 4));
    const wordsB = new Set(b.split(/\s+/).filter((w) => w.length >= 4));
    for (const w of wordsA) {
      if (wordsB.has(w)) return true;
    }
    return false;
  }

  _levenshteinSimilarity(a, b) {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1)
        );
      }
    }

    const maxLen = Math.max(a.length, b.length);
    return 1 - matrix[b.length][a.length] / maxLen;
  }

  setSourceLang(lang) {
    this.sourceLang = lang;
    console.log(`[翻译] 源语言切换为: ${lang}`);
  }

  setTargetLang(lang) {
    this.targetLang = lang;
    console.log(`[翻译] 目标语言切换为: ${lang}`);
  }

  reset() {
    this.history = [];
    this.allSegments = [];
    this.segmentIdCounter = 0;
  }
}

module.exports = Translator;
