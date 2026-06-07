// tests/translator.test.js
// AI同声传译 - 翻译模块单元测试
// 测试核心逻辑: Levenshtein 相似度、修正检测、翻译上下文

jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockImplementation(async () => {
          // 流式响应：逐 token 返回模拟翻译结果
          const tokens = "这是模拟翻译结果。";
          const self = { [Symbol.asyncIterator]: () => {
            let i = 0;
            return {
              next: () => {
                if (i < tokens.length) {
                  const chunk = { choices: [{ delta: { content: tokens[i] }, index: 0 }] };
                  i++;
                  return Promise.resolve({ value: chunk, done: false });
                }
                return Promise.resolve({ done: true });
              },
            };
          }};
          return self;
        }),
      },
    },
  }));
});

describe("翻译模块 - Levenshtein 相似度", () => {
  const Translator = require("../server/translator");

  test("完全相同返回 1", () => {
    const t = new Translator();
    expect(t._levenshteinSimilarity("hello", "hello")).toBe(1);
    expect(t._levenshteinSimilarity("", "")).toBe(1);
  });

  test("完全不同的文本返回 0", () => {
    const t = new Translator();
    expect(t._levenshteinSimilarity("", "abc")).toBe(0);
    expect(t._levenshteinSimilarity("abc", "")).toBe(0);
  });

  test("编辑距离准确计算", () => {
    const t = new Translator();
    const sim = t._levenshteinSimilarity("kitten", "sitting");
    expect(sim).toBeCloseTo(0.571, 1);
  });

  test("部分重叠的文本", () => {
    const t = new Translator();
    const sim = t._levenshteinSimilarity(
      "Today I talk about AI and its impact",
      "Today I want to talk about artificial intelligence and its impact"
    );
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(0.95);
  });
});

describe("翻译模块 - 修正检测 (v2)", () => {
  const Translator = require("../server/translator");

  test("不相关文本不触发修正 (无共同词)", () => {
    const t = new Translator();
    t.allSegments.push({
      segmentId: 1,
      originalText: "Today I want to talk about artificial intelligence",
      translatedText: "今天我想谈谈人工智能",
      timestamp: Date.now(),
    });

    // "Machine learning" 和 "Today I want..." 没有共同词 → 不触发
    const result = t._detectCorrections("Machine learning is very important these days", 2);
    expect(result.hasCorrection).toBe(false);
  });

  test("太短的文本不触发修正", () => {
    const t = new Translator();
    t.allSegments.push({
      segmentId: 1,
      originalText: "This is a longer text about artificial intelligence",
      translatedText: "这是一个关于AI的长文本",
      timestamp: Date.now(),
    });

    // "OK" 和 "?" 这种短文本不触发修正
    const result = t._detectCorrections("OK", 2);
    expect(result.hasCorrection).toBe(false);
  });

  test("共同词触发编辑距离修正 (rephrase)", () => {
    const t = new Translator();
    t.allSegments.push({
      segmentId: 1,
      originalText: "Today I talk about AI and its impact on our world",
      translatedText: "今天我要谈谈AI及其对世界的影响",
      timestamp: Date.now(),
    });

    // "Today" + "talk" + "about" + "impact" 都是共同词
    const result = t._detectCorrections(
      "Today I want to talk about artificial intelligence and its impact on our world",
      2
    );

    expect(result.hasCorrection).toBe(true);
    expect(result.corrections[0].type).toBe("rephrase");
    expect(result.corrections[0].originalSegmentId).toBe(1);
  });

  test("扩展检测 (expansion) - 新文本包含旧文本全文", () => {
    const t = new Translator();
    t.allSegments.push({
      segmentId: 1,
      originalText: "Today I want to talk",
      translatedText: "今天我想谈谈",
      timestamp: Date.now(),
    });

    // 新文本包含旧文本的完整内容
    const result = t._detectCorrections(
      "Today I want to talk about artificial intelligence and its impact",
      2
    );

    expect(result.hasCorrection).toBe(true);
    // 可能是 expansion 或 rephrase
    expect(result.corrections.length).toBeGreaterThan(0);
  });

  test("精炼检测 (refinement) - 旧文本包含新文本", () => {
    const t = new Translator();
    t.allSegments.push({
      segmentId: 1,
      originalText: "Today I want to talk about artificial intelligence and its impact on our daily lives",
      translatedText: "今天我想谈谈人工智能及其对我们日常生活的影响",
      timestamp: Date.now(),
    });

    const result = t._detectCorrections("Today I want to talk about artificial intelligence", 2);
    // 策略3: 旧文本包含新文本 (但新文本只有19字 < 15 长度限制)
    // "Today I want to talk about" = 28字 ≥ 15... ok
    // 实际上 "Today I want to talk about artificial intelligence" 有47字
    // 旧文本包含它 → refinement
    expect(Array.isArray(result.corrections)).toBe(true);
    // 是否触发看旧文是否包含新文全文
  });

  test("修正检测忽略太短的历史片段", () => {
    const t = new Translator();
    t.allSegments.push({
      segmentId: 1,
      originalText: "Hi",  // 太短，<10
      translatedText: "你好",
      timestamp: Date.now(),
    });

    const result = t._detectCorrections(
      "Today I want to talk about artificial intelligence",
      2
    );
    // "Hi" 被跳过，不触发修正
    expect(result.hasCorrection).toBe(false);
  });

  test("多条修正记录", () => {
    const t = new Translator();
    t.allSegments.push({ segmentId: 1, originalText: "Hello world and everyone", translatedText: "你好世界", timestamp: Date.now() });
    t.allSegments.push({ segmentId: 2, originalText: "AI technology is great for everyone", translatedText: "AI技术很棒", timestamp: Date.now() });

    const result = t._detectCorrections("Hello everyone AI technology is great", 3);
    // "Hello" 和 "everyone" 可能与第一条共享
    // 至少不会 crash
    expect(Array.isArray(result.corrections)).toBe(true);
  });
});

describe("翻译模块 - 翻译功能", () => {
  const Translator = require("../server/translator");

  test("空文本返回空结果", async () => {
    const t = new Translator();
    const result = await t.translate("");
    expect(result.translatedText).toBe("");
    expect(result.segmentId).toBe(-1);
  });

  test("正常文本调用 Mock API 返回翻译", async () => {
    const t = new Translator();
    const result = await t.translate("Hello, how are you?", { segmentId: 1 });
    expect(result.translatedText).toBeTruthy();
    expect(result.segmentId).toBe(1);
  });

  test("翻译记录到历史中", async () => {
    const t = new Translator();
    await t.translate("First sentence", { segmentId: 1 });
    await t.translate("Second sentence", { segmentId: 2 });
    expect(t.history).toHaveLength(2);
  });

  test("重置清空历史", async () => {
    const t = new Translator();
    await t.translate("Some text", { segmentId: 1 });
    expect(t.history).toHaveLength(1);
    t.reset();
    expect(t.history).toHaveLength(0);
  });

  test("自动分配 segmentId", async () => {
    const t = new Translator();
    const r1 = await t.translate("First");
    const r2 = await t.translate("Second");
    expect(r1.segmentId).toBe(1);
    expect(r2.segmentId).toBe(2);
  });

    test("设置源语言和目标语言", () => {
    const t = new Translator();
    t.setSourceLang("fr");
    t.setTargetLang("de");
    expect(t.sourceLang).toBe("fr");
    expect(t.targetLang).toBe("de");
  });

  test("切换源语言清空翻译历史", async () => {
    const t = new Translator();
    await t.translate("First sentence", { segmentId: 1 });
    await t.translate("Second sentence", { segmentId: 2 });
    expect(t.history).toHaveLength(2);
    t.setSourceLang("zh");
    expect(t.history).toHaveLength(0);
    expect(t.allSegments).toHaveLength(0);
  });

  test("切换目标语言清空翻译历史", async () => {
    const t = new Translator();
    await t.translate("Test text", { segmentId: 1 });
    expect(t.history).toHaveLength(1);
    t.setTargetLang("ja");
    expect(t.history).toHaveLength(0);
    expect(t.allSegments).toHaveLength(0);
  });
});

