#!/bin/bash
# AI 生成的动作序列图（网格排列）→ 透明动图 sprite
# usage: scripts/sheet2sprite.sh <sheet.png> <cols> <rows> <name> [frame_ms=280]
# 产出: src/renderer/public/sprites/<name>.webp（带 alpha，播放一次停在末帧）
set -euo pipefail

IN=$1
COLS=$2
ROWS=$3
NAME=$4
D=${5:-280}
OUT="src/renderer/public/sprites/${NAME}.webp"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

W=$(sips -g pixelWidth "$IN" | awk '/pixelWidth/{print $2}')
H=$(sips -g pixelHeight "$IN" | awk '/pixelHeight/{print $2}')
CW=$((W / COLS))
CH=$((H / ROWS))
echo "[1/3] 切片 ${COLS}x${ROWS}，每格 ${CW}x${CH} ..."
n=1
for ((r = 0; r < ROWS; r++)); do
  for ((c = 0; c < COLS; c++)); do
    ffmpeg -y -loglevel error -i "$IN" -vf "crop=${CW}:${CH}:$((c * CW)):$((r * CH))" \
      "$TMP/f_$(printf %03d "$n").png"
    n=$((n + 1))
  done
done

echo "[2/3] Vision 逐帧抠图 ..."
mkdir -p "$TMP/masked"
swift scripts/maskseq.swift "$TMP" "$TMP/masked"

echo "[3/3] 合成动态 WebP（每帧 ${D}ms）..."
img2webp -loop 1 -d "$D" "$TMP"/masked/*.png -o "$OUT"
sips -g pixelWidth -g pixelHeight "$OUT"
FRAMES=$((COLS * ROWS))
echo "完成: $OUT (总时长 $((FRAMES * D))ms)"
