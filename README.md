PR 1：项目脚手架搭建
标题：feat: project scaffold - initialize project structure with Express, WebSocket, and OpenAI dependencies

功能描述：
搭建 AI 同声传译助手的基础项目骨架。包括：
1.使用 Express 提供 HTTP 服务和静态文件托管
2.使用 ws 库实现 WebSocket 实时双向通信
3.集成 OpenAI SDK（支持 Whisper 语音识别 + GPT 翻译）
4.dotenv 管理环境变量

实现思路：
1.采用前后端分离架构：server/ 存放后端模块，public/ 存放前端页面
2.后端模块化设计：config（配置管理）→ stt（语音识别）→ translator（翻译）→ websocket（通信），单向依赖
3.环境变量驱动配置，支持 .env 文件
4.使用 npm 管理依赖

测试方式：
1.执行 npm install 确认依赖安装成功无报错
2.执行 node server/index.js --demo 启动服务
3.浏览器访问 http://localhost:3000 确认页面正常加载
4.访问 http://localhost:3000/api/health 确认返回 JSON {"status":"ok"}
5.查看终端日志是否显示"服务已启动"
