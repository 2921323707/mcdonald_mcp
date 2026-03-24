# マクドナルド MCP ローカルディスパッチプラットフォーム

Model Context Protocol（MCP）経由でマクドナルドバックエンドサービスに接続するローカルディスパッチプラットフォームです。WebインターフェースとAPIを提供し、OpenClawなどのAIアシスタントがマクドナルドの各种機能を自動化できます。

---

## 主な機能

- **MCPプロトコル対応** — Streamable HTTP + JSON-RPC 2.0でマクドナルドMCP Serverと通信
- **Web管理画面** — MCP接続状態とツールリストをリアルタイム表示、ツール直接呼び出しが可能
- **配達先管理** — `beCode` / `storeCode`を自動キャッシュ、注文時に自動挿入
- **完整注文フロー** — 住所查询 → メニュー参照 → クーポン適用 → 価格計算 → 注文作成 → 注文追跡
- **ポイントモール** — ポイント残高查询、利用可能景品、ポイント注文
- **クーポン管理** — 利用可能なクーポンの確認、一括自動受取、クーポンウォレット表示
- **OpenClaw互換** — `/mcp/tools`と`/mcp/tools/call`エンドポイントを提供、AIプラットフォームから直接利用可
- **プロキシ対応** — `.env`から`PROXY_URL`を読み込み、ローカルプロキシ経由でのアクセスをサポート

---

## プロジェクト構成

```
麦当劳MCP管理/
├── .env                    # 環境変数（APIキー、プロキシ）
├── requirements.txt        # Python依存ライブラリ
├── docs/
│   ├── README_CN.md        # 中国語版
│   ├── README_en.md        # 英語版
│   ├── README_JP.md        # このファイル（日本語）
│   └── 流程文档.md          # 詳細なアーキテクチャ・フロードキュメント
├── src/
│   ├── backend/
│   │   ├── app.py          # Flaskメインアプリケーション（APIルート）
│   │   └── mcp_client.py    # MCPクライアント（Streamable HTTP + JSON-RPC）
│   └── frontend/
│       ├── index.html       # Web UI
│       ├── style.css        # スタイルシート
│       └── app.js           # フロントエンドロジック
└── static/
    ├── structure.png        # アーキテクチャ図
    └── burgerfood.png       # ブランドアセット
```

---

## クイックスタート

### 1. 依存ライブラリのインストール

```bash
pip install -r requirements.txt
```

### 2. 環境変数の設定

プロジェクトルートの `.env` ファイルを作成または編集します：

```env
MaiDoLoad_Key = your_mcd_api_key_here
PROXY_URL = http://127.0.0.1:7890   # 任意、MCP Serverアクセス用プロキシ
```

### 3. サーバーの起動

```bash
cd 麦当劳MCP管理
python src/backend/app.py
```

起動後、**http://127.0.0.1:5000** にアクセスしてください。

---

## APIエンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/` | Web管理インターフェース |
| `GET` | `/api/status` | MCP接続状態 |
| `GET` | `/api/tools` | MCPツール一覧取得 |
| `GET` | `/api/tools/meta` | ツールメタ情報（パラメータ説明含む） |
| `POST` | `/api/tools/call` | 指定ツールの呼び出し |
| `GET` | `/api/addresses` | 配達先リスト取得 |
| `POST` | `/api/addresses/select` | 配達先を選択 |
| `POST` | `/api/addresses/refresh` | 配達先を最新化 |
| `POST` | `/api/chat` | AIチャット（キーワードでツール自動呼び出し） |
| `GET` | `/mcp/tools` | OpenClaw互換：ツール一覧 |
| `POST` | `/mcp/tools/call` | OpenClaw互換：ツール呼び出し |

### 使用例

```bash
# 配達先を查询
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "delivery-query-addresses", "arguments": {}}'

# 门店の餐品一覧を查询（beCode/storeCodeは自動挿入）
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "query-meals", "arguments": {}}'

# 価格を計算
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "calculate-price", "arguments": {
    "items": [{"productCode": "10001", "quantity": 1}]
  }}'

# 注文を作成
curl http://127.0.0.1:5000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "create-order", "arguments": {
    "items": [{"productCode": "10001", "quantity": 1}]
  }}'
```

---

## MCPツールリファレンス

| ツール名 | 説明 |
|---------|------|
| `delivery-query-addresses` | 配達先を查询 |
| `delivery-create-address` | 新規配達先を追加 |
| `query-meals` | 门店餐品一覧を查询 |
| `query-meal-detail` | 餐品の詳細を查询 |
| `query-store-coupons` | 门店利用可能なクーポンを查询 |
| `calculate-price` | 注文価格を計算 |
| `create-order` | マクデリバリー注文を作成 |
| `query-order` | 注文配送状況を查询 |
| `available-coupons` | 受取可能的クーポンを查询 |
| `auto-bind-coupons` | 一括自動受取 |
| `query-my-coupons` | マイクーポンを查询 |
| `query-my-account` | ポイント口座残高を查询 |
| `mall-points-products` | ポイントモール兑换可能商品を查询 |
| `mall-product-detail` | ポイント商品詳細を查询 |
| `mall-create-order` | ポイント注文を作成 |
| `campaign-calendar` | マーケティングキャンペーンカレンダーを查询 |
| `list-nutrition-foods` | 餐品營養情報を查询 |
| `now-time-info` | 現在時刻情報を取得 |

---

## 主要パラメータ説明

- **`beCode`** / **`storeCode`** — 门店コード、`delivery-query-addresses`の返回值から取得必须
- **`addressId`** — 配達先ID、住所查询接口の返回值から取得
- **`productCode`** — 商品コード、`query-meals`の返回値から取得
- **注文作成前は必ず`calculate-price`で価格計算を行ってください**
- 注文番号は34桁の純数字文字列
- MCPリクエスト頻度制限：**1分あたり最大600回**

詳細なフローは [流程文档.md](./流程文档.md) を参照してください。

---

## 動作環境

- Python 3.11+
- `https://mcp.mcd.cn` へのネットワーク接続（またはプロキシ経由）
