# 修改记录

本文按 `git diff bb2f7b1..main` 的实际差异生成，不是按开发过程追述。分叉点 `bb2f7b1` 与上游 `zarazhangrui/youtube-digest` 当前的 `main` 相同（2026-10-18 核对，上游领先 0 个提交），因此这份差异就是本 fork 相对原始仓库的全部改动。

## 差异总览

18 个文件新增 1083 行、删除 261 行，另有本文。下表按新增行数排序。

| 文件 | 增删 | 性质 |
| --- | --- | --- |
| `options.js` | +203 −24 | 改造 |
| `models.js` | +191 | 新增 |
| `background.js` | +143 −40 | 改造 |
| `settings.js` | +114 −18 | 重写 |
| `tests/models.test.js` | +80 | 新增 |
| `tests/settings.test.js` | +79 −12 | 重写 |
| `options.html` | +67 −34 | 改造 |
| `README.md` | +49 −41 | 改写 |
| `README.zh-CN.md` | +46 −40 | 改写 |
| `options.css` | +37 | 新增样式 |
| `tests/release.test.js` | +26 −30 | 断言改写 |
| `tests/translation.test.js` | +18 −6 | 断言改写 |
| `PRIVACY.md` | +9 −9 | 改写 |
| `tests/options-language.test.js` | +8 −3 | 断言改写 |
| `tests/transcript-search.test.js` | +6 −1 | 断言改写 |
| `manifest.json` | +3 −1 | 权限 |
| `SECURITY.md` | +2 −2 | 改写 |
| `scripts/check-release.sh` | +2 | 白名单 |
| `CHANGES.md` | 本文 | 新增 |

## 一、AI 服务层：从固定 DeepSeek 改为三服务商免费模型

### 1.1 服务商注册表（`settings.js`）

上游把服务商写死在默认值里：

```js
DEFAULTS = { provider: "deepseek", aiBaseUrl: "https://api.deepseek.com",
             aiModel: "deepseek-v4-flash" }
```

`normalize()` 每次都用默认值覆盖 `provider`、`aiBaseUrl`、`aiModel`，`chatCompletionsUrl()` 不接受参数。现在改为注册表：

- 三个条目 `openrouter`、`hermes`、`kilo`，每项只描述 `baseUrl`、`auth`（`key` / `none` / `optional`）、`keyField`、`autoModel`。
- 新增 `getProvider()`、`hasAiCredentials()`、`resolveModel()`、`authHeaders()`、`modelsUrl()`；`chatCompletionsUrl()` 改为接受设置对象。
- **`aiBaseUrl` 字段整体删除**，接口地址不再进入 Chrome 存储，用户无法把请求指向别处。
- 旧的自定义服务商迁移时，模型名与密钥一起清空（模型属于被移除的那个接口）。

### 1.2 模型发现（`models.js`，新增）

三个服务商返回同一套模型列表结构（`data[]` 加 `pricing`、`supported_parameters`、`context_length`），因此一个解析器覆盖全部：

- 只保留 `pricing.prompt` 与 `pricing.completion` 都为 0 的模型；路由别名（`kilo-auto/free`）没有价格字段时按名字判定。
- 剔除无法输出文本的模型。Kilo 的 `google/lyria-3-*` 是音乐生成，价格同样为 0，靠 `architecture.output_modalities` 过滤。
- 列表缓存十分钟，写入 `ytd_models_cache`；`429` / `404` 状态写入 `ytd_model_status`，按服务商与模型名分区。

### 1.3 请求路径（`background.js`）

- `importScripts` 增加 `models.js`。
- 请求按服务商路由：`chatCompletionsUrl(settings)` 与 `authHeaders(settings)` 取代写死的地址与 `Bearer ${settings.aiApiKey}`。
- 删除 `body.thinking = { type: "disabled" }`。这是 DeepSeek 专用字段；Kilo 对 `reasoning: { enabled: false }` 直接返回 400（该端点强制推理），因此两个字段都不再发送。
- 空响应重试：免费模型多为推理模型，`max_tokens` 过小时预算会全部消耗在 `reasoning_tokens` 上、`content` 返回空串。检测到该情形按倍数放大预算重试，上限四倍。
- 失败回退：`429` 与 `404` 写入状态表并改用另一个免费模型；回退时排除刚失败的模型，否则没有路由别名的服务商会解析回同一个模型。
- 五处凭据判断改为 `hasAiCredentials()`（四处 `!settings.aiApiKey` 与一处 `hasAiKey`），Hermes 无密钥也能通过。

### 1.4 设置界面（`options.html`、`options.js`、`options.css`）

上游只有一个静态的「Supported AI provider」徽章和一个密钥输入框。现在：

- 服务商下拉、免费模型下拉、刷新按钮、状态行。
- 状态行显示免费模型数量与更新时间；被标记的模型在下拉里显示「限流中」或「不可用」。
- 密钥输入行按服务商切换：OpenRouter 显示必填密钥，Kilo 显示可选密钥，Hermes 隐藏密钥行并提示启动命令。
- 文案键统一为 `aiApiKeyLabel`、`aiHelp`、`aiKeyLink`、`aiHelpSuffix`、`addAiKey`、`kiloApiKeyLabel`、`providerNote*`、`modelStatus*`，中英各一份。

### 1.5 权限（`manifest.json`）

```diff
-    "https://api.deepseek.com/*"
+    "https://openrouter.ai/*",
+    "https://api.kilo.ai/*",
+    "http://127.0.0.1:8645/*"
```

`127.0.0.1:8645` 是 Hermes 代理的默认端口。

## 二、提示词加载的换行符处理（`background.js`）

净差异只有两行，但在 Windows 上是致命的。

上游 `loadPromptSection()` 用 `/```(?:[A-Za-z0-9_-]+)?\n([\s\S]*?)\n```/` 从提示词文件取代码块。仓库按 CRLF 检出时，围栏后面紧跟 `\r`，可选语言组吃不掉它，`\n` 也匹配不上 `\r`，于是每个章节都被判定为"没有代码块"，抛出 `Prompt section not found`。英文原文不经过这条路径，所以表现为"英文字幕正常，中文翻译和概览全错"。

修复方式是在取到文本后统一换行符：

```js
markdown = (await response.text()).replace(/\r\n/g, "\n");
```

**`prompts/` 下四个文件相对上游一个字节都没改**，修的是读取端。

## 三、文档

- `README.md` 与 `README.zh-CN.md`：DeepSeek 段落改为三服务商对照表与各自的获取方式，新增 Hermes 代理与 Kilo 的使用说明；删除已失效的 DeepSeek 价格表（该表对应的接口与模型在本 fork 中已移除）；顶部增加 fork 声明并指向本文。
- `PRIVACY.md`：数据流向从 DeepSeek 改为 OpenRouter，9 行改写。
- `SECURITY.md`：受信任来源列表从 DeepSeek 改为 OpenRouter，2 行改写。

## 四、测试与发布脚本

- 新增 `tests/models.test.js`（80 行）：模型列表解析、免费判定、文本能力过滤、状态键分区。
- `tests/settings.test.js` 重写：注册表、`auto` 解析、各服务商鉴权方式、迁移行为。
- `tests/release.test.js`：服务商与链接断言改为三服务商；原先禁止 `<select>` 与 `id="aiModel"` 的两条断言改为要求这两个控件存在。
- `tests/translation.test.js`：不再断言发送 `thinking` 字段，改为断言不发送 `thinking` 与 `reasoning`；测试沙箱改为加载真实的 `settings.js` 与 `models.js`。
- `tests/options-language.test.js`：占位符与链接断言改为 OpenRouter。
- 四个测试文件的 `read()` 统一做换行符归一化。这些断言按 LF 编写，在 CRLF 检出下必然失败，属于"本地红、CI 绿"的来源。
- `scripts/check-release.sh`：发布白名单加入 `models.js`，共 23 个文件。

## 五、未改动的部分

`sidepanel.html`、`sidepanel.css`、`sidepanel.js`、`content.js`、`prompts/` 下四个文件、`package.json` 相对上游没有差异。侧边栏通过后台返回的 `hasAiKey` 判断配置状态，因此无需改动。

## 六、行为变化

- **不再支持 DeepSeek**：接口地址、模型名、host 权限都已移除，旧设置里的 DeepSeek 密钥在迁移时被清空。
- 只有价格为 0 的模型会被列出与调用，不存在误选付费模型的可能。
- 使用 Hermes 服务商时需要本机常驻 `hermes proxy start`；代理未启动时请求返回 401，设置页会显示连接错误。

## 七、复现差异

```bash
git fetch origin
git diff origin/main..main --stat
```

## 八、验证

```bash
npm test      # 72 项全部通过
npm run check # 发布检查通过，23 个文件
```
