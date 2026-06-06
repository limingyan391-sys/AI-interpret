PR 4：增强修正机制
标题：feat: enhanced correction mechanism with Levenshtein edit distance and progressive refinement detection

功能描述（实现智能修正系统，自动检测并纠正之前识别或翻译的错误）：
1.编辑距离分析：使用 Levenshtein 算法计算文本相似度，识别部分重叠但不同的内容
2.三种修正类型：rephrase（改述）、expansion（补充）、refinement（精炼），前端以不同标签区分
3.原位更新：前端修正到达时直接更新已有 DOM 节点，而非追加新条目
4.修正面板：独立区域展示修正记录（旧译文 → 新译文），附带置信度百分比
2.Mock 模拟修正：演示模式下模拟渐进式识别（短句→完整句子→更精确的句子）

实现思路：
1.翻译器维护 allSegments 历史列表，每次新文本到达时与最近 5 条逐条对比
2.修正检测三策略：编辑距离 0.3~0.95 → rephrase；子串包含且长度差 >30% → expansion/refinement
3.前端 translationItemMap 以 segmentId 为 key 存储 DOM 引用，修正到达时调用 _updateItemText() 原位更新
4.Mock 模块内置 6 个演讲场景，每个场景有 3 个逐步细化的版本，模拟真实 STT 的渐进式识别

测试方式：
1.执行 npm run demo 启动
2.浏览器连接后点击「开始录音」
3.观察原文面板：第一条短句出现后，几秒后出现更长的修正版本
4.观察译文面板：原译文自动更新为新译文，带有闪烁动画和「🔄 已修正」徽标
5.查看修正面板：显示 "改述/补充/精炼" 标签和置信度
6.确认旧译文有删除线，新译文有绿色高亮
