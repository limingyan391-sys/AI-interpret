// server/translator.js
// AI同声传译 - 翻译模块 (增强版修正机制 + 语言切换感知)
// 支持 DeepSeek / OpenAI 双模式 (API格式兼容)

const OpenAI = require("openai");
const config = require("./config");

const LANG_NAMES = {
  en: "英语", zh: "中文", ja: "日语", ko: "韩语",
  fr: "法语", de: "德语", es: "西班牙语",
};

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

    // 记录上一次的语言设置，用于检测切换
    this._lastSourceLang = this.sourceLang;
    this._lastTargetLang = this.targetLang;

    this.history = [];
    this.allSegments = [];
    this.segmentIdCounter = 0;

    const mode = config.getMode();
    console.log(`[翻译] 模型: ${this.model} (${mode === "deepseek" ? "DeepSeek" : mode === "openai" ? "OpenAI" : "未配置"})`);
    console.log(`[翻译] API: ${config.llm.baseURL}`);
  }

  _buildSystemPrompt() {
    const sourceName = LANG_NAMES[this.sourceLang] || this.sourceLang;
    const targetName = LANG_NAMES[this.targetLang] || this.targetLang;

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

      // === 语言切换感知 ===
      // 如果用户切换了源语言或目标语言，在对话中插入一条切换通知
      // 让模型明确知道语言方向已改变，避免被历史记录带偏
      const langChanged = (this.sourceLang !== this._lastSourceLang) ||
                          (this.targetLang !== this._lastTargetLang);
      if (langChanged && this.history.length > 0) {
        const oldSource = LANG_NAMES[this._lastSourceLang] || this._lastSourceLang;
        const oldTarget = LANG_NAMES[this._lastTargetLang] || this._lastTargetLang;
        const newSource = LANG_NAMES[this.sourceLang] || this.sourceLang;
        const newTarget = LANG_NAMES[this.targetLang] || this.targetLang;

        // 插入语言切换通知，让模型明确新的语言方向
        messages.push({
          role: "user",
          content: `【语言切换通知】前面的对话是从${oldSource}到${oldTarget}的互译示例。现在请改为将${newSource}翻译成${newTarget}。接下来的输入都将遵循这个新的语言方向。`,
        });
        messages.push({
          role: "assistant",
          content: `明白，现在开始将${newSource}翻译成${newTarget}，不会再使用之前的语言方向。`,
        });

        console.log(`[翻译] 语言方向变更: ${oldSource}→${oldTarget} => ${newSource}→${newTarget}`);
      }

      // 记录当前语言设置，供下次检测
      this._lastSourceLang = this.sourceLang;
      this._lastTargetLang = this.targetLang;

      // 添加上下文历史
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

  // ... (rest of the methods unchanged)
  _detectCorrections(currentText, currentSegmentId) {
    const corrections = [];
    if (currentText.length < 15) return { hasCorrection: false, corrections };

    const recentSegments = this.allSegments.filter(
      (s) => s.segmentId !== currentSegmentId
    ).slice(-5);

    for (const prev of recentSegments) {
      if (prev.originalText.length < 10) continue;

      const prevText = prev.originalText.toLowerCase();
      const currText = currentText.toLowerCase();

      if (!this._hasCommonWord(currText, prevText)) continue;

      const similarity = this._levenshteinSimilarity(currText, prevText);
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

      if (currText.includes(prevText) && currText.length > prevText.length * 1.3) {
        corrections.push({
          originalSegmentId: prev.segmentId, originalText: prev.originalText,
          originalTranslation: prev.translatedText, newText: currentText,
          type: "expansion", confidence: 85,
        });
        continue;
      }

      if (prevText.includes(currText) && prevText.length > currText.length * 1.3) {
        corrections.push({
          originalSegmentId: prev.segmentId, originalText: prev.originalText,
          originalTranslation: prev.translatedText, newText: currentText,
          type: "refinement", confidence: 75,
        });
      }
    }
    return { hasCorrection: corrections.length > 0, corrections };
  }

  _hasCommonWord(a, b) {
    const wordsA = new Set(a.split(/\s+/).filter((w) => w.length >= 4));
    const wordsB = new Set(b.split(/\s+/).filter((w) => w.length >= 4));
    for (const w of wordsA) { if (wordsB.has(w)) return true; }
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
          matrix[i - 1][j] + 1, matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1)
        );
      }
    }
    return 1 - matrix[b.length][a.length] / Math.max(a.length, b.length);
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
