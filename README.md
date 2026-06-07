PR10：流式 TTS — 按句子边界切割分段朗读
标题：流式 TTS 按句子边界分段朗读，减少用户等待时间

功能描述：
在流式翻译的基础上，实时检测已到达的文本中的完整句子（句号、问号、感叹号等结尾），立即触发 TTS 朗读，不必等待整句翻译完成。

使用方式：
用户说话后，翻译文本逐词展开的同时，每检测到一个完整句子立即开始语音朗读，多个句子依次排队朗读。最终翻译完成时自动朗读剩余未读完的文本。

实现思路：
1.app.js 新增三个方法：
  _extractSentences(text)：用正则运算从文本中提取完整句子
  _speakStreamingSentences(segmentId, partialText)：每个 translation_chunk 到达时调用，对比 _streamingTtsBuffer 中的已朗读位置，只处理增量文本中的完整句子，逐句加入 TTS 队列
  _flushStreamingTts(segmentId, fullText)：最终 translation 消息到达时调用，朗读流式阶段未读完的剩余文本
2.状态管理：每个 segmentId 维护 { spokenLen } 记录已朗读字符位置，增量处理避免重复朗读

测试方式：
单元测试：57 个测试全部通过（基于 streaming mock）
手动测试：启动服务器，在浏览器中打开页面，说一段包含多个句子的内容（如"今天天气真好。我们去公园吧。"），观察每完成一个句子是否立即开始 TTS 朗读，且最终没有遗漏或重复
