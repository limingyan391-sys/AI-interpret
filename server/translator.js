// server/translator.js
// AI同声传译 - 翻译模块 (增强版修正机制)
// 使用 OpenAI GPT 模型进行上下文感知翻译
// 具备智能修正检测: 编辑距离、子串匹配、时序分析
// 依赖: openai (https://www.npmjs.com/package/openai)

const OpenAI = require("openai");
const config = require("./config");

class Translator {
  constructor() {
    if (!config.openai.apiKey || config.openai.apiKey === "sk-your-api-key-here") {
      console.error("[翻译] 错误: 未配置 OPENAI_API_KEY");
    }

    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseURL,
    });

    this.model = config.translation.model;
    this.sourceLang = config.translation.sourceLang;
    this.targetLang = config.translation.targetLang;
    this.contextWindowSize = config.translation.contextWindowSize;

    this.history = [];
    this.allSegments = [];
    this.segmentIdCounter = 0;
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
      `5. 只输出翻译结果，不加引号或原文`,
      "6. 无法识别时输出: [无法识别]",
      "",
      "修正意识:",
      "- 如果新输入修正了之前的识别错误，在翻译中体现",
      "- 对之前不完整的句子，在上下文中补全含义",
    ].join("\n");
  }

  /**
   * 翻译文本，带回溯修正检测
   */
  async translate(text, meta = {}) {
    if (!text || text.trim().length === 0) {
      return { translatedText: "", segmentId: -1, isCorrection: false, corrections: [] };
    }

    const segmentId = meta.segmentId || ++this.segmentIdCounter;
    const timestamp = meta.timestamp || Date.now();

    try {
      // 修正检测: 检查当前文本是否是对历史片段的修正
      const correctionInfo = this._detectCorrections(text, segmentId);

      const messages = [
        { role: "system", content: this._buildSystemPrompt() },
      ];

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

      // 记录历史
      this.history.push({
        segmentId,
        originalText: text,
        translatedText,
        timestamp,
        isCorrection: correctionInfo.hasCorrection,
      });
      this.allSegments.push({
        segmentId,
        originalText: text,
        translatedText,
        timestamp,
      });

      return {
        translatedText,
        segmentId,
        isCorrection: correctionInfo.hasCorrection,
        corrections: correctionInfo.corrections,
      };
    } catch (error) {
      console.error("[翻译] 错误:", error.message);
      if (error.status === 401) console.error("[翻译] API Key 无效");
      return {
        translatedText: `[翻译失败: ${error.message}]`,
        segmentId,
        isCorrection: false,
        corrections: [],
      };
    }
  }

  /**
   * 智能修正检测
   * 策略：
   * 1. 编辑距离分析 - 文本高度重叠但不同
   * 2. 前缀/后缀匹配 - 新文本扩展或修正了旧文本
   * 3. 时序连续性 - 检查最近片段的关系
   */
  _detectCorrections(currentText, currentSegmentId) {
    const corrections = [];
    const recentSegments = this.allSegments.filter(
      (s) => s.segmentId !== currentSegmentId
    ).slice(-5);

    for (const prev of recentSegments) {
      const prevText = prev.originalText.toLowerCase();
      const currText = currentText.toLowerCase();

      // 策略1: 编辑距离相似度 (0.3~0.9 表示部分重叠)
      const similarity = this._levenshteinSimilarity(currText, prevText);
      if (similarity > 0.3 && similarity < 0.95) {
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

      // 策略2: 当前文本包含旧文本的扩展版本
      if (currText.includes(prevText) && currText.length > prevText.length * 1.3) {
        corrections.push({
          originalSegmentId: prev.segmentId,
          originalText: prev.originalText,
          originalTranslation: prev.translatedText,
          newText: currentText,
          type: "expansion",
          confidence: 85,
        });
        continue;
      }

      // 策略3: 旧文本包含当前文本的核心部分 (之前识别是某大段的子串)
      if (prevText.includes(currText) && prevText.length > currText.length * 1.3) {
        corrections.push({
          originalSegmentId: prev.segmentId,
          originalText: prev.originalText,
          originalTranslation: prev.translatedText,
          newText: currentText,
          type: "refinement",
          confidence: 75,
        });
      }
    }

    return {
      hasCorrection: corrections.length > 0,
      corrections,
    };
  }

  /**
   * 编辑距离相似度计算 (Levenshtein)
   */
  _levenshteinSimilarity(a, b) {
    if (a === b) return 1;
    if (a.length === 0) return 0;
    if (b.length === 0) return 0;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return 1 - distance / maxLen;
  }

  reset() {
    this.history = [];
    this.allSegments = [];
    this.segmentIdCounter = 0;
  }
}

module.exports = Translator;
