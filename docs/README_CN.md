# 麦当劳 MCP 本地调度平台

通过 Model Context Protocol（MCP）连接麦当劳后端服务的本地调度平台，提供 Web 界面与 API 接口，支持 AI 助手（如 OpenClaw）自动化调用麦当劳各项功能。

---

## 功能特性

- **MCP 协议对接** — 使用 Streamable HTTP + JSON-RPC 2.0 与麦当劳 MCP Server 通信
- **Web 管理界面** — 实时查看 MCP 连接状态、工具列表，支持直接调用任意工具
- **配送地址管理** — 自动缓存 `beCode` / `storeCode`，下单时自动注入
- **完整点餐流程** — 地址查询 → 餐品浏览 → 优惠券叠加 → 价格计算 → 创建订单 → 订单查询
- **积分商城** — 查询积分余额、可兑换商品、积分下单
- **优惠券管理** — 查询可领券、一键自动领券、查看卡包
- **OpenClaw 兼容** — 提供 `/mcp/tools` 和 `/mcp/tools/call` 端点，可被 OpenClaw 等 AI 平台直接消费
- **代理支持** — 自动读取 `.env` 中的 `PROXY_URL`，支持本地代理

---

## 项目结构

```
麦当劳MCP管理/
├── .env                    # 环境变量配置（API Key、代理）
├── requirements.txt        # Python 依赖
├── docs/
│   ├── README_CN.md        # 本文件（中文）
│   ├── README_en.md        # English version
│   ├── README_JP.md        # 日本語版
│   └── 流程文档.md          # 详细架构与流程文档
├── src/
│   ├── backend/
│   │   ├── app.py          # Flask 主应用（API 路由）
│   │   └── mcp_client.py   # MCP Client（Streamable HTTP + JSON-RPC）
│   └── frontend/
│       ├── index.html      # Web 界面
│       ├── style.css       # 样式
│       └── app.js          # 前端交互逻辑
└── static/
    ├── structure.png       # 架构图
    └── burgerfood.png      # 品牌资源
```

---

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

创建或编辑项目根目录的 `.env` 文件：

```env
MaiDoLoad_Key = your_mcd_api_key_here
PROXY_URL = http://127.0.0.1:7890   # 可选，本地代理地址
```

> `MaiDoLoad_Key` 为麦当劳 API 认证令牌，`PROXY_URL` 如需代理访问 MCP Server 则配置。

### 3. 启动服务

```bash
cd 麦当劳MCP管理
python src/backend/app.py
```

服务启动后访问 **http://127.0.0.1:5000**

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/` | Web 管理界面 |
| `GET` | `/api/status` | MCP 连接状态 |
| `GET` | `/api/tools` | 获取 MCP 工具列表 |
| `GET` | `/api/tools/meta` | 获取工具元信息（含参数说明） |
| `POST` | `/api/tools/call` | 调用指定工具 |
| `GET` | `/api/addresses` | 获取配送地址列表 |
| `POST` | `/api/addresses/select` | 选择配送地址 |
| `POST` | `/api/addresses/refresh` | 刷新配送地址 |
| `POST` | `/api/chat` | AI 对话（关键词匹配工具） |
| `GET` | `/mcp/tools` | OpenClaw 兼容：列出工具 |
| `POST` | `/mcp/tools/call` | OpenClaw 兼容：调用工具 |

### 调用示例

```bash
# 查询配送地址
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "delivery-query-addresses", "arguments": {}}'

# 查询门店餐品（beCode/storeCode 由系统自动注入）
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "query-meals", "arguments": {}}'

# 计算价格
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "calculate-price", "arguments": {
    "items": [{"productCode": "10001", "quantity": 1}]
  }}'

# 创建订单
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "create-order", "arguments": {
    "items": [{"productCode": "10001", "quantity": 1}]
  }}'
```

---

## MCP 工具一览

| 工具名 | 说明 |
|--------|------|
| `delivery-query-addresses` | 查询配送地址 |
| `delivery-create-address` | 添加新配送地址 |
| `query-meals` | 查询门店餐品列表 |
| `query-meal-detail` | 查询餐品详情 |
| `query-store-coupons` | 查询门店可用优惠券 |
| `calculate-price` | 计算订单价格 |
| `create-order` | 创建麦乐送订单 |
| `query-order` | 查询订单配送状态 |
| `available-coupons` | 查询可领取优惠券 |
| `auto-bind-coupons` | 一键自动领取优惠券 |
| `query-my-coupons` | 查询我的卡包 |
| `query-my-account` | 查询积分账户余额 |
| `mall-points-products` | 查询积分商城可兑换商品 |
| `mall-product-detail` | 查询积分商品详情 |
| `mall-create-order` | 积分兑换下单 |
| `campaign-calendar` | 查询营销活动日历 |
| `list-nutrition-foods` | 查询餐品营养信息 |
| `now-time-info` | 获取当前时间信息 |

---

## 核心参数说明

- **`beCode`** / **`storeCode`** — 门店编码，必须从 `delivery-query-addresses` 返回结果中获取
- **`addressId`** — 配送地址 ID，同样来自地址查询接口
- **`productCode`** — 商品编码，从 `query-meals` 返回的餐品列表中获取
- **下单前必须先调用 `calculate-price` 计算价格**
- 订单号为 34 位纯数字字符串
- MCP 请求频率限制：**每分钟最多 600 次**

详细流程请参考 [流程文档.md](./流程文档.md)。

---

## 环境要求

- Python 3.11+
- 网络能访问 `https://mcp.mcd.cn`（或通过代理）
