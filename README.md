# 个人工具箱 · Personal Toolkit

把散落在五个仓库里的自用小工具收进**一个站点**：统一导航、统一视觉、一个域名、一个 Node 进程。

线上地址：<https://cs2.20260717.xyz>

| 路径 | 工具 | 说明 |
| --- | --- | --- |
| `/` | 门户 | 五件工具总览与入口 |
| `/cs2/` | 赛事看板 | CS2 全年赛历、进行中进度、开赛倒计时、当日对阵与逐图比分 |
| `/cs2/calendar.html` | 赛事行程表 | 按月铺开的完整赛程 |
| `/trend/` | 资产走势 | A 股 / 指数 / ETF / 场外基金的分时、K 线、净值曲线 |
| `/railway/` | 火车出行 | 12306 中转方案、直达车次、票价查询 |
| `/gold/` | 积存金 | 记录积存与赎回，按实时金价估算市值与浮动盈亏 |
| `/track/` | 快递物流 | 单号查询与轨迹时间线 |

## 设计原则

- **一套设计令牌**：`assets/site.css` 定义暖纸底 + 墨黑字 + 蓝/金/青绿语义色，并带完整暗色方案（`prefers-color-scheme`）。所有子站只用令牌，不写死颜色。
- **一套导航**：`assets/site.js` 在页面加载后注入顶栏与页脚，按 `data-app` 与路径前缀高亮当前栏目，改导航只需动一个文件。
- **零构建、零依赖**：没有打包器、没有框架、`dependencies: {}`。浏览器直接跑源码，改完刷新即生效。
- **依赖本地化**：ECharts 与 Chart.js 放在 `assets/vendor/`，不依赖 CDN；图标全部内联 SVG。
- **密钥不进浏览器**：快递与 12306 的第三方凭据只存在于服务端环境变量，由 `/api/track`、`/api/railway` 代理注入。

## 目录结构

```
.
├── server.js                  # 唯一后端：静态服务 + 接口代理（约 1.2k 行，零依赖）
├── index.html                 # 门户首页
├── assets/
│   ├── site.css               # 全站设计令牌与组件样式
│   ├── site.js                # 顶栏 / 页脚注入与栏目高亮
│   ├── app.js, style.css      # CS2 看板前端
│   ├── 5eplay.js              # 5EPlay 赛程解析
│   └── vendor/                # echarts.min.js, chart.umd.min.js
├── cs2/                       # 赛事看板（独立子目录，资源前缀 /cs2/）
├── trend/                     # 资产走势
├── railway/                   # 火车出行（单文件，内联样式令牌化）
├── gold/                      # 积存金（单文件，内联样式令牌化）
├── track/                     # 快递物流
├── data/                      # 赛历缓存与页面映射 JSON
└── deploy/                    # systemd 单元、Nginx 配置、安装脚本
```

## 本地运行

```bash
git clone <this-repo> && cd <repo>
node server.js          # 默认 http://127.0.0.1:5173
```

只需要 Node ≥ 18，无需 `npm install`。

## 环境变量

复制 `deploy/env.example` 为 `deploy/env`（或直接 `export`）后按需填写：

| 变量 | 说明 |
| --- | --- |
| `PORT` / `HOST` | 监听地址，生产环境固定 `127.0.0.1:5173` |
| `LIQUIPEDIA_UA` | 带联系邮箱的 User-Agent，Liquipedia 接口条款要求 |
| `CACHE_TTL_MS` / `PAGE_TTL_MS` / `MIN_GAP_MS` / `COOLDOWN_MS` | 缓存与限流参数，`MIN_GAP_MS` 不要调小，否则会触发 IP 封禁 |
| `APIHZ_ID` / `APIHZ_KEY` | 快递与 12306 第三方接口凭据，**只在服务端使用**，未配置时相关接口返回 501 |

`/api/health` 会回报 `apihzConfigured`，可用来确认凭据是否注入成功。

## 接口

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/live` | GET | 赛事实时状态 |
| `/api/matches` | GET | 当日对阵 |
| `/api/track?number=` | GET | 快递轨迹代理，单号 `^[A-Za-z0-9-]{6,40}$`，缓存 60s |
| `/api/railway?kind=` | POST | 车次代理，`kind=transfer\|direct\|price`，缓存 3min |
| `/api/gold` | GET | 实时金价，附带服务端采样的 24 小时日内序列，缓存 5min |
| `/api/health` | GET | 健康检查 |

金价日内序列由访问触发的采样累积而来（5 分钟一桶，存 `.cache/gold-intraday.json`，保留 48 小时），因此刚部署时曲线点位较稀疏，属正常现象。

## 部署

见 [`deploy/README.md`](deploy/README.md)：systemd 单元 + Nginx 反代，Node 只监听回环地址，公网流量一律经 Nginx。

## 受限网络下的推送

如果服务器能访问 `api.github.com` 但无法完成 `github.com` 的 git 传输（表现为 `GnuTLS recv error (-110)`），
可以改用 Git Data API 推送，无需 git 协议：

```bash
GH_TOKEN=<personal access token> python3 deploy/git-push-api.py 1rgg/personal-toolbox .
```

脚本会按内容缓存 blob，重复推只上传变化的文件；空仓库首次可用，因为它会先落一个种子提交。

## 数据来源

Liquipedia、5EPlay、腾讯财经、东方财富、12306 数据服务、快递查询、tmini 金价接口。全部为公开接口，站点仅做展示与聚合，仅供个人学习研究，不构成任何投资、出行或交易建议；接口可用性由第三方决定。

## License

MIT