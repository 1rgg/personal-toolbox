#!/usr/bin/env bash
# CS2 Events Hub — 华为云 ECS 一键部署
#
# 用法（在服务器上以 root 执行）：
#   bash install.sh
#
# 幂等：可重复执行，已完成的步骤会跳过。

set -euo pipefail

APP_DIR=/opt/cs2-events
APP_USER=cs2events
NGINX_PORT=8080
NODE_MAJOR=22

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    ! %s\033[0m\n' "$*"; }

# ── 0. 前置检查 ────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "请以 root 执行：sudo bash install.sh" >&2
  exit 1
fi

log "环境信息"
. /etc/os-release
echo "    发行版  : $PRETTY_NAME"
echo "    架构    : $(uname -m)"
echo "    内存    : $(free -h | awk '/^Mem:/{print $2}')"

# ── 1. 安装 Node.js ────────────────────────────────────
log "检查 Node.js"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  CUR=$(node -v | sed 's/^v//' | cut -d. -f1)
  if [ "$CUR" -ge 18 ]; then
    ok "已安装 Node $(node -v)，满足 >=18 要求"
    NEED_NODE=0
  else
    warn "已安装 Node $(node -v)，版本过低，将升级"
  fi
fi

if [ "$NEED_NODE" -eq 1 ]; then
  log "安装 Node.js ${NODE_MAJOR}.x"
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y curl ca-certificates >/dev/null
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    dnf install -y nodejs >/dev/null
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl ca-certificates >/dev/null
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    yum install -y nodejs >/dev/null
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y curl ca-certificates >/dev/null
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs >/dev/null
  else
    echo "无法识别的包管理器，请手动安装 Node.js >= 18" >&2
    exit 1
  fi
  ok "Node $(node -v) 安装完成"
fi

NODE_BIN=$(command -v node)
echo "    node 路径: $NODE_BIN"

# ── 2. 安装 Nginx ──────────────────────────────────────
log "检查 Nginx"
if ! command -v nginx >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y nginx >/dev/null
  elif command -v yum >/dev/null 2>&1; then
    yum install -y nginx >/dev/null
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get install -y nginx >/dev/null
  fi
  ok "Nginx 安装完成"
else
  ok "已安装 Nginx $(nginx -v 2>&1 | sed 's/.*nginx\///')"
fi

# ── 3. 创建运行用户 ────────────────────────────────────
log "创建运行用户 $APP_USER"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
  ok "用户已创建"
else
  ok "用户已存在"
fi

# ── 4. 部署代码 ────────────────────────────────────────
log "部署代码到 $APP_DIR"
mkdir -p "$APP_DIR"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(dirname "$SCRIPT_DIR")

if [ -f "$REPO_ROOT/server.js" ]; then
  # 从上传的目录部署，排除不该上服务器的东西
  tar -C "$REPO_ROOT" \
      --exclude='.git' --exclude='.cache' --exclude='node_modules' \
      --exclude='.github' --exclude='_site' \
      -cf - . | tar -C "$APP_DIR" -xf -
  ok "代码已同步"
else
  warn "未在 $REPO_ROOT 找到 server.js，跳过代码复制"
fi

# 校验关键文件
for f in server.js index.html assets/app.js data/tournaments.json; do
  [ -f "$APP_DIR/$f" ] || { echo "缺少关键文件：$f" >&2; exit 1; }
done
ok "关键文件校验通过"

# .cache/ 必须存在且可写，否则每个请求都会重新打 Liquipedia
mkdir -p "$APP_DIR/.cache"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 750 "$APP_DIR/.cache"
ok "缓存目录就绪"

# ── 5. 安装 systemd 服务 ───────────────────────────────
log "安装 systemd 服务"
[ -f "$APP_DIR/deploy/env" ] || { echo "缺少 deploy/env" >&2; exit 1; }
# 显式钉住 node 路径，避免 systemd 环境里 PATH 不同导致找不到
sed -i "s#^ExecStart=.*#ExecStart=${NODE_BIN} ${APP_DIR}/server.js#" \
    "$APP_DIR/deploy/cs2-events.service"
chmod 640 "$APP_DIR/deploy/env"
chown root:"$APP_USER" "$APP_DIR/deploy/env"

cp "$APP_DIR/deploy/cs2-events.service" /etc/systemd/system/cs2-events.service
systemctl daemon-reload
systemctl enable cs2-events >/dev/null 2>&1
systemctl restart cs2-events
sleep 2

if systemctl is-active --quiet cs2-events; then
  ok "服务已启动"
else
  echo "服务启动失败，最近日志：" >&2
  journalctl -u cs2-events -n 30 --no-pager >&2
  exit 1
fi

# ── 6. 配置 Nginx ──────────────────────────────────────
log "配置 Nginx"
cp "$APP_DIR/deploy/nginx-cs2-events.conf" /etc/nginx/conf.d/cs2-events.conf
# 移除发行版默认站点，避免占用 80 端口和干扰
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true

if nginx -t 2>&1 | grep -q 'syntax is ok'; then
  ok "配置语法检查通过"
else
  echo "Nginx 配置有误：" >&2
  nginx -t >&2
  exit 1
fi

systemctl enable nginx >/dev/null 2>&1
systemctl restart nginx
ok "Nginx 已启动"

# ── 7. SELinux 放通（仅 RHEL 系）────────────────────────
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  log "SELinux 为 Enforcing，放通 Nginx 反代"
  setsebool -P httpd_can_network_connect 1 2>/dev/null || warn "setsebool 失败，请手动处理"
  ok "已放通"
fi

# ── 8. 防火墙 ──────────────────────────────────────────
log "检查防火墙"
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-port=${NGINX_PORT}/tcp >/dev/null
  firewall-cmd --reload >/dev/null
  ok "firewalld 已放通 ${NGINX_PORT}/tcp"
elif command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow ${NGINX_PORT}/tcp >/dev/null
  ok "ufw 已放通 ${NGINX_PORT}/tcp"
else
  ok "未检测到启用的本机防火墙"
fi

# ── 9. 验收 ────────────────────────────────────────────
log "验收"
sleep 1
HEALTH=$(curl -fsS --max-time 10 "http://127.0.0.1:5173/api/health" 2>/dev/null || echo '')
if [ -n "$HEALTH" ]; then
  ok "Node 服务健康：$HEALTH"
else
  warn "健康检查未通过，请查看 journalctl -u cs2-events -n 50"
fi

CODE=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${NGINX_PORT}/" 2>/dev/null || echo 000)
if [ "$CODE" = "200" ]; then
  ok "Nginx 反代正常（HTTP $CODE）"
else
  warn "Nginx 反代返回 $CODE"
fi

# 确认源码不再暴露
LEAK=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${NGINX_PORT}/server.js" 2>/dev/null || echo 000)
if [ "$LEAK" = "404" ]; then
  ok "源码泄露检查通过（/server.js 返回 404）"
else
  warn "警告：/server.js 返回 $LEAK，源码可能暴露！"
fi

PUBIP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo '<公网IP>')

log "部署完成"
cat <<EOF

    访问地址   http://${PUBIP}:${NGINX_PORT}
    健康检查   http://${PUBIP}:${NGINX_PORT}/api/health

    常用命令：
      systemctl status cs2-events      查看服务状态
      journalctl -u cs2-events -f      实时日志
      systemctl restart cs2-events     重启服务

    重要：请确认华为云安全组已放通 ${NGINX_PORT}/tcp 入方向，
          否则浏览器访问不到。

EOF
