# 部署到华为云 ECS

纯 IP 访问方案（无域名、无需 ICP 备案）。

## 架构

```
浏览器  →  <SERVER_IP>:8080  (Nginx)
                                    │ 反代 + 拦截 force=1 + gzip
                                    ↓
                              127.0.0.1:5173  (Node server.js, systemd)
                                    │
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
        静态文件 (index/assets/data)      /api/* → Liquipedia
                                          （磁盘缓存 .cache/）
```

Node 进程**只监听回环**，公网一律走 Nginx。这样即使 Node 有漏洞也不会直接暴露。

## 文件说明

| 文件 | 作用 |
|---|---|
| `install.sh` | 一键部署（幂等，可重复执行） |
| `cs2-events.service` | systemd 单元：开机自启、崩溃重启、权限加固 |
| `env` | 运行时配置（端口、UA、缓存时长） |
| `nginx-cs2-events.conf` | Nginx 反代配置 |

## 一键部署

在服务器上以 root 执行：

```bash
# 1. 把项目传上去（在你本机执行）
scp -r D:\code\git\CS2-events root@<SERVER_IP>:/root/

# 2. 登录服务器执行安装
ssh root@<SERVER_IP>
bash /root/CS2-events/deploy/install.sh
```

## 必须手动做的一步：放通安全组

`install.sh` 只管本机防火墙，**华为云安全组要在控制台改**：

> 控制台 → 弹性云服务器 ECS → 安全组 → 入方向规则 → 添加规则
> 协议端口：`TCP: 8080`，源地址：`0.0.0.0/0`

这一步不做，浏览器访问 `http://<SERVER_IP>:8080` 会一直转圈。

## 为什么用 8080 而不是 80

中国大陆节点的 **80/443 端口在未 ICP 备案时会被运营商拦截**，表现为连接超时。纯 IP 访问不涉及备案，但运营商仍会拦标准 HTTP 端口，所以用 8080。

将来如果买了域名并完成备案，改 `nginx-cs2-events.conf`：

```nginx
listen 80;
server_name your-domain.com;
```

然后加证书（Let's Encrypt 免费）即可。

## 验收清单

```bash
# 服务在跑
systemctl is-active cs2-events        # 期望 active
systemctl is-active nginx             # 期望 active

# 接口正常
curl -s localhost:5173/api/health
# 期望 {"ok":true,"uptimeSec":...,"pageMapEntries":23,...}

# 反代正常
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/          # 期望 200

# 源码不再泄露
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/server.js # 期望 404
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/.git/config # 期望 404

# force=1 被拦截
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:8080/api/live?force=1' # 期望 403
```

## 上线前已修复的问题

原版 `server.js` 把**仓库根目录**当站点根，导致以下文件可被公网直接下载：

| 路径 | 修复前 | 修复后 |
|---|---|---|
| `/server.js` | 200（36 KB 源码） | 404 |
| `/.git/config` | 200（仓库信息） | 404 |
| `/package.json` | 200 | 404 |
| `/tools/*.js` | 200 | 404 |
| `/README.md` | 200 | 404 |

改为**白名单**：只放行 `index.html`、`calendar.html`、`assets/`、`data/`。同时补了畸形 `%XX` 编码的 400 处理。

## 数据新鲜度

`server.js` 是懒加载缓存：**有请求才刷新**。访问量低时赛历会一直是旧的。

建议加一条定时预热（每 30 分钟触发一次，与 `CACHE_TTL_MS` 对齐）：

```bash
# root 执行 crontab -e，加一行
*/30 * * * * curl -fsS --max-time 30 http://127.0.0.1:5173/api/live > /dev/null 2>&1
```

注意**不要**加 `?force=1`，那会绕过缓存直接打 Liquipedia。

## Liquipedia 访问节制

README 里记录过：开发时连续请求触发过 IP 临时封禁。当前配置已按默认值保守设置：

- 全局最小间隔 3 秒（串行排队）
- 429 后全局冷却 30 分钟
- 页面缓存 6 小时
- 逐场数据限 21 天、每次最多 2 个赛事

**不要调小 `MIN_GAP_MS`。** 一旦被封，赛历会退化成内置快照，状态条会显示原因。

## 运维

```bash
journalctl -u cs2-events -f          # 实时日志
systemctl restart cs2-events         # 重启
systemctl status cs2-events          # 状态

du -sh /opt/cs2-events/.cache        # 缓存占用（增长很慢）
```

更新代码：重新 `scp` 后执行 `bash /root/CS2-events/deploy/install.sh`，脚本会重启服务。

## 常见问题

**浏览器打不开，curl 本机却正常**
→ 安全组没放通 8080，见上文。

**`/api/live` 返回 502 且 hint 提到冷却**
→ Liquipedia 限流了。等 30 分钟自动恢复，期间前端会用内置快照，站点不会坏。

**逐场比分一直是空**
→ 该赛事在 Liquipedia 上没有独立比赛页，或 `data/page-map.json` 未映射。属已知限制。
