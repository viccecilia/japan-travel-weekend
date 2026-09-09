# 日本关西 9 条路线内容包

## 最省事：交给项目中的Codex

解压本包到项目里的 content-import/japan-travel-content-pack/，给Codex一句话：

“请读取 content-import/japan-travel-content-pack/02-CODEX_TASK.md，按说明下载照片、检查图片并更新当前项目的9条路线内容，完成后给我本地预览。”

## 自己查看

- 01-路线文案.md：完整中文文案。
- routes.zh-CN.json：机器可读路线和景点数据。
- photo-manifest.json：27张候选实景原图的来源与对应关系。
- 双击 DOWNLOAD_PHOTOS.cmd：需要已安装Python 3.9+，从Wikimedia Commons读取许可信息并下载高清原图。
- 或在当前文件夹终端运行 python download_photos.py。
- 下载后双击 preview.html：离线查看图文，核对照片是否与实际行程相符。
- photo-download-report.json：逐张成功或失败，不会把失败写成成功。
- photo-credits.json / PHOTO_CREDITS.md：下载成功照片的作者和许可。

## 本次交付边界

当前制作环境的外部图片下载受到网络限制。因此这个初始ZIP包含文案、候选图清单、下载器和预览页，**不含已经下载好的照片文件**。下载脚本的在线流程尚未在此环境实测；需要你的电脑可访问commons.wikimedia.org和upload.wikimedia.org。脚本会拒绝许可无法确认或尺寸不足的素材；不会放大低分辨率图片冒充高清。

照片清单已按名称和来源说明筛选，尚未逐张视觉验收。部分为历史照片，下载后需核对现状。7个景点/体验暂无合适或足够明确的图片，请看03-待补照片与确认事项.md。未确认设施不拿其他设施替代。

## 下载和授权

原图长边至少2000px、短边至少1200px；保留来源文件，不在下载过程中裁剪或修图。每张图单独读取许可；仅自动接受CC BY、CC BY-SA、CC0或明确Public Domain标记。作者、许可链接、原图来源和SHA-1校验记录随成功图片保存。重新运行会验证已有文件并跳过相同原图，可恢复中断下载。

## 内容准确性

路线依据你提供的景点名单编写，供应商链接未能读取。门票、餐食、温泉、列车、游船是否包含及具体停靠点，均应以你的实际产品为准。本包不包含价格、库存和发车承诺。
