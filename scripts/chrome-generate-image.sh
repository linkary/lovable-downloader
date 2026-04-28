#!/usr/bin/env bash

name="public/icon.png"
target_color="build/images"
target_grey="build/images-grey"

# 定义尺寸和输出文件名（可以映射自定义命名）
declare -A sizes=(
  [16]="16.png"
  [32]="32.png"
  [48]="48.png"
  [64]="64.png"
  [128]="128.png"
  [256]="favicon.png"
)

# 确保目标目录存在
mkdir -p "$target_color"
mkdir -p "$target_grey"

# 检查 magick 命令是否存在
if ! command -v magick &> /dev/null; then
  echo "❌ ImageMagick (magick) command not found. Please install it." >&2
  exit 1
fi

# 检查输入文件是否存在
if [ ! -f "$name" ]; then
  echo "❌ Input file '$name' not found." >&2
  exit 1
fi

# 执行批量 resize (Color)
echo "🎨 Generating color images..."
for size in "${!sizes[@]}"; do
  output_color="${target_color}/${sizes[$size]}"
  magick "$name" -resize "${size}x${size}" "$output_color" || {
    echo "❌ Failed to resize color image to ${size}x${size}" >&2
    exit 1
  }
done
echo "✅ Color images generated successfully in $target_color"

# 执行批量 resize (Grayscale)
echo "흑 Generating grayscale images..."
for size in "${!sizes[@]}"; do
  output_grey="${target_grey}/${sizes[$size]}"
  magick "$name" -resize "${size}x${size}" -colorspace Gray "$output_grey" || {
    echo "❌ Failed to resize grayscale image to ${size}x${size}" >&2
    exit 1
  }
done
echo "✅ Grayscale images generated successfully in $target_grey"

echo "✅ All images generated successfully."
