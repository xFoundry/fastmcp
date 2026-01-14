"""Railway entrypoint for the Airtable MCP proxy server."""

import os

from fastmcp import FastMCP
from fastmcp.server import create_proxy


def _build_airtable_env() -> dict[str, str]:
    api_key = os.getenv("AIRTABLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "AIRTABLE_API_KEY is required to run the Airtable MCP server."
        )

    env = {"AIRTABLE_API_KEY": api_key}
    api_url = os.getenv("AIRTABLE_API_URL")
    if api_url:
        env["AIRTABLE_API_URL"] = api_url
    return env


def _create_airtable_proxy() -> FastMCP:
    config = {
        "mcpServers": {
            "airtable": {
                "command": "npx",
                "args": ["-y", "airtable-mcp-server"],
                "env": _build_airtable_env(),
            }
        }
    }
    return create_proxy(config, name="Airtable MCP Proxy")


mcp = FastMCP("Airtable MCP Gateway")
mcp.mount(_create_airtable_proxy())


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    mcp.run(transport="http", host="0.0.0.0", port=port, path="/mcp")
