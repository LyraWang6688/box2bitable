# box2bitable 项目规范

## 项目概述
`box2bitable` 是基于豆包大模型和飞书多维表格的智能鞋盒标签识别与盘点工具（微信小程序版）。通过 AI 技术简化仓库盘点与业务数据录入流程。

## 技术栈
- **前端**：微信小程序原生开发 (WXML, WXSS, JS)
- **后端**：Node.js + Express (>=20)
- **数据库/存储**：Supabase (PostgreSQL + Storage)
- **AI 模型**：豆包 (Doubao) 大模型 API
- **表格服务**：飞书多维表格 (Feishu Bitable) API

## 目录结构
```
.
├── docs/               # 项目文档 (PRD, 技术方案, 接口说明)
├── server/             # 后端 Express 代码
│   ├── src/
│   │   ├── controllers/ # 控制器
│   │   ├── routes/      # 路由
│   │   ├── services/    # 业务逻辑 (AI, 飞书, Supabase)
│   │   └── utils/       # 工具类
│   ├── scripts/         # 部署脚本
│   └── package.json
├── miniprogram/        # 微信小程序前端代码
│   ├── pages/          # 页面
│   ├── utils/          # 工具函数
│   └── app.json
├── supabase/           # 数据库迁移文件
│   └── migrations/
├── .env.example        # 环境变量模板
└── README.md
```

## 关键入口 / 核心模块

### 后端服务 (server/)
- **入口文件**：`src/app.js`
- **运行命令**：`npm start` (生产) / `npm run dev` (开发)
- **主要 API**：
  - `/api/recognition` - 图片识别
  - `/api/sync` - 数据同步到飞书
  - `/api/query` - 库存查询
- **部署脚本**：`server/scripts/deploy_build.sh` / `server/scripts/deploy_run.sh`

### 微信小程序 (miniprogram/)
- **入口配置**：`app.json`
- **主页面**：
  - `pages/home/home` - 首页
  - `pages/entry/entry` - 数据录入
  - `pages/review/review` - 复核
  - `pages/query/query` - 查询

## 运行与预览

### 后端启动
```bash
cd server
pnpm install
pnpm run dev
```

### 环境变量
参考 `.env.example`，需要配置：
- `SUPABASE_*` - 数据库配置
- `ARK_*` - 豆包大模型配置
- `FEISHU_*` - 飞书多维表格配置
- `WX_*` - 微信小程序配置

### 小程序开发
使用微信开发者工具打开 `miniprogram/` 目录，并勾选"不校验合法域名、web-view（业务域名）、TLS版本以及HTTPS证书"。

## 用户偏好与长期约束
- Node.js 版本要求 >=20
- 使用 pnpm 作为包管理器
- 后端服务默认端口 3000（部署时使用 5000）
- 不校验合法域名仅限本地开发调试

## 常见问题和预防
- 飞书图片写入排查：设置 `FEISHU_DEBUG=true` 输出调试日志
- 确保 `.env` 文件正确配置再启动服务
