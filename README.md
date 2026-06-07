PR9：流式翻译 — 逐词推送到前端实时显示
标题：实现流式翻译，翻译结果逐 token 推送到前端实时展示

功能描述：
将 LLM API 调用改为流式模式（stream: true），翻译结果不再等整句生成完毕才一次性返回，而是每个 token 生成后立即通过 WebSocket 推送到前端，前端逐词展开显示，并带有光标闪烁动画提示"正在翻译中"。

使用方式：
用户说话后，翻译区域会立即出现"翻译中..."标签，随后翻译文本逐词追加展开，末尾有闪烁光标 |，整句完成后自动替换为普通字幕样式。

实现思路：
1.translator.js：API 调用改为 stream: true，在 for await 循环中通过 onChunk(delta, partialText, segmentId) 回调逐 token 推送
2.websocket.js：_handleSttResult 传入 onChunk 回调，每个 delta 封装为 translation_chunk 消息发送给客户端
3.subtitles.js：新增 updateStreamingTranslation(segmentId, partialText) 方法，管理流式条目的创建与实时更新；addTranslation 收到最终结果时自动清除对应的流式条目
4.app.js：新增 translation_chunk 消息处理，调用 subtitleManager.updateStreamingTranslation 更新显示
5.style.css：新增 .streaming 和 .streaming-cursor 样式，含闪烁光标动画
6.优化：browser 模式跳过 stt.transcribe() 无意义调用；修复语言切换时 _clearHistory() 重置 segmentIdCounter 导致前端 ID 碰撞覆盖旧条目的 bug

测试方式：
单元测试：57 个测试全部通过
手动测试：启动服务器，在浏览器中打开页面，开始录音后说话，观察翻译区域是否逐词展开显示
