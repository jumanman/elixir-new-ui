# Elixir APK 改包工具

> 本项目是基于原始项目的二次开发版本

一个基于 Cloudflare Workers 的 APK 改包工具前端应用，提供更安全、更可靠的访问体验。

## 原始项目

- **原始地址**: [open.lihouse.xyz/elixir](https://open.lihouse.xyz/elixir)
- **二次开发**: 添加 Cloudflare Worker 代理层，解决跨域访问问题，增强安全性

## 功能特性

- 📤 **APK上传** - 支持上传APK文件进行改包
- 📋 **改包记录** - 查看历史改包记录，支持下载和更新
- 🔐 **安全登录** - 使用第三方认证系统，不存储账号密码
- 🎛️ **设置面板** - 管理隐藏包名列表，过滤不感兴趣的记录

## 技术栈

- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **后端**: Cloudflare Workers (代理层)
- **存储**: Cloudflare KV (速率限制)
- **样式**: 响应式设计，深色主题

## 项目结构

```
elixir-web/
├── assets/
│   ├── css/
│   │   └── style.css          # 全局样式
│   ├── html/
│   │   └── login-modal.html   # 登录弹窗模板
│   ├── img/
│   │   └── favicon.svg        # 网站图标
│   └── js/
│       ├── app.js             # 主应用逻辑
│       ├── config.js          # API配置
│       ├── cookie-manager.js  # Cookie管理
│       └── login.js           # 登录逻辑
├── elixir-worker/
│   ├── worker.js              # Cloudflare Worker 代理代码
│   ├── wrangler.toml          # Worker 配置
│   └── README.md              # Worker 部署说明
├── index.html                 # 主页面
├── README.md                  # 项目说明
├── LICENSE                    # 开源许可证
└── .gitignore                 # Git 忽略规则
```

## 安装部署

### 前端部署

前端是纯静态文件，可以部署到任意静态托管服务：

1. 将项目文件上传到静态托管服务
2. 配置自定义域名（可选）

### Cloudflare Worker 部署

1. 安装 Wrangler CLI：
   ```bash
   npm install -g wrangler
   ```

2. 创建 KV 命名空间：
   ```bash
   wrangler kv:namespace create "RATE_LIMIT_KV"
   ```

3. 更新 `elixir-worker/wrangler.toml` 中的 KV ID

4. 部署 Worker：
   ```bash
   wrangler deploy
   ```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/login` | POST | 用户登录（转发到第三方认证） |
| `/api/get_apks` | GET | 获取改包记录 |
| `/api/upload` | POST | 上传APK文件 |
| `/api/update/:pkgName` | GET | 更新APK |

## 安全特性

- ✅ HttpOnly Cookie 防止 XSS 攻击
- ✅ Secure Cookie 仅在 HTTPS 下传输
- ✅ Origin 白名单验证
- ✅ 请求路径白名单
- ✅ 速率限制（每分钟60次）
- ✅ 文件上传类型和大小限制
- ✅ XSS 防护（HTML转义）

## 二次开发改进

- 🔧 添加 Cloudflare Worker 代理层，解决跨域访问问题
- 🔒 增强安全措施，保护用户隐私
- 📱 优化响应式设计，提升移动端体验
- ⚡ 添加速率限制，保护服务器资源

## 开源许可

MIT License