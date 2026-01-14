import os

from fastmcp import FastMCP


mcp = FastMCP("FastMCP Railway Demo")


@mcp.tool
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b


@mcp.resource("health://status")
def health_status() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    mcp.run(transport="http", host="0.0.0.0", port=port, path="/mcp")

