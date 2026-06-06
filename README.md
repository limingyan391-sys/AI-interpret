# 🎙️ AI 同声传译助手

> 通过 AI 能力将实时语音流翻译成中文，以字幕形式呈现，帮助用户跨越语言障碍。

## ✨ 功能特点

- **实时语音识别**：使用 OpenAI Whisper API 将音频实时转为文字
- **智能翻译**：使用 GPT 模型将识别结果翻译为目标语言，保持语义自然
- **上下文修正**：自动检测并修正之前的识别或翻译错误
- **音频可视化**：实时显示音频频谱
- **双语字幕**：原文和译文并排展示，方便对照
- **语言选择**：支持多种源语言和目标语言切换

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18.0.0
- [OpenAI API Key](https://platform.openai.com/api-keys)
- 麦克风设备

### 安装

```bash
# 1. 克隆项目
git clone <repo-url>
cd ai-interpret

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 OpenAI API Key
```

### 运行

```bash
# 启动后端服务
npm start

# 开发模式 (带热重载)
npm run dev
```

服务启动后，浏览器访问 `http://localhost:3000` 即可使用。

## 🔧 配置说明

编辑 `.env` 文件可配置以下参数：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI API Key | - |
| `OPENAI_BASE_URL` | 自定义 API 地址 | https://api.openai.com/v1 |
| `STT_MODEL` | 语音识别模型 | whisper-1 |
| `TRANSLATION_MODEL` | 翻译模型 | gpt-4o-mini |
| `SOURCE_LANG` | 源语言 | en |
| `TARGET_LANG` | 目标语言 | zh |
| `PORT` | 服务端口 | 3000 |

## 🏗️ 项目结构

```
ai-interpret/
├── server/              # 后端服务
│   ├── index.js         # 服务入口
│   ├── config.js        # 配置管理
│   ├── stt.js           # 语音识别模块 (Whisper API)
│   ├── translator.js    # 翻译模块 (GPT) + 修正机制
│   └── websocket.js     # WebSocket 通信管理
├── public/              # 前端页面
│   ├── index.html       # 主页面
│   ├── css/
│   │   └── style.css    # 界面样式
│   └── js/
│       ├── app.js       # 主应用逻辑
│       ├── audio.js     # 音频捕获模块
│       └── subtitles.js # 字幕显示模块
├── .env.example         # 环境变量模板
├── package.json
└── README.md
```

## 🧠 技术架构

### 数据流

```
麦克风 → MediaRecorder → WebSocket → Whisper STT → GPT 翻译 → WebSocket → 字幕显示
                                          ↓               ↓
                                    错误检测 ←—— 上下文窗口 ——→ 修正推送
```

### 核心模块

1. **音频捕获** (`public/js/audio.js`)
   - 使用浏览器 `MediaRecorder` API 捕获麦克风音频
   - 每 3 秒自动分段，通过 WebSocket 发送到后端

2. **语音识别** (`server/stt.js`)
   - 调用 OpenAI Whisper API 进行语音转文字
   - 支持多种音频格式 (webm, ogg, mp4)

3. **智能翻译** (`server/translator.js`)
   - 使用 GPT 模型进行上下文感知翻译
   - 保留最近对话历史，确保翻译一致性
   - 自动检测并修正之前的翻译错误

4. **修正机制**
   - 通过文本相似度比较检测识别差异
   - 当新识别结果与历史记录部分重叠时触发修正
   - 前端用高亮动画展示修正前后对比

## 📦 依赖

- [express](https://www.npmjs.com/package/express) - HTTP 服务器
- [ws](https://www.npmjs.com/package/ws) - WebSocket 通信
- [openai](https://www.npmjs.com/package/openai) - OpenAI API 客户端
- [dotenv](https://www.npmjs.com/package/dotenv) - 环境变量管理

## 🤝 贡献

欢迎提交 Issue 或 PR！
