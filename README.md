# 🎙️ AI 同声传译助手

> 通过 AI 能力将实时语音流翻译成目标语言，以字幕 + 语音形式呈现，帮助用户跨越语言障碍。

## ✨ 功能特点

- **实时语音识别**：使用浏览器 Web Speech API 识别语音（免费，无需 API Key）
- **智能翻译**：支持 DeepSeek / OpenAI 双模式，翻译结果自然流畅
- **TTS 语音朗读**：翻译结果自动朗读，实现真正的同声传译
- **上下文修正**：智能检测并修正之前的识别或翻译错误（编辑距离 + 词级重叠分析）
- **音频可视化**：实时显示音频频谱
- **双语字幕**：原文和译文并排展示，支持原位修正更新
- **多语言支持**：英语/中文/日语/韩语/法语/德语/西班牙语互译
- **一键演示**：`npm run demo` 零配置即可体验完整功能

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18.0.0
- 麦克风设备
- [Chrome](https://www.google.com/chrome/) 或 [Edge](https://www.microsoft.com/edge) 浏览器
- （可选）[OpenAI](https://platform.openai.com/api-keys) 或 [DeepSeek](https://platform.deepseek.com/api-docs) API Key

### 安装

```bash
# 1. 克隆项目
git clone <repo-url>
cd ai-interpret

# 2. 安装依赖
npm install

# 3. 配置环境变量（使用翻译功能时需要）
cp .env.example .env
# 编辑 .env 文件，填入你的 API Key
```

### 运行

```bash
# 演示模式（无需 API Key，推荐先体验）
npm run demo

# 生产模式（需配置 API Key）
npm start

# 开发模式（带热重载）
npm run dev
```

服务启动后，用 **Chrome 或 Edge** 浏览器访问 `http://localhost:3000` 即可使用。

## 🔧 配置说明

编辑 `.env` 文件可配置以下参数：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI / DeepSeek API Key | - |
| `OPENAI_BASE_URL` | API 基础地址（DeepSeek: https://api.deepseek.com/v1） | https://api.openai.com/v1 |
| `STT_ENGINE` | 语音识别引擎 (`browser` 或 `whisper`) | browser |
| `TRANSLATION_MODEL` | 翻译模型（DeepSeek: `deepseek-chat`, OpenAI: `gpt-4o-mini`） | deepseek-chat |
| `SOURCE_LANG` | 源语言 | en |
| `TARGET_LANG` | 目标语言 | zh |
| `PORT` | 服务端口 | 3000 |

### DeepSeek 配置示例

```bash
OPENAI_API_KEY=sk-你的DeepSeekKey
OPENAI_BASE_URL=https://api.deepseek.com/v1
TRANSLATION_MODEL=deepseek-chat
STT_ENGINE=browser
```

### OpenAI 配置示例

```bash
OPENAI_API_KEY=sk-你的OpenAIKey
TRANSLATION_MODEL=gpt-4o-mini
STT_ENGINE=browser
```

## 🏗️ 项目结构

```
ai-interpret/
├── server/              # 后端服务
│   ├── index.js         # 服务入口 (自动检测 DeepSeek/OpenAI/Demo 模式)
│   ├── config.js        # 配置管理
│   ├── stt.js           # 语音识别模块 (browser / whisper 双引擎)
│   ├── translator.js    # 翻译模块 + Levenshtein 修正检测
│   ├── websocket.js     # WebSocket 通信管理
│   └── mock.js          # 演示模式模拟模块
├── public/              # 前端页面
│   ├── index.html       # 主页面
│   ├── css/
│   │   └── style.css    # 界面样式
│   └── js/
│       ├── app.js       # 主应用逻辑
│       ├── audio.js     # Web Speech API 语音捕获
│       └── subtitles.js # 字幕显示 + TTS 引擎
├── tests/               # 单元测试
│   ├── config.test.js   # 配置模块测试 (12 tests)
│   ├── translator.test.js # 翻译+修正检测测试 (17 tests)
│   ├── stt.test.js      # STT 引擎测试 (5 tests)
│   ├── mock.test.js     # 模拟模块测试 (8 tests)
│   └── websocket.test.js # WebSocket 消息路由测试 (13 tests)
├── .env.example         # 环境变量模板
├── package.json
└── README.md
```

## 🧠 技术架构

### 数据流

```
                          浏览器端                             服务端
                    ┌──────────────────┐            ┌──────────────────┐
                    │ Web Speech API   │────文本───▶│  DeepSeek/GPT    │
                    │ (语音识别, 免费)  │  stt_result │  翻译引擎        │
                    │                  │◀───翻译────│                  │
                    │ TTS 语音朗读      │  translation└──────────────────┘
                    │ 字幕 + 修正显示   │
                    └──────────────────┘
                           ↑ 用户
                    麦克风 + 扬声器
```

### PR 演进历程

```
PR 1: 项目脚手架搭建
PR 2: 后端服务 - WebSocket + STT + 翻译
PR 3: 前端增强 - 自动连接 + 原位修正UI
PR 4: 增强修正机制 - Levenshtein 编辑距离检测
PR 5: DeepSeek API 集成 + 浏览器端 Web Speech API
PR 6: 修复语言切换不同步 Bug
PR 7: TTS 语音合成 - 翻译结果自动朗读
PR 8: 单元测试 - Jest 框架, 55 tests, 77% 覆盖率
```

### 核心模块

1. **语音识别** (`public/js/audio.js`)
   - 使用浏览器内置 `SpeechRecognition` API（Chrome/Edge）
   - 免费、无需 API Key
   - 支持连续识别 + 实时中间结果显示
   - 支持运行时切换识别语言

2. **智能翻译** (`server/translator.js`)
   - 支持 DeepSeek / OpenAI 双模式（API 格式兼容）
   - 上下文感知翻译，保留最近 10 条历史
   - 系统提示词控制翻译风格和输出格式

3. **修正机制** (`server/translator.js`)
   - Levenshtein 编辑距离计算文本相似度
   - 三策略检测：改述 (rephrase) / 补充 (expansion) / 精炼 (refinement)
   - 词级重叠检测防止误报（要求 ≥4 字母的共同实词）
   - 最小文本长度限制（≥15 字符）

4. **TTS 语音朗读** (`public/js/subtitles.js`)
   - 使用浏览器 `SpeechSynthesis` API
   - 自动朗读翻译结果，支持朗读队列防重叠
   - 根据目标语言自动选择对应语音
   - 一键开关，朗读状态指示器

5. **单元测试** (`tests/`)
   - Jest 测试框架，55 个测试用例全部通过
   - 覆盖率：config 100% / translator 91% / mock 100% / websocket 51%

## 📦 依赖

### 运行时
- [express](https://www.npmjs.com/package/express) ^4.21.0 - HTTP 服务器
- [ws](https://www.npmjs.com/package/ws) ^8.18.0 - WebSocket 通信
- [openai](https://www.npmjs.com/package/openai) ^4.73.0 - OpenAI/DeepSeek API 客户端
- [dotenv](https://www.npmjs.com/package/dotenv) ^16.4.7 - 环境变量管理

### 开发
- [jest](https://jestjs.io/) ^29.7.0 - 单元测试框架

### 浏览器要求
- Google Chrome 25+ / Microsoft Edge 79+（必需，Web Speech API 支持）
- 浏览器需允许麦克风权限
- TTS 功能需浏览器支持 Speech Synthesis（Chrome/Edge 全版本支持）

## 🧪 运行测试

```bash
npm test              # 运行所有测试 (55 tests)
npm run test:watch    # 监听模式
npm run test:coverage # 覆盖率报告
```
