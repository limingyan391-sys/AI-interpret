// tests/websocket.test.js
// AI同声传译 - WebSocket 消息处理单元测试
// 测试消息路由和处理逻辑

// Mock ws 模块
jest.mock("ws", () => {
  const mockWss = {
    on: jest.fn(),
    clients: new Set(),
    close: jest.fn(),
  };

  const mockWebSocket = jest.fn(() => mockWss);
  mockWebSocket.Server = jest.fn(() => mockWss);
  mockWebSocket.OPEN = 1;

  return mockWebSocket;
});

describe("WebSocket 模块", () => {
  let mockStt, mockTranslator, mockServer, WebSocketManager;

  beforeEach(() => {
    // 重置所有 mock
    jest.resetModules();

    mockStt = {
      transcribe: jest.fn().mockResolvedValue({
        text: "Hello world",
        segments: [],
        duration: 1.5,
      }),
    };

    mockTranslator = {
      translate: jest.fn().mockResolvedValue({
        translatedText: "你好世界",
        segmentId: 1,
        isCorrection: false,
        corrections: [],
      }),
      reset: jest.fn(),
      setSourceLang: jest.fn(),
      setTargetLang: jest.fn(),
      sourceLang: "en",
      targetLang: "zh",
    };

    mockServer = {};

    WebSocketManager = require("../server/websocket");
  });

  test("构造函数初始化", () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);
    expect(wsm).toBeDefined();
    expect(wsm.clients).toBeDefined();
  });

  test("_send 发送 JSON 到客户端", () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);

    const mockWs = {
      readyState: 1, // WebSocket.OPEN
      send: jest.fn(),
    };

    wsm._send(mockWs, { type: "test", data: "hello" });

    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: "test", data: "hello" }));
  });

  test("_send 不发送给非 OPEN 状态的连接", () => {
    const wsm = new WebSocketManager(mockServer, mockStt, mockTranslator);

    const mockWs = {
      readyState: 3, // CLOSED
      send: jest.fn(),
    };

    wsm._send(mockWs, { type: "test" });
    expect(mockWs.send).not.toHaveBeenCalled();
  });
});
