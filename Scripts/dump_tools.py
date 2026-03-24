"""获取并保存MCP工具列表到文件"""
import sys, os
sys.path.insert(0, r'c:\Users\29213\Desktop\麦当劳MCP管理')
from dotenv import load_dotenv
load_dotenv(r'c:\Users\29213\Desktop\麦当劳MCP管理\.env')

from src.backend.mcp_client import McdonaldsMCPClient
import json

token = os.getenv("MaiDoLoad_Key", "")
client = McdonaldsMCPClient(token=token)
client.initialize()
tools = client.list_tools()

with open(r"c:\Users\29213\Desktop\麦当劳MCP管理\tools_dump.json", "w", encoding="utf-8") as f:
    json.dump(tools, f, indent=2, ensure_ascii=False)

print(f"Saved {len(tools)} tools to tools_dump.json")
for t in tools:
    name = t.get("name", "?")
    desc = t.get("description", "")[:80]
    schema = t.get("inputSchema", {})
    required = schema.get("required", [])
    props = list(schema.get("properties", {}).keys())
    print(f"\n  [{name}]")
    print(f"    desc: {desc}")
    print(f"    params: {props}")
    print(f"    required: {required}")
