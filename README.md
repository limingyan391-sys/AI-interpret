PR11: 新增字幕导出功能 (SRT/TXT)

功能描述：
新增字幕导出功能，用户可将当前对话中的所有翻译字幕导出为文件（支持两种格式）。
  SRT：标准字幕格式，包含序号、时间轴和原文+译文，可在播放器中加载
  TXT：纯文本格式，包含时间戳、原文和译文，方便复制分享
操作方式：控制栏下拉框选择格式，点击「📥 导出」按钮即可下载。

实现思路：
1.前端导出模块：在 subtitles.js 中新增 exportSubtitles(format) 方法，遍历翻译面板的 .subtitle-item 元素，提取时间、原文、译文，按 SRT/TXT 格式拼接内容
2.下载策略：_downloadFile() 方法优先使用 File System Access API（showSaveFilePicker）弹出系统另存为对话框；若不支持或失败，回退到 Blob URL + 临时 <a> 标签点击触发下载
3.Bug 修复：showSaveFilePicker 在 Codex 内嵌浏览器中因安全策略抛出 SecurityError，原代码静默 return 导致导出无响应；现改为仅 AbortError（用户取消对话框）才静默，其余错误均回退到 a.click() 下载
4.UI 改动：index.html 新增导出按钮组（<select> + <button>），style.css 新增 .export-group / .export-select 样式

测试方式：
1.npm test — 全部 57 个测试通过
2.启动服务 → 连接服务器 → 录入语音产生翻译内容
3.选择 SRT → 点击导出 → 验证浏览器下载 subtitles.srt 文件，内容格式正确
4.选择 TXT → 点击导出 → 验证浏览器下载 subtitles.txt 文件，内容格式正确
5.空字幕时点击导出 → 弹出「没有可导出的字幕内容」提示
