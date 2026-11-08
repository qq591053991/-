# 自定义 3D 模型（可选）

游戏内置了全部角色的程序化低多边形模型。若想换成美术或 AI 生成的模型（如 Tripo、Meshy、混元 3D 导出的 `.glb`），
把文件放在本目录，并在 `manifest.json` 中登记即可，未登记的角色继续使用内置模型。

```json
{
  "models": {
    "player": "hanli.glb",
    "modaifu": { "file": "modaifu.glb", "yaw": 90, "height": 130 }
  }
}
```

| 字段 | 说明 |
|---|---|
| `file` | 本目录下的 GLB 文件名 |
| `yaw` | 朝向修正（角度）。默认按 glTF 惯例 +Z 为正前方 |
| `height` | 目标高度（游戏单位）。不填则用该角色的默认高度，脚底自动贴地 |

可替换的角色 id：`player`（韩立）、`bandit`、`archer`、`wolf`、`corpse`、`spider`、`demon`、`beast`、`jiao`、`ghost`、`pirate`、
`modaifu`（墨大夫）、`wangchan`（王蝉）、`jiyin`（极阴老祖）。

模型若带动画，会按名称自动选择：含 `walk`/`run` 的用于移动，`idle` 用于站立，`attack`/`cast` 用于施法。
