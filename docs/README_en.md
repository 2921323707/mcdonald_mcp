# McDonald's MCP Local Dispatch Platform

A local dispatch platform that connects to McDonald's backend services via the Model Context Protocol (MCP), providing a web interface and API for AI assistants (e.g. OpenClaw) to automate McDonald's functionalities.

---

## Features

- **MCP Protocol Integration** — Communicates with McDonald's MCP Server using Streamable HTTP + JSON-RPC 2.0
- **Web Management UI** — Real-time MCP connection status, tool list, and direct tool invocation
- **Delivery Address Management** — Auto-caches `beCode` / `storeCode` and injects them during ordering
- **Full Ordering Flow** — Address query → Browse menu → Apply coupons → Calculate price → Create order → Track order
- **Points Mall** — Query points balance, available rewards, points-based ordering
- **Coupon Management** — Check available coupons, one-click auto-bind, view coupon wallet
- **OpenClaw Compatible** — Provides `/mcp/tools` and `/mcp/tools/call` endpoints consumable by AI platforms
- **Proxy Support** — Reads `PROXY_URL` from `.env` for local proxy access

---

## Project Structure

```
麦当劳MCP管理/
├── .env                    # Environment variables (API key, proxy)
├── requirements.txt        # Python dependencies
├── docs/
│   ├── README_CN.md        # Chinese version
│   ├── README_en.md        # This file
│   ├── README_JP.md        # 日本語版
│   └── 流程文档.md          # Detailed architecture & flow documentation
├── src/
│   ├── backend/
│   │   ├── app.py          # Flask main app (API routes)
│   │   └── mcp_client.py   # MCP Client (Streamable HTTP + JSON-RPC)
│   └── frontend/
│       ├── index.html      # Web UI
│       ├── style.css       # Styles
│       └── app.js          # Frontend logic
└── static/
    ├── structure.png       # Architecture diagram
    └── burgerfood.png      # Brand assets
```

---

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create or edit the `.env` file in the project root:

```env
MaiDoLoad_Key = your_mcd_api_key_here
PROXY_URL = http://127.0.0.1:7890   # Optional, local proxy for MCP access
```

### 3. Start the Server

```bash
cd 麦当劳MCP管理
python src/backend/app.py
```

Access **http://127.0.0.1:5000** after startup.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Web management interface |
| `GET` | `/api/status` | MCP connection status |
| `GET` | `/api/tools` | List MCP tools |
| `GET` | `/api/tools/meta` | Tool metadata with parameter descriptions |
| `POST` | `/api/tools/call` | Call a specific tool |
| `GET` | `/api/addresses` | Get delivery address list |
| `POST` | `/api/addresses/select` | Select a delivery address |
| `POST` | `/api/addresses/refresh` | Refresh delivery addresses |
| `POST` | `/api/chat` | AI chat (keyword-matched tool invocation) |
| `GET` | `/mcp/tools` | OpenClaw compatible: list tools |
| `POST` | `/mcp/tools/call` | OpenClaw compatible: call tool |

### Usage Examples

```bash
# Query delivery addresses
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "delivery-query-addresses", "arguments": {}}'

# Query store meals (beCode/storeCode auto-injected)
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "query-meals", "arguments": {}}'

# Calculate price
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "calculate-price", "arguments": {
    "items": [{"productCode": "10001", "quantity": 1}]
  }}'

# Create order
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "create-order", "arguments": {
    "items": [{"productCode": "10001", "quantity": 1}]
  }}'
```

---

## MCP Tools Reference

| Tool Name | Description |
|-----------|-------------|
| `delivery-query-addresses` | Query delivery addresses |
| `delivery-create-address` | Add new delivery address |
| `query-meals` | Query store meal list |
| `query-meal-detail` | Query meal details |
| `query-store-coupons` | Query store-available coupons |
| `calculate-price` | Calculate order price |
| `create-order` | Create McDelivery order |
| `query-order` | Query order delivery status |
| `available-coupons` | Query available coupons to claim |
| `auto-bind-coupons` | One-click auto-bind coupons |
| `query-my-coupons` | Query my coupon wallet |
| `query-my-account` | Query points account balance |
| `mall-points-products` | Query points mall redeemable products |
| `mall-product-detail` | Query points product details |
| `mall-create-order` | Points-based order creation |
| `campaign-calendar` | Query marketing campaign calendar |
| `list-nutrition-foods` | Query meal nutrition info |
| `now-time-info` | Get current time info |

---

## Key Parameters

- **`beCode`** / **`storeCode`** — Store codes, must be obtained from `delivery-query-addresses`
- **`addressId`** — Delivery address ID, also from address query
- **`productCode`** — Product code, from `query-meals` result
- **Must call `calculate-price` before creating an order**
- Order IDs are 34-digit numeric strings
- MCP rate limit: **max 600 requests per minute**

See [流程文档.md](./流程文档.md) for detailed flows.

---

## Requirements

- Python 3.11+
- Network access to `https://mcp.mcd.cn` (or via proxy)
