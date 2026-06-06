// server/translator.js
// AI同声传译 - 翻译模块
// 使用 OpenAI GPT 模型将识别文本翻译为目标语言
// 具备上下文修正能力: 当新的识别结果修正了之前的错误时，更新历史记录
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

    // 历史记录: 存储最近的翻译上下文
    this.history = [];
    // 所有片段记录 (用于修正输出)
    this.allSegments = [];
    // 片段ID计数器
    this.segmentIdCounter = 0;
  }

  /**
   * 构建翻译系统提示词
   */
  _buildSystemPrompt() {
    const langNames = {
      en: "英语",
      zh: "中文",
      ja: "日语",
      ko: "韩语",
      fr: "法语",
      de: "德语",
      es: "西班牙语",
    };

    const sourceName = langNames[this.sourceLang] || this.sourceLang;
    const targetName = langNames[this.targetLang] || this.targetLang;

    return [
      "你是一个专业的实时同声传译系统。",
      "你的任务是将输入的文本实时翻译成目标语言，输出要自然流畅。",
      "",
      "核心要求:",
      `1. 将${sourceName}翻译成${targetName}`,
      "2. 保持原意的同时使用自然的目标语言表达",
      "3. 如果原文不完整（如句子中间截断），根据上下文合理推测完整含义",
      "4. 专业术语要保持一致",
      `5. 输出格式: 只输出翻译结果，不要包含原文，不要加引号`,
      `6. 如果输入无法确定含义则输出: [无法识别]`,
      "",
      "修正能力:",
      "- 如果新的输入修正了之前的识别错误，在翻译中体现修正",
      "- 对于之前不完整的句子，在上下文中补全",
    ].join("\n");
  }

  /**
   * 翻译文本，并记录上下文用于修正
   * @param {string} text - 待翻译文本
   * @param {object} meta - 元数据 { segmentId, timestamp, isCorrection }
   * @returns {Promise<{translatedText: string, segmentId: number, isCorrection: boolean}>}
   */
  async translate(text, meta = {}) {
    if (!text || text.trim().length === 0) {
      return { translatedText: "", segmentId: -1, isCorrection: false };
    }

    const segmentId = meta.segmentId || ++this.segmentIdCounter;
    const timestamp = meta.timestamp || Date.now();

    try {
      // 构建消息列表: 系统提示 + 历史上下文 + 当前输入
      const messages = [
        { role: "system", content: this._buildSystemPrompt() },
      ];

      // 添加上下文历史 (最近的N条)
      const recentHistory = this.history.slice(-this.contextWindowSize);
      for (const item of recentHistory) {
        messages.push({
          role: "user",
          content: `原文: ${item.originalText}`,
        });
        messages.push({
          role: "assistant",
          content: item.translatedText,
        });
      }

      // 添加当前输入
      messages.push({ role: "user", content: `原文: ${text}` });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: 0.3,
        max_tokens: 200,
      });

      const translatedText = response.choices[0]?.message?.content?.trim() || "";

      // 记录到历史
      const historyEntry = {
        segmentId,
        originalText: text,
        translatedText,
        timestamp,
        isCorrection: meta.isCorrection || false,
      };
      this.history.push(historyEntry);
      this.allSegments.push(historyEntry);

      // 检查是否是对之前片段的修正
      const correctionInfo = this._checkAndGetCorrections(text, segmentId);

      return {
        translatedText,
        segmentId,
        isCorrection: correctionInfo.hasCorrection,
        corrections: correctionInfo.corrections,
      };
    } catch (error) {
      console.error("[翻译] 错误:", error.message);

      if (error.status === 401) {
        console.error("[翻译] API Key 无效，请检查配置");
      }

      return {
        translatedText: `[翻译失败: ${error.message}]`,
        segmentId,
        isCorrection: false,
      };
    }
  }

  /**
   * 检查当前翻译是否修正了之前的内容
   * 基于文本相似度和上下文连续性进行检测
   */
  _checkAndGetCorrections(currentText, currentSegmentId) {
    const corrections = [];

    // 检查最近的N条历史，看是否有文本相似但不同的情况
    const recentSegments = this.allSegments
      .filter((s) => s.segmentId !== currentSegmentId)
      .slice(-5);

    for (const prev of recentSegments) {
      // 简单的修正检测：如果当前文本包含对之前文本的明显修正
      const similarity = this._textSimilarity(currentText, prev.originalText);
      if (similarity > 0.3 && similarity < 0.9) {
        // 部分重叠但不同 - 可能是修正
        corrections.push({
          originalSegmentId: prev.segmentId,
          originalText: prev.originalText,
          originalTranslation: prev.translatedText,
          newText: currentText,
        });
      }
    }

    return {
      hasCorrection: corrections.length > 0,
      corrections,
    };
  }

  /**
   * 简单文本相似度计算 (基于词重叠)
   */
  _textSimilarity(a, b) {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * 重置翻译上下文
   */
  reset() {
    this.history = [];
    this.allSegments = [];
    this.segmentIdCounter = 0;
  }
}

module.exports = Translator;
