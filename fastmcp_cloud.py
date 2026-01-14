from fastmcp import FastMCP

# FastMCP Cloud looks for an object named mcp/server/app in this module.
mcp = FastMCP("FastMCP Cloud Demo")


@mcp.tool
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b


@mcp.resource("health://status")
def health_status() -> dict[str, str]:
    return {"status": "ok"}
