// server/mock.js
// AI同声传译 - 模拟模块 (增强版带修正模拟)
// 当未配置 API Key 时使用，模拟真实 STT 和翻译流程
// 支持模拟修正行为：后一个识别结果修正前一个的不准确之处

class MockSTT {
  constructor() {
    // 模拟对话场景: 每个条目是一次完整的演讲片段
    // 每个场景包含多个逐步细化的识别版本
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
    this.callCount = 0;
  }

  async transcribe(audioBuffer, format = "webm") {
    // 模拟处理延迟 (250ms - 800ms)
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 550));

    // 获取当前场景
    const scenario = this.scenarios[this.scenarioIndex];
    const refinements = scenario.refinements;

    // 逐步细化: 每调用一次推进一个细化版本
    const text = refinements[this.refinementIndex];
    this.refinementIndex++;

    // 如果当前场景的所有细化版本都输出完了，进入下一个场景
    if (this.refinementIndex >= refinements.length) {
      this.refinementIndex = 0;
      this.scenarioIndex = (this.scenarioIndex + 1) % this.scenarios.length;
    }

    // 并不是每次都是修正，让修正更自然
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

    // 翻译字典
    this.translationMap = {
      "Today I talk about AI and its impact":
        "今天我要谈论人工智能及其影响。",
      "Today I want to talk about artificial intelligence":
        "今天我想谈谈人工智能。",
      "Today I want to talk about artificial intelligence and its impact on our daily lives.":
        "今天我想谈谈人工智能及其对我们日常生活的影响。",

      "The rapid development of large models transformed":
        "大型模型的快速发展改变了...",
      "The rapid development of large language models has transformed":
        "大型语言模型的快速发展已经改变了...",
      "The rapid development of large language models has transformed how we interact with technology.":
        "大型语言模型的快速发展改变了我们与技术互动的方式。",

      "In this presentation we explore key concepts":
        "在本演讲中，我们探讨关键概念...",
      "In this presentation we will explore the key concepts behind neural networks":
        "在本演讲中，我们将探讨神经网络背后的关键概念...",
      "In this presentation, we will explore the key concepts behind neural networks and deep learning.":
        "在本演讲中，我们将探讨神经网络和深度学习背后的关键概念。",

      "Machine learning algorithms process vast data":
        "机器学习算法处理海量数据...",
      "Machine learning algorithms can process vast amounts of data":
        "机器学习算法可以处理海量数据...",
      "Machine learning algorithms can process vast amounts of data to find meaningful patterns.":
        "机器学习算法可以处理海量数据来发现有意义的模式。",

      "One exciting application is real-time translation":
        "一个令人兴奋的应用是实时翻译...",
      "One of the most exciting applications is real-time language translation":
        "最令人兴奋的应用之一是实时语言翻译...",
      "One of the most exciting applications is real-time language translation across multiple languages.":
        "最令人兴奋的应用之一是跨多种语言的实时翻译。",

      "This technology enables people to communicate":
        "这项技术使人们能够沟通...",
      "This technology enables people from different countries to communicate seamlessly":
        "这项技术使来自不同国家的人们能够无缝沟通...",
      "This technology enables people from different countries to communicate seamlessly without barriers.":
        "这项技术使来自不同国家的人们能够无阻碍地无缝沟通。",
    };

    // 修正关系映射: 前一个版本 -> 最终版本
    this.correctionMap = [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
    ];
  }

  async translate(text, meta = {}) {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

    const segmentId = meta.segmentId || ++this.segmentIdCounter;

    // 查找翻译
    let translatedText = this.translationMap[text];
    if (!translatedText) {
      translatedText = `[模拟翻译] ${text}`;
    }

    // 检测修正: 检查是否有之前被修正的版本
    const corrections = [];
    for (let i = 0; i < this.history.length; i++) {
      const prev = this.history[i];
      // 如果当前文本更长/更完整，且包含之前文本的核心内容
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

    const isCorrection = corrections.length > 0;

    // 记录历史
    this.history.push({
      segmentId,
      originalText: text,
      translatedText,
      timestamp: Date.now(),
      isCorrection,
    });

    return {
      translatedText,
      segmentId,
      isCorrection,
      corrections,
    };
  }

  reset() {
    this.history = [];
    this.segmentIdCounter = 0;
  }
}

module.exports = { MockSTT, MockTranslator };
