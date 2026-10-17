# 修改记录

本文件记录本 fork 相对上游 `zarazhangrui/youtube-digest` 的全部改动。上游不接受 Issue 与 Pull Request，因此改动只保留在本仓库。

## 一、修复：中文翻译与概览全部报错

**现象**：英文原文正常，中文与双语字幕的翻译失败，概览也失败，控制台报 `Prompt section not found: translation.md#Chinese rules` 与 `analysis.md#System prompt`。

**根因**：`background.js` 的 `loadPromptSection()` 用正则 `/```(?:[A-Za-z0-9_-]+)?\n([\s\S]*?)\n```/` 从提示词文件里取代码块。仓库在 Windows 上按 CRLF 检出，代码围栏后面紧跟的是 `\r`，可选语言组吃不掉它，`\n` 也匹配不上 `\r`，于是每个章节都被判定为"没有代码块"。英文原文不经过这条路径，所以只有中文与概览受影响。

**修复**：取到文本后先统一换行符，再进缓存。

```js
markdown = (await response.text()).replace(/\r\n/g, "\n");
```

一处改动覆盖四个提示词文件的所有章节。

## 二、修复：设置页中英文案键不一致

英文文案已改名为 `openrouter*` 前缀，中文仍是 `deepseek*`，而 `options.html` 引用的是 `deepseek*`。结果是英文界面下 API 密钥的标签与链接渲染为空。已统一为与厂商无关的 `aiApiKeyLabel`、`aiHelp`、`aiKeyLink`、`aiHelpSuffix`、`addAiKey`，中英各一份。

## 三、修复：`PRIVACY.md` 内容损坏

一次全局替换把整份文件打成了 `DeepSeek / OpenRouter (new provider: openrouter/free)`，连接口地址都变成了 `https://api.DeepSeek / OpenRouter (...).com`。已清理为正常表述。

## 四、新增：多服务商免费模型选择

设置页现在可以选服务商与免费模型，只列出价格为 0 的模型。

| 服务商 | 密钥 | 说明 |
| --- | --- | --- |
| OpenRouter | 必需 | `openrouter/free` 路由，在 OpenRouter 当前的免费模型之间分发 |
| Hermes 代理（Nous Portal） | 不需要 | 读取本地 `hermes proxy` 暴露的免费模型，凭证由代理持有 |
| Kilo Gateway | 可选 | `kilo-auto/free` 加免费阵容，目前匿名请求可用 |

**实现要点**

- `settings.js` 改为服务商注册表，每项只描述 `baseUrl`、鉴权方式（必需 / 不需要 / 可选）与自动模型。接口地址不再存进设置，用户无法把请求指向别处。
- 新增 `models.js`：三个服务商返回同一套模型列表结构，一个解析器通吃。只保留价格为 0 的条目，并剔除无法输出文本的模型（Kilo 的 `google/lyria-3-*` 是音乐生成，价格同样为 0）。列表缓存十分钟，打开设置页与点击刷新都会重新拉取。
- 请求失败时标注并换模型：`429`（限流）与 `404`（已下线）会写入状态表，设置页在对应模型后标注"限流中"或"不可用"，请求自动改用另一个免费模型，而不是直接失败。
- 移除 DeepSeek 专用参数：`thinking: { type: "disabled" }` 已删除。Kilo 对 `reasoning: { enabled: false }` 直接返回 400（该端点强制推理），因此两个字段都不再发送。
- 空响应重试：免费模型多为推理模型，`max_tokens` 过小时预算会全部消耗在 `reasoning_tokens` 上，`content` 返回空串。现在检测到"空内容且推理 token 大于零"时，按倍数放大预算重试，最多四倍。

**服务商实测结论**

- Nous Portal 直连不可用：`https://inference-api.nousresearch.com/v1` 的模型列表公开，但聊天接口只认 OAuth 令牌，填静态密钥会返回 401。因此 Nous 只能走 Hermes 代理。
- OpenCode 与 WorkBuddy 未接入：前者本地服务需要鉴权且端口动态，没有 OpenAI 兼容端点；后者没有对外模型端点。

## 五、测试

`npm test` 共 72 项，全部通过。新增 `tests/models.test.js` 覆盖模型列表解析、免费判定与文本能力过滤。

Windows 上四个测试文件的 `read()` 统一做了换行符归一化。此前这些断言按 LF 编写，在 CRLF 检出下必然失败，属于"本地红、CI 绿"的假阳性来源。

## 六、文档

`README.md`、`README.zh-CN.md`、`PRIVACY.md`、`SECURITY.md` 全部改为三服务商口径，并删除了已失效的 DeepSeek 价格表（该表对应的接口与模型在本 fork 中已不再使用）。免费额度部分不写具体数字，只说明价格为 0、限流会变、以服务商文档为准。

## 七、验证方式

```bash
npm test
npm run check
```

本地实测：Kilo 匿名请求返回正确的中文 JSON，`cost` 为 0；Hermes 代理在首选免费模型返回 404 后自动换用下一个模型并成功返回。
