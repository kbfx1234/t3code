# Fork 功能清单

本文件列出自定义提交栈（`upstream/main..HEAD`）在 upstream 之上加的全部行为，按功能分节，每节注明来源提交的标题。SHA 每次 rebase 都会变，所以这里只写标题。
rebase 冲突时：先 `git show REBASE_HEAD` 看停在哪个提交，按标题找到对应小节，`git add` 之前逐条核对"必须保留"，解决后跑"验证"里的测试。
某个自定义提交的行为变了，就在同一个提交里更新它的小节：`git commit --fixup=<该提交>`，再 `GIT_EDITOR=true git rebase --autosquash upstream/main`。新增自定义功能时，在本文件加一节，格式同下。
`vp` 不在 PATH 上，下文的 `vp` 指 `/Users/mi/code/t3code/node_modules/.bin/vp`。刚 rebase 完测试报 effect `Context` 错误时，先跑一次 `vp i`。

## 工作预设

来源提交：`feat(web): add environment-scoped work presets`。`feat(desktop): isolate custom macOS build` 里也带了预设的修复（套用前校验、sticky 选择、`merge`、稳定空数组），`fix: localize custom work preset and Kiro usage copy` 改了它的文案。

- **做什么**：composer 底栏模型选择器左边多一个 Presets 菜单。用户可以把当前模型和推理等选项存成预设，按环境分开保存，之后套用或删除。
- **入口 / 设置**：无开关。入口是 composer 底栏的 Presets 按钮。数据存在客户端 localStorage 的 `t3code:work-presets:v1`，每个环境最多 20 条（`MAX_WORK_PRESETS_PER_ENVIRONMENT`）。
- **生效端**：web，desktop 复用 web。mobile 没有。不区分 provider，任何 `ModelSelection` 都能存。
- **关键改动点**：
  - `apps/web/src/workPresetsStore.ts`：`useWorkPresetsStore`（zustand `persist`，`version: 1`，`migrate` 和 `merge` 都经过 `normalizeWorkPresetsState`）、`save`、`remove`、`makeWorkPresetName`、`getWorkPresetsForEnvironment`。
  - `apps/web/src/components/chat/WorkPresetsMenu.tsx`：菜单组件。
  - `apps/web/src/components/chat/ComposerControlsBar.tsx`：`onApplyWorkPreset` prop；在非 `showProviderUnavailable` 分支里，`<WorkPresetsMenu>` 紧挨在 `{composerModelPicker}` 前面。
  - `apps/web/src/components/chat/ChatComposer.tsx`：传给 `ComposerControlsBar` 的 `onApplyWorkPreset` 回调。
- **必须保留**：
  - 套用前校验：`providerInstanceEntries` 里能找到该 instance，且 `enabled`、`isAvailable`、`status === "ready"`，`getModelDisabledReason` 为空，没有被 `lockedProvider` 锁到别的 driver。任一条不满足就直接返回。
  - 套用顺序：`onProviderModelSelect(instanceId, model, { focusComposer: false })`，然后 `setModelSelection(composerDraftTarget, preset.modelSelection, { explicit: true, replaceOptions: true })`，然后 `setStickyModelSelection(preset.modelSelection)`，最后 `focusComposer()`。
  - `save` 遇到 JSON 完全相同的 `ModelSelection` 时返回已有 id，不新增；新预设排在最前，超过 20 条截断。
  - 预设只在自己的 `environmentId` 下显示。`normalizeWorkPresetsState` 丢掉格式错误、`environmentId` 不符和 id 重复的条目。`merge` 保证持久化数据里混入的字段（例如 `save: null`）覆盖不了 store 的方法。
  - `getWorkPresetsForEnvironment` 没有预设时返回同一个 `EMPTY_WORK_PRESETS`，让选择器结果保持稳定引用。
  - 菜单在 `providerCatalogPending || isSendBusy` 时禁用。
- **已知冲突热点**：upstream 经常改 composer 底栏（`ComposerControlsBar` 的 props 和 resting blocks）以及 `ChatComposer` 里与模型选择有关的变量。冲突时按 upstream 的新结构把菜单放回模型选择器前面。如果 upstream 改了模型选择器判断"能否选择"的条件（改名或新增），在套用前校验里用同样的条件。
- **验证**：`vp test run apps/web/src/workPresetsStore.test.ts`。手动：存一个预设，换模型后再套用，确认模型和推理选项都恢复；切到另一个环境，确认看不到这个预设。
- **限制**：
  - 预设存在各客户端自己的 localStorage，不跨设备同步，web 和 desktop 也各存各的。需要多设备共享时再改成服务器端设置。
  - 校验不通过时套用没有任何提示。用户反馈"点了没反应"时再加提示。
  - 预设名由模型 id 和选项值自动生成，不能改名。
  - 只有 store 有测试，套用回调和菜单没有测试。

## 自定义 macOS 构建隔离

来源提交：`feat(desktop): isolate custom macOS build`。

- **做什么**：打出一个独立的 T3 Code Custom 应用，可以和官方 T3 Code 同时安装、同时运行。两者的 bundle id、T3 home、Chromium profile 和 URL scheme 都不同；自定义版不自动更新，也不改官方的 `t3` 命令。
- **入口 / 设置**：构建时设 `T3CODE_DESKTOP_CUSTOM=1`，由 `scripts/build-desktop-artifact.ts` 读取。运行时由打包进 app 的 `custom-boot.cjs` 设置 `T3CODE_DESKTOP_CUSTOM=1`、`T3CODE_HOME=~/.t3-custom`、`T3CODE_DISABLE_AUTO_UPDATE=true`，并删掉 `T3CODE_PORT` 和 `VITE_DEV_SERVER_URL`，桌面端通过 `DesktopConfig.customBuild` 读取。不设这个变量时一切与 upstream 相同。
- **生效端**：desktop（macOS 打包）；server 接受新的 renderer origin；shared 接受新的登录回跳 scheme。与 provider 无关。
- **关键改动点**：
  - `scripts/build-desktop-artifact.ts`：`resolveDesktopProductName(version, custom)`；`createBuildConfig` 里的 `appId`、`artifactName`、`publish`（custom 时保持 `null`）、`mac.protocols`、dmg `title`；`buildDesktopArtifactUnlocked` 里 stage `package.json` 的 `name: "t3code-custom"`、`main: "custom-boot.cjs"`，以及写出 `custom-boot.cjs` 的代码块。
  - `apps/desktop/src/app/DesktopConfig.ts` 的 `customBuild`；`apps/desktop/src/app/DesktopEnvironment.ts` 的 `isCustomBuild` 字段、`resolveDesktopAppBranding`、`make` 里 `baseDir` / `stateDir` 的 `t3Home` 覆盖和 `appUserModelId`。
  - `apps/desktop/src/electron/ElectronProtocol.ts`：`DESKTOP_CUSTOM_SCHEME`、`getDesktopSchemeForBuild`、`getDesktopOrigin` / `getDesktopUrl` 的 `isCustomBuild` 参数、`registerDesktopSchemePrivilegesSync` 里的 `t3code-custom` 条目。
  - 传入 `isCustomBuild` 的调用点：`DesktopApp.ts` 的 `registerDesktopProtocol`；`DesktopClerk.ts` 的 `createDesktopClerkBridge` 和 `resumeProviderAuth` 里的 `expectedOrigin`；`DesktopLifecycle.ts` relaunch 的 `appLinkPrefix`；`DesktopLinuxUrlHandler.ts`；`window/DesktopWindow.ts` 的 `getDesktopUrl` 和传给 `installMainWindowRemoteRequestHeaderPolicy` 的 `desktopOrigin`。
  - `DesktopUserData.ts` `resolveUserDataPath`：custom 时直接返回 `<appData>/t3code-custom`，不走旧 profile 迁移。`DesktopLegacyLocalStorage.ts` `load`：custom 时跳过 V1 localStorage 导入。`DesktopAppIdentity.ts`：`setName` 用 `displayName`。
  - `DesktopCliCommand.ts`：custom 时 `state` 返回 `supported: false`，`install` / `uninstall` 失败，`installOnFirstLaunch` 直接返回。
  - `apps/server/src/httpCors.ts` 的 `DESKTOP_RENDERER_ORIGINS` 加入 `t3code-custom://app`（`auth/EnvironmentAuth.ts` 和 `http.ts` 读取它）；`packages/shared/src/providerAuthReturnUrl.ts` 接受 `t3code-custom:`。
- **必须保留**：
  - 不设 `T3CODE_DESKTOP_CUSTOM` 时，构建配置和运行行为与 upstream 完全一致。
  - 设了之后：`appId` 为 `com.kbfx1234.t3code.custom`，`productName` 为 `T3 Code Custom`，产物名为 `T3-Code-Custom-${version}-${arch}.${ext}`，`publish` 为 `null`，`mac.protocols` 只有 `[{ name: "T3 Code Custom", schemes: ["t3code-custom"] }]`。
  - 自定义版运行时：`baseDir` 为 `~/.t3-custom`，`stateDir` 为 `~/.t3-custom/userdata`（即使环境里有 `T3CODE_HOME=~/.t3`）；`displayName` 为 `T3 Code Custom`，没有 stage 后缀；`appUserModelId` 为 `com.kbfx1234.t3code.custom`；Chromium profile 为 `<appData>/t3code-custom`；renderer origin 为 `t3code-custom://app`。开发模式（`isDevelopment`）仍用 `t3code-dev`。
  - 桌面端每个生成或比较桌面 scheme / origin 的地方都要传 `environment.isCustomBuild`。`getDesktopOrigin` 和 `getDesktopUrl` 的 `isCustomBuild` 默认是 `false`，漏传不会报类型错误，只会静默用回官方 origin。
  - 自定义版不安装、不卸载、不在首次启动时安装 `t3` 命令，`~/.local/bin/t3` 仍指向官方。
  - server 的 WebSocket upgrade 接受 `t3code-custom://app`，拒绝 `t3code-custom://other`。`providerAuthReturnUrl` 只接受 host 恰好为 `app` 的 `t3code-custom://` 地址。
- **已知冲突热点**：
  - upstream 新增使用桌面 origin 的代码时必须补传 `isCustomBuild`。例子是 #41092：`RemoteRequestHeaders.ts` 只在 Origin 头恰好等于 `desktopOrigin` 时才剥掉它，漏传会让自定义版连远程服务器时被 403。rebase 后跑 `git grep -nE "getDesktop(Scheme|Origin|Url)\(" -- apps/desktop/src ':!*.test.ts'`，除了 Linux 专用的 `DesktopPreReadyPlatform.ts` 和自定义版走不到的 `DesktopLegacyLocalStorage.ts` V1 读取，其余调用都应带 `isCustomBuild`，或者改用 `getDesktopSchemeForBuild`。
  - upstream 新增或修改写死的 scheme 列表时（形如 `["t3code", "t3code-dev"]` 或 `"t3code-dev://app"`），要把 `t3code-custom` 加进去。用 `git grep -nE '"t3code-dev(:|://app)?"' -- apps/server/src apps/desktop/src apps/web/src packages scripts ':!*.test.ts'` 查。
  - `createBuildConfig` 的参数表变了，要同步 `scripts/build-desktop-artifact.test.ts` 里 custom 用例的调用。stage `package.json` 原来的 `main`（`apps/desktop/dist-electron/boot.cjs`）变了，要同步 `custom-boot.cjs` 里的 `require` 路径。
  - `DesktopCliCommand` 新增对外方法时，在自定义版里同样短路。
- **验证**：`vp test run apps/desktop/src/app/DesktopEnvironment.test.ts apps/desktop/src/app/DesktopCliCommand.test.ts apps/desktop/src/app/DesktopUserData.test.ts apps/desktop/src/electron/ElectronProtocol.test.ts apps/server/src/auth/EnvironmentAuth.test.ts packages/shared/src/providerAuthReturnUrl.test.ts scripts/build-desktop-artifact.test.ts`。手动：装好后关于面板显示 T3 Code Custom，官方 app 能同时打开，远程环境能连上。
- **限制**：
  - 只为 macOS 做过。Linux 的 `DesktopPreReadyPlatform.ts` 写 `.desktop` 文件时仍用 `getDesktopScheme`，`createBuildConfig` 的 `linux.protocols` 也没改，Windows 没有验证过。要在其他平台打自定义版时再补。
  - Codex ChatGPT 登录的转交链接（`packages/shared/src/codexAuthHandoff.ts` 的 `codexAuthHandoffUrl` / `readCodexAuthHandoff`）固定用 `t3code://auth/codex`。自定义版没注册 `t3code`，从远程浏览器把登录转交给桌面这一步会打开官方 app 或者失败。需要在自定义版里走这条登录时再改。
  - SSH 环境：`apps/desktop/src/ssh/DesktopSshEnvironment.ts` 的 `resolveDesktopSshCliRunner` 按精确的 `appVersion` 下载远端运行时，`-custom.N` 版本不存在，会 404。要用自定义版连 SSH 环境时再改。
  - mac 自定义版不注册 http/https 的 Web site URL 角色。

## Kiro 斜杠菜单列出 skills、steering 和 prompts

来源提交：`feat(kiro): list Kiro skills, steering and prompts in the slash menu`。

- **做什么**：在 Kiro 线程里输入 `/`，菜单除了 `/compact` 还列出用户的 Kiro skills、steering 文件和保存的 prompts，选中后以 `/name` 文本发给 Kiro 执行。custom agent 不列出，它们由 Agent 选择器选择。
- **入口 / 设置**：无开关。该环境里要先启动过一个 Kiro session。
- **生效端**：server 把列表写进 provider snapshot 的 `slashCommands`，web 和 mobile 的 composer 命令菜单显示它。只影响 Kiro。
- **关键改动点**：
  - `packages/provider-kiro/src/server/status.ts` `kiroSlashCommands`：把 `available_commands_update` 的命令转成菜单项。
  - `packages/provider-kiro/src/server/driver.ts` `KiroDriver.create`：`liveSlashCommands`（`SubscriptionRef`）；`withLiveSlashCommands` 接在 `checkProvider` 后面；`enrichSnapshot` 在列表变化时重新发布 snapshot；`makeKiroAdapterV2Driver` 的第二个参数负责写入列表。
  - `packages/provider-kiro/src/server/adapter.ts`：`KiroAdapterV2Options.onAvailableCommandsUpdate`；`makeKiroAdapterV2Driver(defaultModel, onAvailableCommandsUpdate)`；`makeKiroAcpAdapterFlavor` 把它交给 ACP flavor 已有的 `onAvailableCommandsUpdate` hook。
  - `docs/user/providers-kiro.md` 里"Typing `/` lists your Kiro skills"一条。
- **必须保留**：
  - 列表第一项总是 T3 的 `COMPACT_SLASH_COMMAND`，Kiro 自己的 `compact` 被丢掉。
  - `_meta.kiro.type === "custom-agent"` 的命令和空名命令不列出。名称按小写去重，同名的 skill 和 steering 只保留 skill 的描述。
  - 没收到过 `available_commands_update` 时 snapshot 保持 upstream 原样（`Option.none` 分支不改 provider）。
  - 定时 `checkProvider` 刷新后，列表不会退回只有 `/compact`（靠 `Effect.flatMap(withLiveSlashCommands)`）。
- **已知冲突热点**：upstream 改 `KiroDriver` 里的 `makeManagedServerProvider` 调用（给 Kiro 加自己的 `enrichSnapshot`、改 `checkProvider` 管道）或改 `makeKiroAdapterV2Driver` 的参数时，要把双方合并，不能二选一。ACP adapter 已经在 `advertisedCommandNames` 里按 session 记录命令名；如果 upstream 开始自己发布 Kiro 的命令列表，先对比行为，这个提交多半可以删掉。
- **验证**：`vp test run apps/server/src/provider/KiroProvider.test.ts -t "slash commands"`。手动：Kiro 线程发一条消息后输入 `/`，能看到 skills。
- **限制**：
  - 列表只在内存里，按 provider instance 共享，取最近一个 session 发来的。server 重启后到第一个 Kiro session 开始前只有 `/compact`；不同项目的 workspace steering 不同时，显示的是最近启动的那个 session 的列表。需要按项目区分时再改。
  - 只测了纯函数 `kiroSlashCommands`，driver 的接线（`liveSlashCommands` 加 `enrichSnapshot`）没有测试。

## Kiro `/chat` 打开历史会话

来源提交：`feat(kiro): /chat opens earlier Kiro sessions as T3 threads`。

- **做什么**：Kiro 线程的 composer 里输入 `/chat`，弹出当前项目目录下 Kiro 保存的会话（包括在 Kiro 终端界面或 Orca 里开的），按更新时间排列。点一条就导入成 T3 线程并跳过去；已经有对应线程的直接打开。Settings → Providers → Kiro 也多了 upstream 现成的 Native sessions 列表。
- **入口 / 设置**：无开关。`/chat` 只在选中 Kiro、有项目、且 Kiro 的 `initialize` 声明了 `sessionCapabilities.list` 和 `loadSession` 时出现。
- **生效端**：web 和 desktop。mobile 没有 `/chat`。server 端走 upstream 给 ACP registry 做的通用导入：`serverListAcpRegistrySessions` / `serverImportAcpRegistrySession` RPC、`AcpRegistrySessions.importSession`、`AgentSessionImporter.importNativeHistory`。
- **关键改动点**：
  - `packages/provider-kiro/src/server/sessions.ts`：`kiroNativeSessions`（从 `initialize` 读能力，`canDelete` 固定为 `false`）、`kiroSessionPage`（把 `session/list` 结果裁到契约上限）、`makeKiroSessionManagement`（每次列表开一个短命的 `kiro-cli acp` 进程，cwd 为项目根目录；其余方法一律返回 unsupported）。
  - `status.ts` 的 `probeKiroAcp` 返回 `nativeSessions`，`snapshot()` 把它写进 provider snapshot；`driver.ts` 给实例加 `acpSessionManagement`。
  - `apps/web/src/components/chat/NativeSessionsDialog.tsx`：对话框，列表用就地定义的 `createEnvironmentRpcQueryAtomFamily`（`staleTimeMs: 0`），导入后 `navigate` 到线程。
  - `composer-logic.ts` 的 `ComposerSlashCommand` 加 `"chat"`；`useComposerMenuItems.ts` 的 `nativeSessionsAvailable` 参数和 `slash:chat` 内置项，并隐藏 provider 自己同名的 `chat`；`ChatComposer.tsx` 的 `nativeSessionsAvailable`、`nativeSessionsOpen`、选中 `chat` 的分支，对话框渲染在 `<form>` 外面。
  - `ProviderSettingsPanel.tsx` 的 `acpProjects` 和 `ProviderInstanceCard.tsx` 的 `AcpSessionManagementSection` 条件都加了 `driver === "kiro"`。
  - 5 条 web 词条（`d93d8cced8a73bd3`、`c4e648e597122001`、`27029f939daae918`、`8f81b464a52cc2a8`、`2aa1eff4fa3eff75`），10 种语言都插在 `f24b0191b4db21f6` 后面。
- **必须保留**：
  - T3 不删除 Kiro 会话（`canDelete: false`），因为同一份会话 Kiro 终端界面和 Orca 也在用。
  - `/chat` 是 web 内置命令，不放进 Kiro 的 `slashCommands`，否则 mobile 会把 `/chat` 当文本发给模型。
  - 对话框不能放在 composer 的 `<form>` 里：表单的 focus / blur / keydown 处理会把对话框当成 composer。
  - 新增词条不要用 `vp run i18n:generate` 整份重写翻译文件，它会重排所有键，之后每次 rebase 都冲突。只插入新键。
- **已知冲突热点**：`ChatComposer.tsx` 的 `onSelectComposerItem` 和返回的 JSX、`useComposerMenuItems.ts` 的 `builtInSlashCommandItems`。upstream 改了 `AcpSessionManagement` 接口（`ProviderInstance["acpSessionManagement"]`）时，`makeKiroSessionManagement` 要补齐新方法。
- **验证**：`vp test run apps/server/src/provider/KiroProvider.test.ts`。手动：在有 Kiro 历史会话的项目里选 Kiro，输入 `/chat`，点一条，确认跳到新线程且消息都在；再输一次 `/chat`，那条显示 Imported，点它直接打开同一线程。
- **限制**：
  - 只列出 cwd 恰好是项目根目录的会话。在子目录或 worktree 里开的 Kiro 会话不会出现。
  - 导入的消息时间是导入时刻，模型用 Kiro 默认，权限是 Supervised，这些都是 upstream 导入流程的默认值。
  - 只列第一页（最多 256 条），没有“加载更多”；Kiro 3.6 实测一页返回全部。
  - 菜单关掉后直接把 `/chat` 作为文本发送，会发给 Kiro 而不是打开对话框。

## Kiro 每轮 credits 与套餐额度

来源提交：`feat(kiro): show Kiro credits per turn and plan limits with overage`。

- **做什么**：Kiro 每轮最后一条回复下方显示 `Credits: turn 0.37 • session 1.20 | Time: 4s`，和 Kiro CLI 一样保留两位小数、向下截断。Usage → Limits 和 `/usage-limits` 显示本计费周期的 Credits 已用和套餐额度；开了 overage 时多一行 Overage。开了 overage 后，套餐 credits 用完不再把 Kiro 判为耗尽，直到 overage 上限用完。
- **入口 / 设置**：Settings → Providers → Kiro 的 Monthly overage limit，key 为 `overageCreditLimit`，可选字符串，默认不设，清空即删除该 key，接受 `10,000` 这种写法。不设时 Overage 行只显示用量和金额，`usedPercent` 为 0。credits 显示本身无开关。
- **生效端**：server（ACP adapter、projection、Kiro 状态探测）、web、mobile（credits 行）。Limits 通过 snapshot 的 `usageLimits` 下发，由 upstream 现有的 Limits 界面显示。只影响 Kiro：`turnCreditUsage` 是 ACP flavor 的可选 hook，其他 ACP provider 没有设置它。
- **关键改动点**：
  - `packages/contracts/src/orchestrationV2.ts`：`OrchestrationV2ProviderTurnCreditUsage`（`turn` 必填，`session`、`elapsedMs` 可选）和 `OrchestrationV2ProviderTurn.creditUsage`。
  - `packages/provider-acp/src/server/adapter.ts`：`AcpAdapterV2Flavor.turnCreditUsage`；`ActiveAcpTurn.creditUsage` 和新建 turn 时的 `creditUsage: undefined`；`projectAcpRuntimeSessionUpdateEffect` 里在 `markPromptStarted` 前合并部分结果；构建结束态 provider turn 时，在 `turnTokenUsage: acpPerTurnPromptUsage(...)` 旁边写 `creditUsage`。
  - `packages/provider-kiro/src/server/adapter.ts` `kiroTurnCreditUsage`：读 `session_info_update` 里 `_meta.kiro.kind` 为 `turn_completion` 或 `session_usage` 的帧，只累加单位是 credit(s) 的数值。
  - `packages/provider-kiro/src/server/status.ts`：`probeKiroAcp`（原 `probeKiroAgents`，并发请求 `_kiro/config/template` 和 `_kiro/account/getUsage`）；`checkKiroProviderStatus` 里的 `usageLimits` 和 `auth.label = planName`。`usageLimits.ts`：`kiroUsageLimits`、`parseKiroOverageLimit`。`settings.ts`：`overageCreditLimit` 及 `order`。
  - `packages/shared/src/usageLimits.ts` `exhaustedUsageWindow` 里的 Kiro `overage` 分支。
  - 投影：`apps/server/src/orchestration-v2/ProjectionStore.ts` 的 `upsertProviderTurn` 和 `provider-turn.updated` 分支里的 `existingRows` 条件；`packages/client-runtime/src/state/orchestrationV2Projection.ts` 的 `provider-turn.updated`。
  - 显示：`packages/client-runtime/src/state/threadExecution.ts` 的 `deriveRunCreditUsage`、`formatTurnCreditUsage`；`threadDetail.ts` 的 `runCreditUsageAtom`；`apps/web/src/state/entities.ts` 的 `useRunCreditUsage`；`apps/web/src/components/chat/TimelineAssistantRows.tsx` 的 `TurnCreditUsageFooter`（`AssistantTimelineRow` 和 `AssistantMetaTimelineRow` 两处）；`apps/mobile/src/features/threads/ThreadFeed.tsx` 的 `TurnCreditUsageFooter`（`renderFeedEntry` 的 `showAssistantMeta` 块）。
  - 文档：`docs/user/providers-kiro.md` 的 Credits and limits 一节，`docs/user/usage.md` Provider notes 里的 Kiro 一条。
- **必须保留**：
  - Kiro turn 结束后 `creditUsage` 写入结束态 provider turn，并显示在 web 和 mobile 该轮最后一条回复下方。没有 `creditUsage` 的 provider 不显示这一行。
  - 后续不带 `creditUsage` 的 `provider-turn.updated` 不会抹掉已存的值：server 的 `upsertProviderTurn` 和客户端投影都用 `next ?? current`；`existingRows` 在 `creditUsage` 缺失时也去查旧行。
  - `creditUsage`、`session`、`elapsedMs` 在 contract 里保持 optional，官方 server、官方客户端与自定义版互连时才能正常解码。
  - 只有 turn 未 finalized 且 `sessionId` 等于当前 turn 的 `nativeThreadId` 时才合并 credits；`turn` 没有值时不写 `creditUsage`。
  - `exhaustedUsageWindow`：Kiro 有 `overage` window 时只看 `overage` 是否耗尽；没有 `overage` window（overage 关闭）时按 upstream 原逻辑，`credits` 到 100% 就算耗尽。window id `credits` 和 `overage` 要和 `usageLimits.ts` 里的常量一致。
  - `_kiro/config/template` 失败只让 agent 列表为空，`_kiro/account/getUsage` 失败只让 Limits 为空，两者互不影响，也不改变 provider 状态。
  - `kiroUsageLimits` 遇到 `success: false` 或找不到 Credits 明细时返回 `undefined`；`planName` 为 `Unknown` 时不覆盖 auth label。
- **已知冲突热点**：
  - upstream 改 `upsertProviderTurn` 或 `provider-turn.updated` 里保留 `tokenUsage` 的逻辑时，`creditUsage` 按同样方式保留。
  - upstream 改 ACP adapter 的结束态 provider turn 构建或 `ActiveAcpTurn` 字段时，保住 `creditUsage` 的读和写。
  - upstream 改 Kiro 的 agent 探测时，改动要落到 `probeKiroAcp` 的 `agents` 分支，因为这里已经改名。
  - upstream 重构 `TimelineAssistantRows.tsx` 或 mobile `ThreadFeed.tsx` 的 assistant meta 时，把 footer 放回 meta 之前。
  - upstream 常在 `exhaustedUsageWindow` 的 switch 里加 provider 分支；Kiro 分支要留在 `if (model === undefined)` 之前。
- **验证**：`vp test run apps/server/src/orchestration-v2/Adapters/KiroAdapterV2.test.ts -t "credits"`；`vp test run apps/server/src/provider/KiroProvider.test.ts -t "plan credits"`；`vp test run apps/server/src/orchestration-v2/ProjectionStore.test.ts -t "preserves stored provider usage"`；`vp test run packages/client-runtime/src/state/orchestrationV2Projection.test.ts packages/shared/src/usageLimits.test.ts`。手动：跑一轮 Kiro，回复下方有 Credits 行；在 Kiro 设置里填 overage 上限后看 Usage → Limits。
- **限制**：
  - Kiro 如果在 `session/prompt` 返回之后才发 credits，这些数据会被丢掉，因为 turn 已经 finalized。Kiro CLI 3.1.0 是先发再返回；Kiro 改变顺序时再看。
  - Kiro 不通过 ACP 报告 overage 上限，只能手填。`_kiro/account/getUsage` 不在 Kiro 公布的扩展方法里，Kiro 升级后可能消失。
  - Limits 的 window label（`Credits · 4,251 / 5,000`、`Overage · ...`）在 server 端按 en-US 拼好，不随界面语言变化。Monthly overage limit 的标题和说明不在 `ProviderSettingsForm.tsx` 的 `PACKAGE_FIELD_TEXT` 里，也只显示英文。
  - 非 Kiro provider 的 `creditUsage` 总是缺失，所以几乎每个 `provider-turn.updated` 都会多一次按主键的 SELECT。如果 projection 写入变慢，改成只在需要时读旧行。
  - `deriveRunCreditUsage`、`formatTurnCreditUsage`、`runCreditUsageAtom` 和 web、mobile 的 footer 都没有测试。

## Kiro 上下文用量

来源提交：`feat(kiro): show context usage in thread details`。

- **做什么**：Kiro 只报告上下文百分比（`session_info_update` 里 `_meta.kiro.kind === "context_usage"` 的 `usagePercentage`）。现在线程详情的 Context 行会显示进度条和 `x% used · y% left`；Kiro 同时给出 token 数时按 token 显示。
- **入口 / 设置**：无开关。位置是线程详情面板的 Context 行。
- **生效端**：server、web（含 desktop）。mobile 不调用 `deriveLatestContextWindowSnapshot`，没有变化。只有 Kiro 会产出 `usedPercentage`，但 `deriveLatestContextWindowSnapshot` 和 `ThreadDetailsContext` 的改动对所有 provider 生效：有 `usedPercentage` 就优先用它。
- **关键改动点**：
  - `packages/contracts/src/providerRuntime.ts`：`ThreadTokenUsageSnapshot.usedPercentage`（optional，0 到 100）。
  - `packages/provider-acp/src/server/adapter.ts`：`AcpAdapterV2Flavor.contextUsage`；`handleSessionUpdate` 里的 `flavor.contextUsage` 分支，位于 `replyEndsWithUsageUpdate` 处理之后、upstream 的 `usage_update` / `session_info_update` 分支之前，命中后 `return`。
  - `packages/provider-kiro/src/server/adapter.ts` `kiroContextUsage`，挂在 `makeKiroAcpAdapterFlavor` 的 `contextUsage` 上；`status.ts` 的 `KIRO_PRESENTATION.reportsContextWindow: true`。
  - `packages/client-runtime/src/state/contextWindow.ts` `deriveLatestContextWindowSnapshot`：优先用 `providerUsage.usedPercentage`。
  - `apps/web/src/components/chat/ThreadDetailsUsage.tsx` `ThreadDetailsContext`：`used` 不再要求有 `maxTokens`，没有 `maxTokens` 时显示百分比。
- **必须保留**：
  - custom 分支的行为和 upstream 的 usage 处理一致：写 `contextUsageBySessionId`，更新当前 turn 的 `context.contextUsage`，对已知 provider thread 发 `provider_thread.updated`；没有 active turn 时把 `active` 改成 `idle`，并带上 `sessionScoped: true`。
  - 只报百分比时得到 `{ usedTokens: 0, usedPercentage }`；带了 `contextUsage.maxTokens` 时保留它，且 `usedTokens`、`maxTokens`、百分比都有时 `usedTokens` 按 `maxTokens * usedPercentage / 100` 重算；`usedPercentage` 截到 100。
  - `kiroContextUsage` 对 `turn_completion` 和 `session_usage` 帧返回 `undefined`，让它们继续走 upstream 的处理。
  - `usedPercentage` 在 contract 里保持 optional；没有 `usedPercentage` 的 provider 显示不变，仍由 `usedTokens / maxTokens` 计算。
- **已知冲突热点**：custom 分支是 upstream `usage_update` 处理的副本。upstream 改那段时（例如 #40220 加了 turn 结束后的 `idle` 状态和 `sessionScoped`），把同样的改动同步到 custom 分支。`deriveLatestContextWindowSnapshot` 和 `ThreadDetailsContext` 也是 upstream 常改的地方，保住上面两条显示规则。
- **验证**：`vp test run apps/server/src/orchestration-v2/Adapters/KiroAdapterV2.test.ts -t "context usage|context percentage"`；`vp test run apps/web/src/lib/contextWindow.test.ts`。手动：Kiro 线程跑一轮，打开线程详情看 Context 行。
- **限制**：
  - `ThreadDetailsContext` 显示值 `${used}% used · ${100 - used}% left` 是写死的英文模板，没走 `gt`（aria 文本和 tooltip 已经本地化）。下次改这里的文案时一起改。
  - `reportsContextWindow: true` 目前没有任何客户端读取，只是 snapshot 里的一个标记。
  - `ThreadDetailsContext` 的显示逻辑没有测试。

## 线程详情：实际运行的模型

来源提交：`feat: thread details show the model Kiro actually runs`。思路来自 xiaoxin 星尘版的 RunInspector，按 upstream 现在的线程详情卡片结构重写，没有照搬它的标签页。

- **做什么**：线程详情卡片多一节"实际运行的模型"（Model in use）。每行左边是名称（模型、推理、Agent），右边是 provider 报告的实际值；没有报告时显示这次 run 选的值。实际值和所选不同时这一行变成警告色，tooltip 里同时列出"已选"和"实际运行"。provider 有用量限制时，最后一行显示限制多久前检查过，超过 10 分钟变警告色，点击打开 Usage 页。
- **入口 / 设置**：线程详情卡片的右键菜单，或 Settings → Appearance 里的线程详情项列表，名称是 Model in use，默认显示。存在客户端设置 `threadDetailsItems.run`（只在和默认值不同时写入）。草稿线程不显示。
- **生效端**：server 只改了 Kiro：每个 turn 开始前把 Kiro 当时的 model、`effortLevel`、`mode`（agent）写进 provider thread 的 `nativeMetadata.modelSelection`。web 和 desktop 显示这一节；mobile 没有这一节，但 mobile 和 web 的 composer 都通过 upstream 已有的 `deriveReportedModelSelection` 读到这份数据：没显式选推理或 agent 时，选择器显示 Kiro 实际在用的值。其他 provider 里只有 OpenCode 本来就报告，其余显示"{provider} 不上报实际运行的内容"。
- **关键改动点**：
  - `packages/provider-acp/src/server/adapter.ts`：`AcpAdapterV2Flavor.reportedModelSelection`（在 `contextUsage` 下面）；`startTurn` 里 `rememberedContextUsage` 和 `rememberedNativeMetadata` 之间的一段：调用这个 hook，读 `runtime.getConfigOptions`，把结果合并进 `nativeMetadataBySessionId`，`instanceId` 用 `options.instanceId`。
  - `packages/provider-kiro/src/server/adapter.ts`：`kiroReportedModelSelection`（在 `applyKiroModelSelection` 下面），把 Kiro 的 `effortLevel` 映射成 T3 的 `reasoningEffort`，`mode` 原样保留；挂在 `makeKiroAcpAdapterFlavor` 的 `reportedModelSelection` 上。
  - `apps/web/src/components/chat/ThreadDetailsRun.tsx`（组件）和 `ThreadDetailsRun.logic.ts`（`pickedRunSelection`、`compareRunSelection`、`limitsAreStale`）。
  - `apps/web/src/components/chat/threadDetailsItems.ts`：`THREAD_DETAILS_ITEMS` 里 `sideChats` 和 `usage` 之间的 `run` 项。
  - `apps/web/src/components/chat/ThreadDetailsPanel.tsx`：`visible.usage` 前面渲染 `<ThreadDetailsRun>`。
  - `apps/web/src/components/chat/ThreadDetailsUsage.tsx`：`UsageRow` 改成 `export`，这一节复用它的行样式。
  - web 10 个 locale 的 8 个 key：`0d03d289d6f1e4de`、`e3121b8de893a3ec`、`261b1f42d3b003d9`、`ca2feaa9465911c0`、`5c78daa890cc4fff`、`b5649902fa639f64`、`b3e99f342ab91841`、`12f0598cb2770909`，放在 `1cbc8b5db51b4c77`（Merge）后面。
- **必须保留**：
  - `nativeMetadata.modelSelection` 在 `configureSession` 之后、turn 的 `initialNativeMetadata` 合并之前写入，所以每个 turn 发出的 provider thread 都带着 Kiro 当时的值。合并时保留已有字段（例如 `itemIdentityVersion`）。
  - 没有设置 `reportedModelSelection` 的 ACP flavor 不读 config options，行为和 upstream 一样。
  - Kiro 还没公布 `model` 选项时不报告（返回 `undefined`），不写半份数据。
  - 所选模型是 `default`（或空）时，实际模型不同不算不一致：Kiro 的默认模型本来就会解析成具体模型。只在双方都有值且不同时才标警告；只有 provider 报告的值不算不一致。
  - 别的 provider instance 的报告不参与比较。
  - "已选"取最近一个已开始的 run 的 `modelSelection`，还没有 run 时取线程自己的选择。
  - 组件用 `useQuietThreadProjection`，流式输出期间不重渲染；时间用 `useNowMinute`，每分钟最多刷新一次。
- **已知冲突热点**：
  - upstream 改 `startTurn` 里 `rememberedNativeMetadata` / `initialNativeMetadata` 的合并方式时，把这段写入放回合并之前。
  - upstream 改 `THREAD_DETAILS_ITEMS`（加项或调整顺序）、`ThreadDetailsPanel` 的 section 顺序或 `UsageRow` 的参数时，保住 `run` 项和组件调用；`UsageRow` 参数变了要同步 `ThreadDetailsRun.tsx`。
  - 如果 upstream 让 ACP adapter 自己从 config options 推出 `nativeMetadata.modelSelection`，先对比行为，Kiro 这部分多半可以删掉，只留 web 这一节。
- **验证**：`vp test run apps/server/src/orchestration-v2/Adapters/KiroAdapterV2.test.ts -t "selects the thread's agent before its model"`；`vp test run apps/web/src/components/chat/ThreadDetailsRun.logic.test.ts apps/web/src/components/chat/threadDetailsItems.test.ts`；`vp run i18n:check`。手动：Kiro 线程选一个 agent 跑一轮，打开线程详情，看模型、推理、Agent 三行和 tooltip。
- **限制**：
  - 新 session 用默认模型的第一轮里，Kiro 往往还没公布 `model` 选项，这一轮没有报告，第二轮开始才有。需要首轮就有时，再在 `config_option_update` 通知里补写。
  - 只在 turn 开始时记录。Kiro 在一轮中途自己换模型或 agent 时，要到下一轮才反映出来。
  - 只比较字符串类型的选项，布尔选项不显示。
  - "限制检查于"只看这个 provider instance 自己的 `usageLimits.checkedAt`，不看用量中心（hub）汇总来的额度。

## 自定义文案的本地化

来源提交：`fix: localize custom work preset and Kiro usage copy`。

- **做什么**：工作预设菜单、credits 行和 Context tooltip 里的 `{left}% left` 改走 i18n。
- **入口 / 设置**：无开关。
- **生效端**：web、mobile。
- **关键改动点**：`WorkPresetsMenu.tsx` 用 `T` 和 `useGT`；`formatTurnCreditUsage(usage, resolve = mFallback)` 用 `msg` 拼文案，`formatDuration` 改从 `@t3tools/shared/orchestrationTimingCopy` 引入；web 和 mobile 的 `TurnCreditUsageFooter` 传入 `useMessages()`；`ThreadDetailsUsage.tsx` 的 tooltip 用 `gt("{left}% left", ...)`。
- **必须保留**：
  - web 的 10 个 locale（`apps/web/src/i18n/translations/*.json`）都有 credits 的 4 个 key（`36200e888fa69f06`、`abed9e7ab82e9314`、`147e0feec3b3cceb`、`5a4c899d01a5c43a`）和预设的 7 个 key（`514672232c6cc2b4`、`825dae551b4667a3`、`d4020060c0068c34`、`fb8b8973c4041686`、`a06d01175a064d6e`、`488d1f917f6333fa`、`427e49eaaca97ee8`）。
  - mobile 的 10 个 locale（`apps/mobile/src/i18n/translations/*.json`）都有 credits 的 4 个 key。
- **已知冲突热点**：翻译 JSON 是最容易冲突的文件。保留双方的 key，不要手工删 key。这个提交还把 upstream 的 `ee3ae58c8b38a425`、`1cf216566c1ee064` 在 web 翻译文件里挪了位置（`gt generate` 重新排序），这类冲突保留 key 和值即可，位置不重要。key 是源文案的 hash，源文案一改 key 就变，要先 `vp run i18n:generate`，再给每个 locale 补上值。
- **验证**：`vp run i18n:check`。
- **限制**：所有非英文 locale（包括 `zh.json`）里这些 key 的值仍是英文原文，切到中文界面也显示英文。要翻译时直接改各 locale 的值。

## 构建与同步

- 日常同步脚本是仓库外的 `~/.t3-custom/auto-update/update.sh`，子命令有 `status`、`sync`（rebase 到 `upstream/main`）、`build`、`push`、`changes`、`rollback`。`sync` 停在冲突时，按本文件解决。
- 自定义 macOS 构建由 `scripts/build-desktop-artifact.ts` 读取的 `T3CODE_DESKTOP_CUSTOM=1` 驱动：bundle id `com.kbfx1234.t3code.custom`，产品名 `T3 Code Custom`，scheme `t3code-custom://app`，不发布更新源。
- T3 home `~/.t3-custom` 来自两处：构建脚本写进 app 的 `custom-boot.cjs` 设置 `T3CODE_HOME`，`DesktopEnvironment.ts` 在 `customBuild` 时也强制使用它。运行时的 `T3CODE_DESKTOP_CUSTOM=1` 也只由 `custom-boot.cjs` 设置，所以 stage 不再写出这个文件、或 stage `package.json` 的 `main` 不再指向它时，app 会按官方身份运行。
