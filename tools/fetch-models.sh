#!/usr/bin/env bash
# 下载原始模型素材到 .model-src/（不入库）。素材许可见 public/models/CREDITS.md
set -euo pipefail
SRC=${MODEL_SRC:-.model-src}
TMP=$(mktemp -d)
mkdir -p "$SRC"

fetch_kaykit() { # repo 子目录
  local repo=$1 sub=$2
  git clone -q --depth 1 --filter=blob:none --sparse "https://github.com/KayKit-Game-Assets/$repo" "$TMP/$repo"
  git -C "$TMP/$repo" sparse-checkout set "$sub"
  cp "$TMP/$repo/$sub"/*.glb "$SRC/"
  cp "$TMP/$repo/LICENSE.txt" "$SRC/LICENSE-$repo.txt"
}

fetch_kaykit KayKit-Character-Pack-Adventures-1.0 addons/kaykit_character_pack_adventures/Characters/gltf
fetch_kaykit KayKit-Character-Pack-Skeletons-1.0  addons/kaykit_character_pack_skeletons/Characters/gltf
curl -fsSL -o "$SRC/Fox.glb" https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb

rm -rf "$TMP"
ls -la "$SRC"
