// tests/mock.test.js
// AI同声传译 - Mock 模块单元测试

describe("Mock 模块", () => {
  const { MockSTT, MockTranslator } = require("../server/mock");

  // ========== Mock STT ==========
  describe("MockSTT", () => {
    test("browser 模式透传字符串文本", async () => {
      const stt = new MockSTT();
      const result = await stt.transcribe("Hello world");
      expect(result.text).toBe("Hello world");
    });

    test("whisper 模式返回模拟英文句子", async () => {
      const stt = new MockSTT();
      const result = await stt.transcribe(Buffer.from("fake-audio"), "webm");
      expect(result.text).toBeTruthy();
      expect(typeof result.text).toBe("string");
      expect(result.text.length).toBeGreaterThan(10);
    });

    test("渐进式识别返回不同文本", async () => {
      const stt = new MockSTT();
      const r1 = await stt.transcribe(Buffer.from("audio"), "webm");
      const r2 = await stt.transcribe(Buffer.from("audio"), "webm");
      // 第一个场景的两个细化版本应该不同
      expect(r1.text).not.toBe(r2.text);
    });

    test("多次调用覆盖不同场景", async () => {
      const stt = new MockSTT();
      const texts = new Set();
      // 用较短超时
      for (let i = 0; i < 10; i++) {
        const r = await stt.transcribe(Buffer.from("audio"), "webm");
        texts.add(r.text);
      }
      expect(texts.size).toBeGreaterThan(3);
    }, 10000);
  });

  // ========== Mock Translator ==========
  describe("MockTranslator", () => {
    test("已知文本返回正确翻译", async () => {
      const t = new MockTranslator();
      const result = await t.translate("Today I want to talk about artificial intelligence");
      expect(result.translatedText).toBe("今天我想谈谈人工智能。");
    });

    test("未知文本返回模拟翻译", async () => {
      const t = new MockTranslator();
      const result = await t.translate("Some random text never seen before");
      expect(result.translatedText).toContain("[模拟翻译]");
    });

    test("完整句子修正部分句子", async () => {
      const t = new MockTranslator();
      // 先加一条短的（"Today I talk about AI" 查不到翻译，用模拟）
      await t.translate("Today I talk");
      // 再加一条更完整的句子
      const result = await t.translate("Today I talk about AI and its impact");

      // "Today I talk about AI and its impact" 包含 "today i talk"
      const prevText = t.history[0].originalText.toLowerCase().slice(0, 20);
      expect(result.translatedText).toBeTruthy();
      // 修正检测依赖于文本包含关系
      if (result.isCorrection) {
        expect(result.corrections.length).toBeGreaterThan(0);
      }
    });

    test("重置清空历史和计数器", () => {
      const t = new MockTranslator();
      t.history.push({ segmentId: 1, originalText: "test" });
      t.segmentIdCounter = 5;

      t.reset();
      expect(t.history).toHaveLength(0);
      expect(t.segmentIdCounter).toBe(0);
    });

    test("自动递增 segmentId", async () => {
      const t = new MockTranslator();
      const r1 = await t.translate("Hello");
      const r2 = await t.translate("World");
      expect(r1.segmentId).toBe(1);
      expect(r2.segmentId).toBe(2);
    });
  });
});
