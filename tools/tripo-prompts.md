# Tripo 角色提示词

给 [Tripo Studio](https://studio.tripo3d.ai/) 用的提示词，风格与已有的玩家形象统一，并遵守 [`docs/art-philosophy.md`](../docs/art-philosophy.md) 里的造型规范。

## 生成与导出设置

- 每个角色单独生成，提示词 = **通用前缀 + 角色描述**。
- 姿势用 A-pose（双臂略张开），不要底座。
- 生成后做**绑骨（Rig）**，骨骼规范选 **Mixamo**。不需要加动画。
- 导出 **FBX**（和玩家形象那次一样）或 GLB。贴图多大都行，导入工具会缩到 1K。
- 面数尽量低（玩家形象是约 6000 面，这个量级正合适）。
- 武器直接写进提示词，让它握在**右手**（游戏里挥砍、施法都是右臂动作）。

导入：`node tools/import-tripo.mjs <键名> <导出的文件>`，键名见下表第一列。

## 通用前缀

```
stylized chibi game character, low-poly, hand-painted flat colors, Chinese xianxia style, full body, A-pose, arms slightly away from the body, no base,
```

## 饰物规则（接在角色描述后面，按身份选一条）

衣料素净、饰物精致，饰物只出现在头、颈、腰三处（详见美术哲学的"衣料素，饰物精"）。

- 凡人 / 散修：`plain cloth clothes, no metal ornaments, cloth hair ribbon`
- 宗门弟子：`plain robe with one colored trim, a single small silver hair clasp`
- 长老 / 首领：`plain silk robe with one colored trim, ornate silver filigree hair crown, silver necklace with turquoise and coral beads, tassels at the waist`
- 魔道：`plain black robe, black iron and bone ornaments with hooks and spikes at head and waist`

## 人形角色

| 键名 | 角色 | 角色描述（接在通用前缀后面） |
| --- | --- | --- |
| `player` | 玩家默认形象（已完成） | young cultivator man, black hair tied in a topknot with a teal ribbon, teal-green hanfu robe with white inner collar and dark sash, cloth boots, calm face, no weapon |
| `modaifu` | 墨大夫 · 第一章首领 | thin elderly physician villain, bald head, long white beard, dark grey scholar robe, his right hand is a shiny silver metal claw, sinister smile, no weapon |
| `wangchan` | 王蝉 · 第三章首领 | arrogant young demonic sect master, long black hair with a small golden hair crown, crimson and black embroidered robe with high collar, pale skin, no weapon |
| `jiyin` | 极阴祖师 · 第四章首领 | gaunt ancient evil patriarch, pale green skin, long white hair and long white eyebrows, tattered black and dark green robe with glowing green trim, long fingernails, holding a gnarled staff in right hand |
| `thug` | 野狼帮众 | rough mountain bandit, red headband, brown ragged clothes, wolf fur on shoulders, holding a curved saber in right hand |
| `archer` | 野狼帮弓手 | bandit archer wearing a conical bamboo hat, olive green clothes, quiver on back, holding a short bow in right hand |
| `ironslave` | 铁奴 | huge bald brute with iron-grey skin, iron shackles on wrists, bare chest, torn dark trousers, glowing red eyes, clenched fists, no weapon |
| `disciple` | 掩月宗弟子 | young female sect disciple, hair in a bun, lilac and white flowing robe, holding a short jade wand in right hand |
| `ghostcult` | 鬼灵门弟子 | hooded cultist, dark green hooded robe hiding the face, pale skin, glowing green eyes, bone ornaments, no weapon |
| `bloodguard` | 血侍 | masked assassin, white mask with red markings, crimson tight clothes, black scarf, holding a dagger in right hand |
| `flamecult` | 魔焰门修士 | demonic sorcerer, dark purple robe with orange flame patterns, hood down, holding a staff with a burning orb in right hand |
| `ironcorpse` | 铁尸 | Chinese jiangshi zombie in rusty iron armor, green skin, yellow paper talisman on forehead, stiff posture, long claws, no weapon |
| `corpse` | 铜甲尸 | Chinese jiangshi zombie in bronze armor, grey-green skin, yellow paper talisman on forehead, long claws, no weapon |
| `golem` | 镇殿石卫 | ancient temple guardian made of pale blue stone, carved armor with glowing blue runes, faceless helmet, holding a huge stone greatsword in right hand |
| `shopkeeper` | 坊市掌柜 | plump friendly merchant, conical bamboo hat, ochre yellow robe, abacus on belt, no weapon |

## 暂不需要的

狼、血蝠、毒蟾、蜈蚣、妖花、鬼影、火灵、冰晶傀儡、机关傀儡、墨蛟不是人形，目前的程序化动作只支持 Mixamo 人形骨骼，这些先保持代码模型。
