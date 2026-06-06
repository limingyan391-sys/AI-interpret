// server/mock.js
// AI同声传译 - 模拟模块 (用于演示和测试)
// 当未配置 API Key 时使用，提供模拟的 STT 和翻译结果
// 让用户可以在无需 OpenAI API 的情况下体验界面

class MockSTT {
  async transcribe(audioBuffer, format = "webm") {
    // 模拟处理延迟
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));

    const mockTexts = [
      "Today I want to talk about artificial intelligence and its impact on our daily lives.",
      "The rapid development of large language models has transformed how we interact with technology.",
      "In this presentation, we will explore the key concepts behind neural networks.",
      "Machine learning algorithms can process vast amounts of data to find patterns.",
      "One of the most exciting applications is real-time language translation.",
      "This technology enables people from different countries to communicate seamlessly.",
      "The future of AI is bright, with new breakthroughs happening every day.",
      "Thank you for listening to my presentation. I hope you found it informative.",
    ];

    const text = mockTexts[Math.floor(Math.random() * mockTexts.length)];

    console.log(`[模拟STT] ${text}`);

    return {
      text,
      segments: [{ text, start: 0, end: text.length / 10 }],
      duration: text.length / 10,
    };
  }
}

class MockTranslator {
  constructor() {
    this.history = [];
    this.segmentIdCounter = 0;
  }

  async translate(text, meta = {}) {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

    const segmentId = meta.segmentId || ++this.segmentIdCounter;

    // 模拟翻译字典
    const translationMap = {
      "Today I want to talk about artificial intelligence and its impact on our daily lives.":
        "今天我想谈谈人工智能及其对我们日常生活的影响。",
      "The rapid development of large language models has transformed how we interact with technology.":
        "大型语言模型的快速发展改变了我们与技术互动的方式。",
      "In this presentation, we will explore the key concepts behind neural networks.":
        "在本演讲中，我们将探讨神经网络背后的关键概念。",
      "Machine learning algorithms can process vast amounts of data to find patterns.":
        "机器学习算法可以处理海量数据来发现模式。",
      "One of the most exciting applications is real-time language translation.":
        "最令人兴奋的应用之一是实时语言翻译。",
      "This technology enables people from different countries to communicate seamlessly.":
        "这项技术使来自不同国家的人们能够无缝沟通。",
      "The future of AI is bright, with new breakthroughs happening every day.":
        "人工智能的未来一片光明，每天都有新的突破。",
      "Thank you for listening to my presentation. I hope you found it informative.":
        "感谢大家聆听我的演讲，希望你们觉得有收获。",
    };

    const translatedText = translationMap[text] || `[模拟翻译] ${text}`;

    // 记录历史
    this.history.push({
      segmentId,
      originalText: text,
      translatedText,
      timestamp: Date.now(),
      isCorrection: meta.isCorrection || false,
    });

    return {
      translatedText,
      segmentId,
      isCorrection: false,
      corrections: [],
    };
  }

  reset() {
    this.history = [];
    this.segmentIdCounter = 0;
  }
}

module.exports = { MockSTT, MockTranslator };
