# Lovable Downloader

[English](./README.md)

一个 Chrome 扩展，用于将 [Lovable.dev](https://lovable.dev) 项目源代码一键下载为 ZIP 压缩包。

Lovable.dev 支持导出项目源代码，但需要先连接 GitHub 仓库。这个扩展跳过了这一步 — 点击图标，几秒内即可获得整个项目的 ZIP 文件。无需 GitHub，无需配置，即点即下。

![](https://img.alicdn.com/imgextra/i1/O1CN01bPzMcU1XkBt6ZRgzh_!!6000000002961-1-tps-1248-664.gif)

## 安装

### 从 Chrome 应用商店安装（推荐）

直接从 [Chrome 应用商店](https://chromewebstore.google.com/detail/lovable-downloader/cnemhgoighlimfpldmdiblekokblokho) 安装。

### 从 GitHub Releases 下载

1. 从 [Releases](../../releases) 下载最新的 `extension-*.zip`
2. 解压文件
3. 打开 `chrome://extensions`
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

### 从源码构建

```bash
npm install
npm run build
```

在 Chrome 中加载 `build/` 目录作为未打包的扩展：

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `build/` 文件夹

## 使用方法

1. 在 [lovable.dev](https://lovable.dev) 上打开任意项目页面
2. 点击工具栏中的 Lovable Downloader 图标
3. 等待进度环完成
4. 在弹出的保存对话框中保存 ZIP 文件

如需取消正在进行的下载，再次点击图标即可。

## 开发

```bash
npm run dev
```

自动监听文件变更并重新构建。每次重新构建后需在 Chrome 中重新加载扩展。

## 脚本

| 脚本 | 说明 |
|------|------|
| `npm run dev` | 监听模式，自动重新构建 |
| `npm run build` | 生产环境构建，输出到 `build/` |
| `npm run build:zip` | 构建并打包为 `.zip` |
| `npm run typecheck` | TypeScript 类型检查 |
| `bash scripts/trim-icon.sh [padding%]` | 裁剪图标边距（默认 5%，最大 40%） |

## 架构

```
src/
  service-worker.ts    # 后台 Service Worker — API 调用、下载编排、进度图标
  content-script.ts    # Toast 通知 UI（Shadow DOM）、令牌中继
  inject.ts            # 页面上下文脚本，从 localStorage 读取 Supabase 认证令牌

scripts/
  build.mjs            # esbuild 生产构建
  dev.mjs              # esbuild 监听模式
  chrome-manifest.mjs  # Manifest v3 定义
  chrome-prebuild.mjs  # 复制 manifest 和静态资源到 build/
  chrome-generate-image.sh  # 通过 ImageMagick 生成各尺寸图标
  chrome-zip.mjs       # 将 build/ 打包为 .zip
  trim-icon.sh         # 裁剪和调整源图标边距

public/
  icon.png             # 扩展图标（192x192，用作所有尺寸的源文件）
  icon-original.png    # 未修改的原始图标，用于幂等裁剪
```

## 工作原理

1. 扩展通过 `webRequest` 被动捕获 Lovable API 认证令牌
2. 当用户在 Lovable 项目页面点击扩展图标时：
   - 解析认证信息（拦截的令牌或 Supabase localStorage 回退方案）
   - 从 Lovable API 获取项目文件列表
   - 并发下载所有文件（每批 5 个）
   - 将所有文件打包为 ZIP 并触发浏览器下载
3. 通过扩展图标上的圆形进度环和 Toast 通知展示进度

## 许可证

MIT
