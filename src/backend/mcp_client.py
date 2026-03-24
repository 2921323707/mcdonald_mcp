"""
麦当劳 MCP Client — Streamable HTTP 协议实现
通过 JSON-RPC 2.0 over HTTP 与麦当劳 MCP Server 通信
"""

import uuid
import requests


MCP_SERVER_URL = "https://mcp.mcd.cn/mcp-servers/mcd-mcp"

# 从环境变量读取代理配置
import os as _os
_proxy = _os.environ.get("PROXY_URL", "")
PROXY_URL = _proxy if _proxy else None


class McdonaldsMCPClient:
    """封装与麦当劳 MCP Server 的所有交互"""

    def __init__(self, token: str):
        self.token = token
        self.server_url = MCP_SERVER_URL
        self.session_id = None
        self.server_info = None
        self.tools_cache = None
        self._http = requests.Session()
        self._http.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {self.token}",
        })

    # ------------------------------------------------------------------
    # JSON-RPC helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _rpc_request(method: str, params: dict | None = None, req_id: str | None = None):
        """构建 JSON-RPC 2.0 请求体"""
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "id": req_id or str(uuid.uuid4()),
        }
        if params is not None:
            payload["params"] = params
        return payload

    def _send(self, payload: dict) -> dict:
        """
        发送请求到 MCP Server。
        支持 Streamable HTTP：如果返回了 Mcp-Session-Id 则缓存。
        """
        headers = {}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id

        proxies = {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None
        resp = self._http.post(self.server_url, json=payload, headers=headers, timeout=30, proxies=proxies)
        resp.raise_for_status()

        # 缓存 session id
        sid = resp.headers.get("Mcp-Session-Id")
        if sid:
            self.session_id = sid

        # 处理 SSE 流式响应
        content_type = resp.headers.get("Content-Type", "")
        if "text/event-stream" in content_type:
            return self._parse_sse(resp.text)

        return resp.json()

    @staticmethod
    def _parse_sse(text: str) -> dict:
        """从 SSE 流中提取最后一个 JSON-RPC 响应"""
        import json
        last_data = None
        for line in text.splitlines():
            if line.startswith("data:"):
                data_str = line[5:].strip()
                if data_str:
                    try:
                        last_data = json.loads(data_str)
                    except json.JSONDecodeError:
                        pass
        return last_data or {}

    # ------------------------------------------------------------------
    # MCP 协议方法
    # ------------------------------------------------------------------

    def initialize(self) -> dict:
        """初始化 MCP 会话"""
        payload = self._rpc_request("initialize", {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {
                "name": "McDonalds-MCP-Local-Platform",
                "version": "1.0.0"
            }
        })
        result = self._send(payload)
        self.server_info = result.get("result", {})

        # 发送 initialized 通知
        notif = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
        }
        try:
            self._http.post(
                self.server_url,
                json=notif,
                headers={"Mcp-Session-Id": self.session_id} if self.session_id else {},
                timeout=10,
                proxies={"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None,
            )
        except Exception:
            pass  # 通知失败不影响主流程

        return self.server_info

    def list_tools(self, force_refresh: bool = False) -> list:
        """获取可用工具列表"""
        if self.tools_cache and not force_refresh:
            return self.tools_cache

        payload = self._rpc_request("tools/list")
        result = self._send(payload)
        tools = result.get("result", {}).get("tools", [])
        self.tools_cache = tools
        return tools

    def call_tool(self, tool_name: str, arguments: dict | None = None) -> dict:
        """调用指定工具"""
        payload = self._rpc_request("tools/call", {
            "name": tool_name,
            "arguments": arguments or {}
        })
        result = self._send(payload)
        return result.get("result", result)

    def ping(self) -> bool:
        """检测连接状态"""
        try:
            payload = self._rpc_request("ping")
            result = self._send(payload)
            return "result" in result or "error" not in result
        except Exception:
            return False

    def get_status(self) -> dict:
        """返回完整连接状态信息"""
        connected = self.ping()
        return {
            "connected": connected,
            "server_url": self.server_url,
            "session_id": self.session_id,
            "server_info": self.server_info,
        }
