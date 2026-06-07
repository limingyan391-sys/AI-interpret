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
      "你是一个专业的实时同声传译系统。你的任务只有一个：将输入的文本从源语言翻译成目标语言。",
      "",
      "## 绝对规则",
      `1. 必须把输入的${sourceName}翻译成${targetName}，严禁输出其他语言`,
      "2. 只输出翻译结果，不解释、不添加任何额外内容",
      "3. 保持原意，使用自然地道的目标语言表达",
      `4. 如果你输出了${targetName}以外的语言，就是严重错误`,
      "5. 无法识别时只输出: [无法识别]",
      "",
      "## 示例",
      "如果源语言是中文，目标语言是日语：",
      "  输入: 原文: 今天天气真好",
      "  输出: 今日は天気が本当にいいですね",
      "如果源语言是中文，目标语言是韩语：",
      "  输入: 原文: 谢谢",
      "  输出: 감사합니다",
      "如果源语言是中文，目标语言是英语：",
      "  输入: 原文: 你好",
      "  输出: Hello",
      "",
      "记住：你必须严格按照当前设定的语言方向翻译，",
      `只用${targetName}输出，不要使用其他语言。`,
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
      // 检测源语言或目标语言是否发生了切换
      // 如果切换了，向模型注入明确的语言方向信号
      // 注意：即使历史为空也要注入，确保模型不会默认输出英文
      const langChanged = (this.sourceLang !== this._lastSourceLang) ||
                          (this.targetLang !== this._lastTargetLang);
      if (langChanged) {
        const oldSource = LANG_NAMES[this._lastSourceLang] || this._lastSourceLang;
        const oldTarget = LANG_NAMES[this._lastTargetLang] || this._lastTargetLang;
        const newSource = LANG_NAMES[this.sourceLang] || this.sourceLang;
        const newTarget = LANG_NAMES[this.targetLang] || this.targetLang;

        let directionMsg;
        if (this.history.length > 0) {
          // 有历史记录：通知切换
          directionMsg = `【语言切换通知】前面的对话是从${oldSource}到${oldTarget}的互译示例。现在请改为将${newSource}翻译成${newTarget}。接下来的输入都将遵循这个新的语言方向。`;
          console.log(`[翻译] 语言方向变更: ${oldSource}→${oldTarget} => ${newSource}→${newTarget}`);
        } else {
          // 无历史记录：直接设定方向
          directionMsg = `【语言设定】当前翻译方向为：将${newSource}翻译成${newTarget}。请严格遵循这个方向。`;
          console.log(`[翻译] 语言方向设定: ${newSource}→${newTarget}`);
        }

        messages.push({ role: "user", content: directionMsg });
        messages.push({
          role: "assistant",
          content: `明白，我将严格将${newSource}翻译成${newTarget}。`,
        });
      }

      // 记录当前语言设置，供下次检测
      this._lastSourceLang = this.sourceLang;
      this._lastTargetLang = this.targetLang;

      // 添加上下文历史（仅当语言方向一致时才使用历史）
      if (!langChanged) {
        const recentHistory = this.history.slice(-this.contextWindowSize);
        for (const item of recentHistory) {
          messages.push({ role: "user", content: `原文: ${item.originalText}` });
          messages.push({ role: "assistant", content: item.translatedText });
        }
      }

            messages.push({ role: "user", content: `原文: ${text}` });

      // 流式翻译：逐 token 推送，让前端实时显示翻译进度
      const onChunk = meta.onChunk;
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.1,
        max_tokens: 400,
        stream: true,
      });

      let translatedText = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          translatedText += delta;
          onChunk?.(delta, translatedText, segmentId);
        }
      }
      translatedText = translatedText.trim();

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
    this._clearHistory();
    console.log(`[翻译] 源语言切换为: ${lang}`);
  }

  setTargetLang(lang) {
    this.targetLang = lang;
    this._clearHistory();
    console.log(`[翻译] 目标语言切换为: ${lang}`);
  }

  reset() {
    this._clearHistory();
    this.segmentIdCounter = 0;
  }

  _clearHistory() {
    this.history = [];
    this.allSegments = [];
    // segmentIdCounter 不重置，防止前端覆盖旧条目
  }
}

module.exports = Translator;