"""
麦当劳 MCP 本地调度平台 — Flask 主应用
提供 API 接口对接麦当劳 MCP Server 和 OpenClaw AI
"""

import os
import sys

# 把项目根目录加入 Python 路径，这样无论直接运行还是模块运行都能 import
_project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

import json
import traceback

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from src.backend.mcp_client import McdonaldsMCPClient

# ---------------------------------------------------------------------------
# 初始化
# ---------------------------------------------------------------------------

app = Flask(
    __name__,
    static_folder=os.path.join(os.path.dirname(__file__), "..", "fronted"),
    static_url_path="",
)
CORS(app)

MCP_TOKEN = os.getenv("MaiDoLoad_Key", "")
mcp_client = McdonaldsMCPClient(token=MCP_TOKEN)

# 启动时自动初始化 MCP 会话
_init_error = None
try:
    mcp_client.initialize()
except Exception as e:
    _init_error = str(e)
    print(f"[WARN] MCP 初始化延迟: {e}")

# ---------------------------------------------------------------------------
# 配送地址缓存（beCode / storeCode 自动注入）
# ---------------------------------------------------------------------------

_address_cache = {
    "addresses": [],          # 原始地址列表
    "selected": None,         # 当前选中的地址 dict
    "beCode": None,           # 当前 beCode（供工具自动注入）
    "storeCode": None,        # 当前 storeCode（供工具自动注入）
    "addressId": None,        # 当前 addressId（下单用）
    "loaded": False,          # 是否已尝试加载
    "error": None,            # 加载失败原因
}


def _reload_addresses():
    """重新加载配送地址列表并缓存 beCode / storeCode"""
    global _address_cache
    if not mcp_client.session_id:
        try:
            mcp_client.initialize()
        except Exception as e:
            _address_cache["error"] = str(e)
            _address_cache["loaded"] = True
            return

    try:
        result = mcp_client.call_tool("delivery-query-addresses")
        # 解析 MCP 返回结构：result.content[0].structuredContent.data.addresses
        addresses = result.get("structuredContent", {}).get("data", {}).get("addresses", [])
        # 按 addressId 去重
        seen = set()
        unique_addresses = []
        for addr in addresses:
            aid = addr.get("addressId")
            if aid and aid not in seen:
                seen.add(aid)
                unique_addresses.append(addr)
        addresses = unique_addresses

        _address_cache["addresses"] = addresses
        _address_cache["loaded"] = True
        _address_cache["error"] = None

        # 默认选中第一个地址
        if addresses and not _address_cache["selected"]:
            _select_address(addresses[0])
    except Exception as e:
        _address_cache["error"] = str(e)
        _address_cache["loaded"] = True
        print(f"[WARN] 加载配送地址失败: {e}")


def _select_address(addr: dict):
    """选中一个地址并缓存 beCode / storeCode"""
    _address_cache["selected"] = addr
    _address_cache["beCode"] = addr.get("beCode")
    _address_cache["storeCode"] = addr.get("storeCode")
    _address_cache["addressId"] = addr.get("addressId")


# 后台预加载地址（不影响 Flask 启动）
import threading
threading.Thread(target=_reload_addresses, daemon=True).start()


# ---------------------------------------------------------------------------
# API: 配送地址
# ---------------------------------------------------------------------------

@app.route("/api/addresses")
def api_addresses():
    """返回已缓存的配送地址列表"""
    return jsonify({
        "addresses": _address_cache["addresses"],
        "selected": _address_cache["selected"],
        "beCode": _address_cache["beCode"],
        "storeCode": _address_cache["storeCode"],
        "addressId": _address_cache["addressId"],
        "loaded": _address_cache["loaded"],
        "error": _address_cache["error"],
    })


@app.route("/api/addresses/select", methods=["POST"])
def api_address_select():
    """选中一个配送地址（按 addressId）"""
    data = request.get_json(force=True)
    address_id = data.get("addressId")

    for addr in _address_cache["addresses"]:
        if addr.get("addressId") == address_id:
            _select_address(addr)
            return jsonify({"ok": True, "selected": addr})

    return jsonify({"ok": False, "error": f"未找到 addressId: {address_id}"}), 404


@app.route("/api/addresses/refresh", methods=["POST"])
def api_addresses_refresh():
    """强制刷新配送地址"""
    threading.Thread(target=_reload_addresses, daemon=True).start()
    return jsonify({"ok": True, "message": "正在刷新..."})

# 项目根目录的 static 文件夹（供自定义静态资源使用）
_root_static = os.path.join(os.path.dirname(__file__), "..", "..", "static")


@app.route("/static/<path:filename>")
def serve_root_static(filename):
    """服务项目根目录 static/ 下的文件（如 favicon.ico）"""
    return send_from_directory(_root_static, filename)


@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")


# ---------------------------------------------------------------------------
# API: MCP 状态
# ---------------------------------------------------------------------------

@app.route("/api/status")
def api_status():
    """返回 MCP 连接状态"""
    try:
        status = mcp_client.get_status()
        status["token_configured"] = bool(MCP_TOKEN)
        status["init_error"] = _init_error
        return jsonify(status)
    except Exception as e:
        return jsonify({"connected": False, "error": str(e)}), 500


# ---------------------------------------------------------------------------
# API: 工具列表
# ---------------------------------------------------------------------------

# 已知的直接调用工具（无需参数）
DIRECT_CALL_TOOLS = {
    "available-coupons",
    "delivery-query-addresses",
    "now-time-info",
    "list-nutrition-foods",
    "mall-points-products",
    "auto-bind-coupons",
    "query-my-account",
}

# 参数字段的中文描述映射
PARAM_LABELS = {
    "spuId": "商品SPU ID",
    "skuId": "商品SKU ID",
    "count": "兑换数量",
    "orderId": "订单号 (34位)",
    "beCode": "BE编码",
    "storeCode": "门店编码",
    "code": "餐品编码",
    "specifiedDate": "查询日期 (yyyy-MM-dd)",
    "page": "页码",
    "pageSize": "每页条数",
    "addressId": "配送地址ID",
    "address": "配送地址",
    "addressDetail": "门牌号",
    "city": "城市",
    "contactName": "联系人姓名",
    "gender": "性别",
    "phone": "手机号",
    "productCode": "商品编码",
    "quantity": "数量",
    "couponId": "优惠券ID",
    "couponCode": "优惠券编码",
}


@app.route("/api/tools")
def api_tools():
    """获取麦当劳 MCP 可用工具列表"""
    try:
        if not mcp_client.session_id:
            mcp_client.initialize()

        tools = mcp_client.list_tools(force_refresh=request.args.get("refresh") == "1")
        return jsonify({"tools": tools, "count": len(tools)})
    except Exception as e:
        return jsonify({"error": str(e), "tools": []}), 500


@app.route("/api/tools/meta")
def api_tools_meta():
    """返回工具元信息，标注哪些工具可直接调用，哪些需要参数"""
    try:
        if not mcp_client.session_id:
            mcp_client.initialize()

        tools = mcp_client.list_tools(force_refresh=request.args.get("refresh") == "1")
        enriched = []
        for tool in tools:
            name = tool.get("name", "")
            schema = tool.get("inputSchema", {})
            properties = schema.get("properties", {})
            required = schema.get("required", [])

            # 判断是否可以直接调用
            has_required = len(required) > 0
            is_direct = name in DIRECT_CALL_TOOLS or (not has_required and not properties)

            # 构建参数元信息
            params_meta = []
            for key, prop in properties.items():
                params_meta.append({
                    "name": key,
                    "label": PARAM_LABELS.get(key, key),
                    "type": prop.get("type", "string"),
                    "description": prop.get("description", ""),
                    "required": key in required,
                })

            enriched.append({
                "name": name,
                "description": tool.get("description", ""),
                "callType": "direct" if is_direct else "parameterized",
                "params": params_meta,
                "requiredParams": required,
                "inputSchema": schema,
            })

        return jsonify({"tools": enriched, "count": len(enriched)})
    except Exception as e:
        return jsonify({"error": str(e), "tools": []}), 500


# ---------------------------------------------------------------------------
# API: 调用工具
# ---------------------------------------------------------------------------

# 需要 beCode / storeCode 的工具列表（自动注入缓存值）
_AUTO_INJECT_TOOLS = {
    "query-meals",
    "query-store-coupons",
    "query-meal-detail",
    "calculate-price",
    "create-order",
}

# 需要 addressId 的工具列表
_AUTO_INJECT_ADDRESSID_TOOLS = {
    "create-order",
}


@app.route("/api/tools/call", methods=["POST"])
def api_call_tool():
    """调用指定的 MCP 工具"""
    data = request.get_json(force=True)
    tool_name = data.get("name")
    arguments = data.get("arguments", {})

    if not tool_name:
        return jsonify({"error": "缺少 tool name"}), 400

    try:
        if not mcp_client.session_id:
            mcp_client.initialize()

        # 自动注入缓存的 beCode / storeCode（前端没传时才注入）
        if tool_name in _AUTO_INJECT_TOOLS:
            if "beCode" not in arguments or not arguments["beCode"]:
                arguments["beCode"] = _address_cache["beCode"]
            if "storeCode" not in arguments or not arguments["storeCode"]:
                arguments["storeCode"] = _address_cache["storeCode"]

        # 自动注入 addressId
        if tool_name in _AUTO_INJECT_ADDRESSID_TOOLS:
            if "addressId" not in arguments or not arguments["addressId"]:
                arguments["addressId"] = _address_cache["addressId"]

        result = mcp_client.call_tool(tool_name, arguments)
        return jsonify({"result": result, "tool": tool_name, "injected": {
            "beCode": arguments.get("beCode"),
            "storeCode": arguments.get("storeCode"),
            "addressId": arguments.get("addressId"),
        }})
    except Exception as e:
        return jsonify({"error": str(e), "tool": tool_name}), 500


# ---------------------------------------------------------------------------
# API: OpenClaw 对话 (Chat)
# ---------------------------------------------------------------------------

@app.route("/api/chat", methods=["POST"])
def api_chat():
    """
    接收用户消息，解析意图，自动调用合适的 MCP 工具。
    简易版本：基于关键词匹配 → MCP 工具调用 → 返回结果。
    也对外暴露 MCP 工具信息，供 OpenClaw 等外部 AI 平台消费。
    """
    data = request.get_json(force=True)
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"error": "消息不能为空"}), 400

    try:
        # 确保已初始化
        if not mcp_client.session_id:
            mcp_client.initialize()

        # 获取工具列表
        tools = mcp_client.list_tools()

        # 智能匹配：尝试找出最相关的工具
        matched_tool = _match_tool(user_message, tools)

        if matched_tool:
            tool_name = matched_tool["name"]
            # 尝试从消息中提取参数
            arguments = _extract_arguments(user_message, matched_tool)
            result = mcp_client.call_tool(tool_name, arguments)
            return jsonify({
                "reply": f"已为您调用工具「{tool_name}」",
                "tool_used": tool_name,
                "arguments": arguments,
                "result": result,
                "type": "tool_call",
            })
        else:
            # 未匹配到工具，返回可用工具信息
            tool_names = [t.get("name", "") for t in tools]
            return jsonify({
                "reply": f"暂时无法理解您的请求。当前可用工具：{', '.join(tool_names)}。请尝试询问关于活动、优惠券等相关问题。",
                "type": "info",
                "available_tools": tools,
            })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "reply": f"处理出错: {str(e)}", "type": "error"}), 500


# ---------------------------------------------------------------------------
# API: OpenClaw MCP 兼容端点
# ---------------------------------------------------------------------------

@app.route("/mcp/tools", methods=["GET"])
def openclaw_list_tools():
    """OpenClaw 兼容：列出所有 MCP 工具（MCP Tool Provider 格式）"""
    try:
        if not mcp_client.session_id:
            mcp_client.initialize()
        tools = mcp_client.list_tools()
        return jsonify({"tools": tools})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/mcp/tools/call", methods=["POST"])
def openclaw_call_tool():
    """OpenClaw 兼容：调用 MCP 工具"""
    data = request.get_json(force=True)
    tool_name = data.get("name")
    arguments = data.get("arguments", {})

    if not tool_name:
        return jsonify({"error": "Missing tool name"}), 400

    try:
        if not mcp_client.session_id:
            mcp_client.initialize()
        result = mcp_client.call_tool(tool_name, arguments)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------

# 关键词 → 工具名精确映射（优先级匹配）
KEYWORD_TOOL_MAP = [
    (["领券", "一键领", "自动领"], "auto-bind-coupons"),
    (["可领", "有什么券", "什么优惠"], "available-coupons"),
    (["我的券", "卡包", "我有什么券"], "query-my-coupons"),
    (["门店可用券", "门店优惠"], "query-store-coupons"),
    (["积分余额", "多少积分", "我的积分"], "query-my-account"),
    (["积分兑换", "积分商城", "可兑换"], "mall-points-products"),
    (["兑换详情", "商品详情"], "mall-product-detail"),
    (["兑换", "下单兑换"], "mall-create-order"),
    (["活动", "日历", "营销"], "campaign-calendar"),
    (["营养", "热量", "卡路里"], "list-nutrition-foods"),
    (["时间", "几点", "日期"], "now-time-info"),
    (["配送地址", "地址列表", "麦乐送"], "delivery-query-addresses"),
    (["添加地址", "新地址", "创建地址"], "delivery-create-address"),
    (["餐品列表", "菜单", "点餐", "查看餐品"], "query-meals"),
    (["餐品详情"], "query-meal-detail"),
    (["计价", "多少钱", "总价", "价格"], "calculate-price"),
    (["下单", "创建订单", "帮我点"], "create-order"),
    (["订单状态", "订单详情", "查订单", "支付完成"], "query-order"),
]


def _match_tool(message: str, tools: list) -> dict | None:
    """基于关键词匹配最相关的工具"""
    tools_by_name = {t.get("name", ""): t for t in tools}

    for keywords, tool_name in KEYWORD_TOOL_MAP:
        for kw in keywords:
            if kw in message:
                if tool_name in tools_by_name:
                    return tools_by_name[tool_name]

    # 回退：直接名称匹配
    message_lower = message.lower()
    for tool in tools:
        if tool.get("name", "").lower() in message_lower:
            return tool

    return None


def _extract_arguments(message: str, tool: dict) -> dict:
    """尝试从消息中提取工具需要的参数（简单实现）"""
    schema = tool.get("inputSchema", {})
    properties = schema.get("properties", {})
    arguments = {}

    # 对于没有必需参数的工具，直接返回空
    required = schema.get("required", [])
    if not required:
        return arguments

    return arguments


# ---------------------------------------------------------------------------
# 启动
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
