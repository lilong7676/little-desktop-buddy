#!/bin/bash
# AI 生成视频 → 透明动图 sprite 管线
# usage: scripts/video2sprite.sh <input.mp4> <name> [fps=12] [height=512]
# 产出: src/renderer/public/sprites/<name>.webp（带 alpha，播放一次后停在末帧）
set -euo pipefail

IN=$1
NAME=$2
FPS=${3:-12}
H=${4:-512}
OUT="src/renderer/public/sprites/${NAME}.webp"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "[1/3] 抽帧 ${FPS}fps ..."
ffmpeg -y -loglevel error -i "$IN" -vf "fps=${FPS},scale=-2:${H}" "$TMP/f_%03d.png"

echo "[2/3] Vision 逐帧抠图 ..."
mkdir -p "$TMP/masked"
swift scripts/maskseq.swift "$TMP" "$TMP/masked"

echo "[3/3] 合成动态 WebP ..."
D=$((1000 / FPS))
img2webp -loop 1 -d "$D" "$TMP"/masked/*.png -o "$OUT"

sips -g pixelWidth -g pixelHeight "$OUT"
FRAMES=$(ls "$TMP/masked" | wc -l | tr -d ' ')
echo "完成: $OUT (${FRAMES} 帧, 总时长 $((FRAMES * D))ms)"
echo "下一步: 在 src/main/pets.ts 的对应猫咪 animations 里注册该文件"
