# 麦当劳 MCP 本地调度平台

通过 Model Context Protocol（MCP）连接麦当劳后端服务的本地调度平台，提供 Web 界面与 API 接口，支持 AI 助手自动化调用麦当劳各项功能。

## 主要功能

- MCP 协议对接 — Streamable HTTP + JSON-RPC 2.0 通信
- Web 管理界面 — 实时查看连接状态、工具列表，支持直接调用
- 完整点餐流程 — 地址查询 → 餐品浏览 → 优惠券 → 价格计算 → 创建订单
- 积分商城与优惠券管理

## 快速开始

```bash
cd Scripts
python app.py
```

访问 `http://localhost:5000`

## 文档

- [简体中文](docs/README_CN.md)
- [English](docs/README_en.md)
- [日本語](docs/README_JP.md)
- [流程文档](docs/流程文档.md)
