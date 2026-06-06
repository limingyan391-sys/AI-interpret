PR 3：前端界面 - 音频捕获 + 字幕显示 + 自动连接
标题：feat: frontend UI with audio capture via MediaRecorder, dual-panel subtitle display, and auto-connect

功能描述（实现完整的用户界面）：
1.音频捕获（audio.js）：使用浏览器 MediaRecorder API 捕获麦克风，每 3 秒分段通过 WebSocket 发送到服务端
2.字幕管理（subtitles.js）：双栏布局展示原文和译文，支持自动滚动、条目去重、数量限制
3.主应用（app.js）：协调 WebSocket 通信和 UI 更新，自动检测后端服务状态并连接
4.音频可视化：Canvas 实时绘制频谱柱状图
5.响应式样式：适配桌面和移动端

实现思路：
1.MediaRecorder 以 timeslice 参数分段录制，避免音频间隙
2.使用 Web Audio API 的 AnalyserNode 获取频率数据驱动可视化
3.前端 health check 接口自动检测服务器模式（demo/production），自动连接 WebSocket
4.字幕区使用 Grid 双栏布局，原文左侧、译文右侧

测试方式：
1.执行 npm run demo 启动服务
2.浏览器访问 http://localhost:3000
3.确认页面自动连接到服务，状态指示变绿
4.点击「开始录音」，浏览器弹出麦克风权限请求
5.确认音频可视化柱状图随声音跳动
6.调整窗口大小确认响应式布局正常
7.点击「清空字幕」和「重置」按钮确认功能正常
