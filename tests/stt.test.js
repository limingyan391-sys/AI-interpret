// tests/stt.test.js
// AI同声传译 - STT 模块单元测试
// 测试 browser 引擎 (文本透传) 和 whisper 引擎

describe("STT 模块 - Browser 引擎", () => {
  beforeEach(() => {
    process.env.STT_ENGINE = "browser";
    process.env.OPENAI_API_KEY = "test-key";
    jest.resetModules();
  });

  test("browser 模式透传文本", async () => {
    const SpeechToText = require("../server/stt");
    const stt = new SpeechToText();
    const result = await stt.transcribe("Hello world", "webm");

    expect(result.text).toBe("Hello world");
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("Hello world");
    expect(result.duration).toBeGreaterThan(0);
  });

  test("browser 模式清理前后空格", async () => {
    const SpeechToText = require("../server/stt");
    const stt = new SpeechToText();
    const result = await stt.transcribe("  Hello world  ");
    expect(result.text).toBe("Hello world");
  });

  test("browser 模式空文本返回空", async () => {
    const SpeechToText = require("../server/stt");
    const stt = new SpeechToText();
    const result = await stt.transcribe("");
    expect(result.text).toBe("");
  });

  test("browser 模式非字符串返回空", async () => {
    const SpeechToText = require("../server/stt");
    const stt = new SpeechToText();
    const result = await stt.transcribe(null);
    expect(result.text).toBe("");
  });
});

describe("STT 模块 - Whisper 引擎", () => {
  // Mock OpenAI Whisper API
  jest.mock("openai", () => {
    const mockCreate = jest.fn().mockResolvedValue({
      text: "Mock transcription result",
      segments: [{ text: "Mock transcription", start: 0, end: 2.5 }],
      duration: 2.5,
    });

    return jest.fn().mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: mockCreate,
        },
      },
    }));
  });

  beforeEach(() => {
    process.env.STT_ENGINE = "whisper";
    process.env.OPENAI_API_KEY = "test-key";
    jest.resetModules();
  });

  test("whisper 模式返回 API 结果", async () => {
    jest.isolateModules(async () => {
      const SpeechToText = require("../server/stt");
      const stt = new SpeechToText();
      const result = await stt.transcribe(Buffer.from("fake-audio-data"), "webm");
      expect(result.text).toBe("Mock transcription result");
    });
  });
});
