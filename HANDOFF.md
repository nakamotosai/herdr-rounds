# HANDOFF · herdr-rounds

> 2026-11-02 · v0.7.1 已发布（GitHub `main` + `v0.7.1`，CI 双绿）。用户口令「先不管了，收口」，本轮停在此处。

## 现状

面板主体是 herdr 的虚拟 `list` + `VirtualListScrollHandle`：每轮加载时先 `scroll_to_item(最后一行)`
再把 `scroll_to_bottom()` 落 4 次（120/300/700/1200ms），切标签视为「进入」，同样落到底。

## Commands run（真实返回）

```
herdr-app status            → errors []
herdr-app check mods/rounds → check passed
node --test                 → pass 20, fail 0
gh run list --limit 2       → main / v0.7.1 均 success
git rev-list --count origin/main..HEAD → 0
```

## Verified by the user（2026-11-02）

- **鼠标点击**：卡片展开/收起、「展开更早 N 轮」经用户实测正常（虚拟列表的 `on_item_click(key)` 路径成立）。

## Not verified

1. 用户报的「卡片重叠 + 间距消失 + 进来看不到最新」在我这侧复现不出：同一对话（32 轮）截图正常。
   已加两道防护（行内 `pb(6)` 包裹、卡片 `overflow_hidden()`），但**没有在故障现场验证过**。

## Next safe action（只一件）

在报故障的那个标签上截图取证：`herdr-app shot <png>` 后看是否仍重叠；若重叠，记下当时面板宽度
与是否刚发生过窗口缩放——怀疑是行高按旧宽度测量导致的残影。

## Rollback

`git revert ea72fc7`（0.7.1）→ `git revert 6a2566f`（0.7.0，回到普通滚动容器，代价是最新消息又不可见）。

## Confidence

3/5 —— 渲染与落底在本机实测通过，点击与用户的故障现场未取证。
