// server/mock.js
// AI同声传译 - 模拟模块 (增强修正检测)
// 当未配置 API Key 时使用

class MockSTT {
  constructor() {
    this.scenarios = [
      {
        final: "Today I want to talk about artificial intelligence and its impact on our daily lives.",
        refinements: [
          "Today I talk about AI and its impact",
          "Today I want to talk about artificial intelligence",
          "Today I want to talk about artificial intelligence and its impact on our daily lives.",
        ],
      },
      // ... (same scenarios as before)
    ];
    this.scenarioIndex = 0;
    this.refinementIndex = 0;
  }

  async transcribe(input, format = "webm") {
    if (typeof input === "string") {
      return {
        text: input.trim(),
        segments: [{ text: input, start: 0, end: input.split(/\s+/).length * 0.3 }],
        duration: input.split(/\s+/).length * 0.3,
      };
    }

    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));

    const scenario = this.scenarios[this.scenarioIndex];
    const refinements = scenario.refinements;
    const text = refinements[this.refinementIndex];
    this.refinementIndex++;

    if (this.refinementIndex >= refinements.length) {
      this.refinementIndex = 0;
      this.scenarioIndex = (this.scenarioIndex + 1) % this.scenarios.length;
    }

    const isCorrection = this.refinementIndex > 1;
    console.log(`[模拟STT] ${text}${isCorrection ? " (修正)" : ""}`);

    return {
      text,
      segments: [{ text, start: 0, end: text.length / 10 }],
      duration: text.length / 10,
      isCorrection,
    };
  }
}

class MockTranslator {
  constructor() {
    this.history = [];
    this.segmentIdCounter = 0;

    this.translationMap = {
      "Today I talk about AI and its impact": "今天我要谈论人工智能及其影响。",
      "Today I want to talk about artificial intelligence": "今天我想谈谈人工智能。",
      "Today I want to talk about artificial intelligence and its impact on our daily lives.": "今天我想谈谈人工智能及其对我们日常生活的影响。",
      "The rapid development of large models transformed": "大型模型的快速发展改变了...",
      "The rapid development of large language models has transformed": "大型语言模型的快速发展已经改变了...",
      "The rapid development of large language models has transformed how we interact with technology.": "大型语言模型的快速发展改变了我们与技术互动的方式。",
      "In this presentation we explore key concepts": "在本演讲中，我们探讨关键概念...",
      "In this presentation we will explore the key concepts behind neural networks": "在本演讲中，我们将探讨神经网络背后的关键概念...",
      "In this presentation, we will explore the key concepts behind neural networks and deep learning.": "在本演讲中，我们将探讨神经网络和深度学习背后的关键概念。",
      "Machine learning algorithms process vast data": "机器学习算法处理海量数据...",
      "Machine learning algorithms can process vast amounts of data": "机器学习算法可以处理海量数据...",
      "Machine learning algorithms can process vast amounts of data to find meaningful patterns.": "机器学习算法可以处理海量数据来发现有意义的模式。",
      "One exciting application is real-time translation": "一个令人兴奋的应用是实时翻译...",
      "One of the most exciting applications is real-time language translation": "最令人兴奋的应用之一是实时语言翻译...",
      "One of the most exciting applications is real-time language translation across multiple languages.": "最令人兴奋的应用之一是跨多种语言的实时翻译。",
      "This technology enables people to communicate": "这项技术使人们能够沟通...",
      "This technology enables people from different countries to communicate seamlessly": "这项技术使来自不同国家的人们能够无缝沟通...",
      "This technology enables people from different countries to communicate seamlessly without barriers.": "这项技术使来自不同国家的人们能够无缝沟通。",
    };
  }

  async translate(text, meta = {}) {
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
    const segmentId = meta.segmentId || ++this.segmentIdCounter;

    let translatedText = this.translationMap[text];
    if (!translatedText) {
      const keys = Object.keys(this.translationMap);
      const matched = keys.find((k) => text.includes(k) || k.includes(text));
      translatedText = matched ? this.translationMap[matched] : `[模拟翻译] ${text}`;
    }

    // 修正检测 (v2 - 与真实 Translator 逻辑一致)
    const corrections = [];
    if (text.length >= 15) {
      for (const prev of this.history) {
        if (prev.originalText.length < 10) continue;

        // 必须有共同实词 (≥4字母)
        const wordsA = new Set(text.toLowerCase().split(/\s+/).filter((w) => w.length >= 4));
        const wordsB = new Set(prev.originalText.toLowerCase().split(/\s+/).filter((w) => w.length >= 4));
        const hasCommon = [...wordsA].some((w) => wordsB.has(w));
        if (!hasCommon) continue;

        // 新文本更长且包含旧文本的核心内容
        if (text.length > prev.originalText.length &&
            text.toLowerCase().includes(prev.originalText.toLowerCase().slice(0, 20))) {
          corrections.push({
            originalSegmentId: prev.segmentId,
            originalText: prev.originalText,
            originalTranslation: prev.translatedText,
            newText: text,
            type: "refinement",
            confidence: 90,
          });
        }
      }
    }

    this.history.push({
      segmentId, originalText: text, translatedText,
      timestamp: Date.now(), isCorrection: corrections.length > 0,
    });

    return {
      translatedText, segmentId,
      isCorrection: corrections.length > 0, corrections,
    };
  }

  reset() {
    this.history = [];
    this.segmentIdCounter = 0;
  }
}

module.exports = { MockSTT, MockTranslator };
