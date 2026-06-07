// tests/config.test.js
// AI同声传译 - 配置模块单元测试
// 注意: .env 文件存在时，dotenv.config() 会自动加载
// 需在 require 前设好环境变量阻止 dotenv 覆盖

describe("配置模块", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    // dotenv.config() 不会覆盖已存在的环境变量
    // 预置空值来阻止 .env 文件的值被加载
    process.env.OPENAI_API_KEY = "";
    process.env.OPENAI_BASE_URL = "";
    process.env.STT_ENGINE = "";
    process.env.TRANSLATION_MODEL = "";
    process.env.SOURCE_LANG = "";
    process.env.TARGET_LANG = "";
    process.env.PORT = "";
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // ========== 默认值 ==========
  test("无环境变量时使用默认值", () => {
    const config = require("../server/config");

    expect(config.llm.apiKey).toBe("");
    expect(config.llm.baseURL).toBe("https://api.openai.com/v1");
    expect(config.sttEngine).toBe("browser");
    expect(config.translation.model).toBe("deepseek-chat");
    expect(config.translation.sourceLang).toBe("en");
    expect(config.translation.targetLang).toBe("zh");
    expect(config.server.port).toBe(3000);
  });

  // ========== 环境变量覆盖 ==========
  test("环境变量能正确覆盖默认值", () => {
    process.env.OPENAI_API_KEY = "sk-test-key-12345";
    process.env.OPENAI_BASE_URL = "https://api.deepseek.com/v1";
    process.env.STT_ENGINE = "whisper";
    process.env.TRANSLATION_MODEL = "gpt-4o";
    process.env.SOURCE_LANG = "ja";
    process.env.TARGET_LANG = "ko";
    process.env.PORT = "4000";

    const config = require("../server/config");

    expect(config.llm.apiKey).toBe("sk-test-key-12345");
    expect(config.llm.baseURL).toBe("https://api.deepseek.com/v1");
    expect(config.sttEngine).toBe("whisper");
    expect(config.translation.model).toBe("gpt-4o");
    expect(config.translation.sourceLang).toBe("ja");
    expect(config.translation.targetLang).toBe("ko");
    expect(config.server.port).toBe(4000);
  });

  // ========== hasApiKey ==========
  test("有效 API Key 返回 true", () => {
    process.env.OPENAI_API_KEY = "sk-real-key";
    const config = require("../server/config");
    expect(config.hasApiKey()).toBe(true);
  });

  test("空 API Key 返回 false", () => {
    const config = require("../server/config");
    expect(config.hasApiKey()).toBe(false);
  });

  test("默认占位符 Key 返回 false", () => {
    process.env.OPENAI_API_KEY = "sk-your-api-key-here";
    const config = require("../server/config");
    expect(config.hasApiKey()).toBe(false);
  });

  // ========== getMode ==========
  test("DeepSeek URL 识别为 DeepSeek 模式", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_BASE_URL = "https://api.deepseek.com/v1";
    const config = require("../server/config");
    expect(config.getMode()).toBe("deepseek");
  });

  test("OpenAI URL 识别为 OpenAI 模式", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    const config = require("../server/config");
    expect(config.getMode()).toBe("openai");
  });

  test("无 Key 返回 demo 模式", () => {
    const config = require("../server/config");
    expect(config.getMode()).toBe("demo");
  });

  // ========== 端口解析 ==========
  test("字符串数字端口正确解析", () => {
    process.env.PORT = "8080";
    const config = require("../server/config");
    expect(config.server.port).toBe(8080);
  });

  test("无效端口使用默认值 3000", () => {
    process.env.PORT = "not-a-number";
    const config = require("../server/config");
    expect(config.server.port).toBe(3000);
  });
});
