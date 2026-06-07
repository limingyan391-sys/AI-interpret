// tests/websocket.test.js
// AI同声传译 - WebSocket 消息处理单元测试

jest.mock("ws", () => {
  const mockWss = { on: jest.fn(), clients: new Set(), close: jest.fn() };
  const fn = jest.fn(() => mockWss);
  fn.Server = jest.fn(() => mockWss);
  fn.OPEN = 1;
  return fn;
});

describe("WebSocket 模块", () => {
  let mockStt, mockTranslator, mockServer, WebSocketManager;
  const newWs = () => ({ readyState: 1, send: jest.fn() });

  beforeEach(() => {
    jest.resetModules();
    mockStt = {
      transcribe: jest.fn().mockResolvedValue({ text: "Hello world", segments: [], duration: 1.5 }),
    };

    const lang = { source: "en", target: "zh" };
    mockTranslator = {
      translate: jest.fn().mockResolvedValue({
        translatedText: "你好世界", segmentId: 1, isCorrection: false, corrections: [],
      }),
      reset: jest.fn(),
      setSourceLang: jest.fn((l) => { lang.source = l; }),
      setTargetLang: jest.fn((l) => { lang.target = l; }),
      get sourceLang() { return lang.source; },
      set sourceLang(v) { lang.source = v; },
      get targetLang() { return lang.target; },
      set targetLang(v) { lang.target = v; },
    };

    mockServer = {};
    WebSocketManager = require("../server/websocket");
  });

  test("构造函数初始化", () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    expect(wsm).toBeDefined();
  });

  test("_send 发送 JSON 到 OPEN 客户端", () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    wsm._send(ws, { type: "hello" });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "hello" }));
  });

  test("_send 不发送给非 OPEN 连接", () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = { readyState: 3, send: jest.fn() };
    wsm._send(ws, { type: "test" });
    expect(ws.send).not.toHaveBeenCalled();
  });

  // ===== stt_result =====
  test("stt_result 调用 STT 和翻译", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { config: {}, lastSttText: "" };

    await wsm._handleMessage(ws, Buffer.from(JSON.stringify({
      type: "stt_result", text: "Hello world", timestamp: 1,
    })), state);

    expect(mockStt.transcribe).toHaveBeenCalledWith("Hello world");
    expect(mockTranslator.translate).toHaveBeenCalled();
    expect(state.lastSttText).toBe("Hello world");
  });

  test("stt_result 空文本跳过", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { config: {} };
    await wsm._handleMessage(ws, Buffer.from(JSON.stringify({ type: "stt_result", text: "  " })), state);
    expect(mockStt.transcribe).not.toHaveBeenCalled();
  });

  test("stt_result 重复文本去重", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { config: {}, lastSttText: "Hello" };
    await wsm._handleMessage(ws, Buffer.from(JSON.stringify({ type: "stt_result", text: "Hello" })), state);
    expect(mockStt.transcribe).not.toHaveBeenCalled();
  });

  // ===== audio_config =====
  test("audio_config 更新翻译器语言", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { config: { sourceLang: "en", targetLang: "zh" } };

    await wsm._handleMessage(ws, Buffer.from(JSON.stringify({
      type: "audio_config", config: { sourceLang: "zh", targetLang: "ja" },
    })), state);

    expect(mockTranslator.setSourceLang).toHaveBeenCalledWith("zh");
    expect(mockTranslator.setTargetLang).toHaveBeenCalledWith("ja");
    expect(state.config).toEqual({ sourceLang: "zh", targetLang: "ja" });
  });

  test("audio_config 只更新提供的字段", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { config: { sourceLang: "en", targetLang: "zh" } };

    await wsm._handleMessage(ws, Buffer.from(JSON.stringify({
      type: "audio_config", config: { targetLang: "ko" },
    })), state);

    expect(mockTranslator.setSourceLang).not.toHaveBeenCalled();
    expect(mockTranslator.setTargetLang).toHaveBeenCalledWith("ko");
  });

  test("audio_config 回复确认消息", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { config: { sourceLang: "en", targetLang: "zh" } };

    await wsm._handleMessage(ws, Buffer.from(JSON.stringify({
      type: "audio_config", config: { sourceLang: "fr" },
    })), state);

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("audio_config_ack");
    expect(sent.config.sourceLang).toBe("fr");
    expect(sent.config.targetLang).toBe("zh");
  });

  // ===== reset =====
  test("reset 调用翻译器重置并清空缓冲区", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { audioBuffer: Buffer.from("data"), config: {} };

    await wsm._handleMessage(ws, Buffer.from(JSON.stringify({ type: "reset" })), state);

    expect(mockTranslator.reset).toHaveBeenCalled();
    expect(state.audioBuffer.length).toBe(0);
  });

  test("reset 回复 reset_ack", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { audioBuffer: Buffer.alloc(0), config: {} };

    await wsm._handleMessage(ws, Buffer.from(JSON.stringify({ type: "reset" })), state);

    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ws.send.mock.calls[0][0]).type).toBe("reset_ack");
  });

  // ===== ping =====
  test("ping 回复 pong", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { config: {} };
    await wsm._handleMessage(ws, Buffer.from(JSON.stringify({ type: "ping" })), state);
    expect(JSON.parse(ws.send.mock.calls[0][0]).type).toBe("pong");
  });

  // ===== 错误处理 =====
  test("损坏的 JSON 不崩溃", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { config: {} };
    await expect(wsm._handleMessage(ws, Buffer.from("not-json"), state)).resolves.toBeUndefined();
  });

  test("未知消息类型不崩溃", async () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    const ws = newWs();
    const state = { config: {} };
    await expect(
      wsm._handleMessage(ws, Buffer.from(JSON.stringify({ type: "unknown" })), state)
    ).resolves.toBeUndefined();
  });
});
