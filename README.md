PR 6：修复语言切换不同步 Bug
标题：language switching not applied to translator - runtime config changes now take effect immediately

功能描述：
修复目标语言/源语言切换不生效的 Bug。用户在前端下拉框修改语言后，服务端翻译器仍然使用初始配置，导致所有翻译结果始终输出默认语言。

实现思路：
在 Translator 类中新增 setSourceLang(lang) 和 setTargetLang(lang) 方法
WebSocket 的 audio_config 处理分支中，在更新 state.config 的同时调用 translator 的 set 方法
语言切换在下一次翻译请求时即时生效（_buildSystemPrompt() 每次调用都读取 this.targetLang 最新值）

测试方式：
1.启动服务，浏览器连接
2.说中文，确认翻译为默认目标语言（如英文）
3.下拉框将目标语言改为「日语」
4.再说一句中文，确认翻译结果变为日语
5.依次改为韩语、法语等多个语言，逐一验证
6.切换源语言（如改为西班牙语）并说西班牙语，确认翻译正常
7.观察服务端日志，确认打印 [翻译] 目标语言切换为: ja 等切换记录
