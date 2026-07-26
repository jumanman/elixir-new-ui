# Elixir APK 改包工具

> 本项目是基于原始项目的二次开发版本

一个基于 Cloudflare 的 APK 改包工具前端应用，提供优化。

## 原始项目

- **原始地址**: [open.lihouse.xyz/elixir](https://open.lihouse.xyz/elixir) 【本项目基于 calyxor 的 Elixir 进行二次开发，最终服务全部由该项目提供，并非由本项目提供（感谢 calyxor 大佬 /比心 /比心 ）】
- **二次开发**: 添加 Cloudflare Worker 代理层，解决跨域访问问题。

## 功能特性

- 🎛️ **设置面板** - 管理隐藏包名列表，过滤不需要的记录，同时对相同包名合并同类项

## 技术栈

- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **代理**: Cloudflare Workers (代理层)
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
- ✅ Origin 白名单验证
- ✅ 请求路径白名单
- ✅ 速率限制（每分钟60次）
- ✅ 文件上传类型和大小限制
- ✅ XSS 防护（HTML转义）

## 二次开发改进

- 📱 优化响应式设计，提升移动端体验

## 开源许可

MIT License