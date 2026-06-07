PR 8：自我测试功能
标题：add unit tests for core modules with Jest (45 tests, all passing)

功能描述：
使用 Jest 框架为项目核心模块添加单元测试，共 45 个测试用例，全部通过。（运行方式：npm test）

测试内容：
1.config 模块：默认值加载、环境变量覆盖、API Key 检测、模式识别（DeepSeek/OpenAI/Demo）、端口解析
2.translator 模块：Levenshtein 编辑距离算法、三种修正检测策略（rephrase/expansion/refinement）、翻译流程、历史记录管理、重置
3.stt 模块：browser 模式文本透传、whisper 模式 API 调用 mock
4.mock 模块：模拟 STT 双模式输入、模拟翻译字典匹配、修正检测
5.websocket 模块：服务初始化、JSON 消息发送、连接状态判断

测试方式：
1.npm test           # 运行所有测试
2.npm run test:watch  # 监听模式--运行后 Jest 不会退出，持续监听文件变化，改一行代码保存后，关联的测试自动重新运行，秒级反馈。
3.npm run test:coverage  # 覆盖率报告--运行完会在终端和文件系统里生成覆盖率报告，存到coverage/ 文件夹里面有 HTML 报告，浏览器打开可以交互式查看每行代码是否被覆盖。
