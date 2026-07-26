# Elixir APK 改包工具

> 本项目是基于原始项目的二次开发版本

一个基于 Cloudflare 的 APK 改包工具前端应用，提供优化。

## 原始项目

- **原始地址**: [open.lihouse.xyz/elixir](https://open.lihouse.xyz/elixir) 【本项目基于 calyxor 的 Elixir 项目 null进行二次开发，最终服务全部由该项目提供，并非由本项目提供（感谢 calyxor 大佬 /比心 /比心 ）】
- **二次开发**: 添加 Cloudflare Worker 代理层，解决跨域访问问题。

## 功能特性

- 🎛️ **设置面板** - 管理隐藏包名列表，过滤不需要的记录，同时对相同包名合并同类项

## 技术栈

- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **代理**: Cloudflare Workers
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
│   └── worker.js              # Cloudflare Worker 代理代码
├── index.html                 # 主页面
├── README.md                  # 项目说明
├── LICENSE                    # 开源许可证
└── .gitignore                 
```

## 安全特性

- ✅ HttpOnly Cookie 防止 XSS 攻击
- ✅ Secure Cookie 仅在 HTTPS 下传输
- ✅ Origin 白名单验证（仅允许配置的源跨域访问）
- ✅ 请求路径白名单（防止路径遍历和未授权端点访问）
- ✅ 下载端点文件扩展名白名单（仅允许 .apk）
- ✅ 速率限制（基于 Cloudflare KV，每分钟60次）
- ✅ 客户端登录限流（指数退避，防止暴力破解）
- ✅ 文件上传类型和大小限制（50MB）
- ✅ XSS 防护（DOM API 代替 innerHTML，HTML 转义，DOMParser 清理）
- ✅ 内容安全策略（CSP）限制资源加载来源
- ✅ HSTS 强制 HTTPS 传输
- ✅ X-Frame-Options 防止点击劫持
- ✅ X-Content-Type-Options 防止 MIME 嗅探
- ✅ Referrer-Policy 控制 Referrer 泄露
- ✅ localStorage 数据完整性校验（检测篡改）
- ✅ CORS 凭据仅对白名单源开放（Vary: Origin）
- ✅ Set-Cookie 安全属性保留（仅移除 Domain，保留 HttpOnly/Secure/SameSite）
- ✅ 请求体和响应体大小限制（防止资源耗尽）

## 二次开发改进

- 📱 优化响应式设计，提升移动端体验

## 开源许可

MIT License