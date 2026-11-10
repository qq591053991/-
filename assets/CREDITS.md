# 素材与第三方代码致谢

## Tripo 生成的角色

| 文件 | 角色 | 说明 |
| --- | --- | --- |
| `assets/tripo/player.glb` | 玩家默认形象 | 由仓库所有者使用 [Tripo AI](https://www.tripo3d.ai) 生成并绑定 Mixamo 规范骨骼后导出，经 `tools/import-tripo.mjs` 精简（贴图 8K → 1K、网格量化）。 |

这些模型的使用须遵守生成账号在 Tripo 对应套餐下的条款。模型只带骨骼、不带动画，游戏里的动作由 `js/assets.js` 按骨骼程序化生成。

## 社区角色模型

其余人形角色（山贼、弩手、铁奴、墨大夫、掩月宗弟子、鬼灵门弟子、血侍、铁尸、魔焰门修士、镇殿石卫、铜甲尸、王蝉、极阴祖师、坊市掌柜）目前使用社区的免费模型；哪个角色有了 Tripo 模型，就会自动改用 Tripo 的：

| 素材包 | 作者 | 许可 | 来源 |
| --- | --- | --- | --- |
| KayKit Character Pack: Adventurers (1.0) | Kay Lousberg（[kaylousberg.com](https://www.kaylousberg.com)） | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | <https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0> |
| KayKit Character Pack: Skeletons (1.0) | Kay Lousberg | CC0 1.0 | <https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0> |

用到的角色：Mage、Barbarian、Knight、Rogue、Rogue_Hooded、Skeleton_Warrior，以及它们共用的 15 段骨骼动画。

对原始文件做的处理（脚本见 `tools/build-models.mjs`）：

- 九个角色共用同一套骨骼，动画只保留用到的片段并单独存一份；
- 每个角色文件去掉动画，网格做量化压缩；
- 以 base64 打包进 `assets/models.js`；
- 运行时按角色对贴图换色（例如把法师的紫袍改成青袍，作为玩家形象的后备方案），并按需显示 / 隐藏帽子、披风、武器等配件。

CC0 不要求署名，这里列出是为了感谢作者。

## 其余模型

妖兽、鬼物、傀儡、墨蛟、场景物件与交互物（狼、血蝠、毒蟾、蜈蚣、妖花、鬼影、火灵、冰晶、灯笼、松竹……）没有使用外部素材，是在 `js/models.js` 里用 Three.js 基础几何体拼出来的。社区模型加载失败时，人形角色也会退回这套内置模型。

## 代码

- [three.js](https://threejs.org) r147（MIT 许可）：`lib/three.min.js`，以及其示例目录中的 `lib/GLTFLoader.js`、`lib/SkeletonUtils.js`。
- 模型精简工具（仅开发时使用）：[glTF-Transform](https://gltf-transform.dev)（MIT 许可）。
