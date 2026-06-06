// server/mock.js
// AI同声传译 - 模拟模块
// 演示模式: 当未配置 API Key 时使用
// 支持 browser STT 模式 (直接翻译浏览器发来的文本)

class MockSTT {
  constructor() {
    // 用于 Whisper 模式的模拟音频识别
    this.scenarios = [
      {
        final: "Today I want to talk about artificial intelligence and its impact on our daily lives.",
        refinements: [
          "Today I talk about AI and its impact",
          "Today I want to talk about artificial intelligence",
          "Today I want to talk about artificial intelligence and its impact on our daily lives.",
        ],
      },
      {
        final: "The rapid development of large language models has transformed how we interact with technology.",
        refinements: [
          "The rapid development of large models transformed",
          "The rapid development of large language models has transformed",
          "The rapid development of large language models has transformed how we interact with technology.",
        ],
      },
      {
        final: "In this presentation, we will explore the key concepts behind neural networks and deep learning.",
        refinements: [
          "In this presentation we explore key concepts",
          "In this presentation we will explore the key concepts behind neural networks",
          "In this presentation, we will explore the key concepts behind neural networks and deep learning.",
        ],
      },
      {
        final: "Machine learning algorithms can process vast amounts of data to find meaningful patterns.",
        refinements: [
          "Machine learning algorithms process vast data",
          "Machine learning algorithms can process vast amounts of data",
          "Machine learning algorithms can process vast amounts of data to find meaningful patterns.",
        ],
      },
      {
        final: "One of the most exciting applications is real-time language translation across multiple languages.",
        refinements: [
          "One exciting application is real-time translation",
          "One of the most exciting applications is real-time language translation",
          "One of the most exciting applications is real-time language translation across multiple languages.",
        ],
      },
      {
        final: "This technology enables people from different countries to communicate seamlessly without barriers.",
        refinements: [
          "This technology enables people to communicate",
          "This technology enables people from different countries to communicate seamlessly",
          "This technology enables people from different countries to communicate seamlessly without barriers.",
        ],
      },
    ];

    this.scenarioIndex = 0;
    this.refinementIndex = 0;
  }

  /**
   * transcribe - 兼容两种模式:
   * browser 模式: input 为字符串文本，直接透传
   * whisper 模式: input 为 Buffer，返回模拟识别结果
   */
  async transcribe(input, format = "webm") {
    // 如果是字符串 → browser 模式: 直接透传
    if (typeof input === "string") {
      return {
        text: input.trim(),
        segments: [{ text: input, start: 0, end: input.split(/\s+/).length * 0.3 }],
        duration: input.split(/\s+/).length * 0.3,
      };
    }

    // 如果是 Buffer → whisper 模式: 模拟渐进式识别
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
      "This technology enables people from different countries to communicate seamlessly without barriers.": "这项技术使来自不同国家的人们能够无阻碍地无缝沟通。",
    };
  }

  async translate(text, meta = {}) {
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));

    const segmentId = meta.segmentId || ++this.segmentIdCounter;

    // 精确匹配
    let translatedText = this.translationMap[text];
    // 模糊匹配: 用包含关系找最接近的
    if (!translatedText) {
      const keys = Object.keys(this.translationMap);
      const matched = keys.find((k) => text.includes(k) || k.includes(text));
      translatedText = matched ? this.translationMap[matched] : `[模拟翻译] ${text}`;
    }

    // 修正检测
    const corrections = [];
    for (const prev of this.history) {
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

    this.history.push({
      segmentId,
      originalText: text,
      translatedText,
      timestamp: Date.now(),
      isCorrection: corrections.length > 0,
    });

    return {
      translatedText,
      segmentId,
      isCorrection: corrections.length > 0,
      corrections,
    };
  }

  reset() {
    this.history = [];
    this.segmentIdCounter = 0;
  }
}

module.exports = { MockSTT, MockTranslator };
