"""Railway entrypoint for the Airtable MCP proxy server."""

import os
from typing import Any

import mcp.types

from fastmcp import Client, FastMCP
from fastmcp.server import create_proxy
from fastmcp.server.auth.providers.debug import DebugTokenVerifier

TEXT_FIELD_TYPES = {
    "singleLineText",
    "multilineText",
    "richText",
    "email",
    "url",
    "phoneNumber",
}


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


def _build_gateway_auth() -> DebugTokenVerifier:
    auth_token = os.getenv("MCP_AUTH_TOKEN")
    if not auth_token:
        raise RuntimeError("MCP_AUTH_TOKEN is required to protect the MCP gateway.")
    return DebugTokenVerifier(validate=lambda token: token == auth_token)


def _airtable_client_config() -> dict[str, Any]:
    return {
        "mcpServers": {
            "airtable": {
                "command": "npx",
                "args": ["-y", "airtable-mcp-server"],
                "env": _build_airtable_env(),
            }
        }
    }


def _create_airtable_proxy() -> FastMCP:
    return create_proxy(_airtable_client_config(), name="Airtable MCP Proxy")


async def _call_airtable_tool(
    name: str, arguments: dict[str, Any] | None = None
) -> dict[str, Any]:
    async with Client(_airtable_client_config()) as client:
        result = await client.call_tool(name, arguments or {})
    if result.structured_content is not None:
        return result.structured_content
    text_chunks = [
        content.text
        for content in result.content
        if isinstance(content, mcp.types.TextContent)
    ]
    return {"text": "".join(text_chunks)}


def _escape_formula_string(value: str) -> str:
    return value.replace('"', '\\"')


def _normalize_field_name(field_name: str) -> str:
    stripped = field_name.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped
    return f"{{{stripped}}}"


def _extract_tables(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(payload.get("tables"), list):
        return payload["tables"]
    if isinstance(payload.get("data"), dict) and isinstance(
        payload["data"].get("tables"), list
    ):
        return payload["data"]["tables"]
    if isinstance(payload.get("records"), list):
        return payload["records"]
    if isinstance(payload.get("items"), list):
        return payload["items"]
    return []


def _summarize_fields(fields: list[dict[str, Any]]) -> dict[str, Any]:
    text_fields: list[str] = []
    linked_fields: list[str] = []
    lookup_fields: list[str] = []
    rollup_fields: list[str] = []
    field_types: dict[str, str] = {}

    for field in fields:
        name = field.get("name") or field.get("id") or "unknown"
        field_type = field.get("type") or field.get("fieldType")
        if field_type:
            field_types[str(name)] = str(field_type)
        if field_type in TEXT_FIELD_TYPES:
            text_fields.append(str(name))
        if field_type == "multipleRecordLinks":
            linked_fields.append(str(name))
        if field_type == "lookup":
            lookup_fields.append(str(name))
        if field_type == "rollup":
            rollup_fields.append(str(name))

    return {
        "text_fields": text_fields,
        "linked_fields": linked_fields,
        "lookup_fields": lookup_fields,
        "rollup_fields": rollup_fields,
        "field_types": field_types,
    }


async def airtable_discover_schema(
    base_id: str | None = None,
    detail_level: str = "full",
) -> dict[str, Any]:
    """Discover Airtable schema using list_bases → list_tables → describe_table."""
    diagnostics: dict[str, Any] = {"warnings": [], "notes": []}
    suggestions: list[str] = []

    bases_payload = await _call_airtable_tool("list_bases")
    bases = bases_payload.get("bases", bases_payload)

    if not base_id:
        diagnostics["warnings"].append(
            "No base_id provided. Returning available bases so you can choose one."
        )
        suggestions.append("Pick a base_id, then call airtable_discover_schema again.")
        return {
            "bases": bases,
            "tables": [],
            "tables_summary": [],
            "diagnostics": diagnostics,
            "suggestions": suggestions,
        }

    tables_payload = await _call_airtable_tool(
        "list_tables",
        {"baseId": base_id, "detailLevel": detail_level},
    )
    tables = _extract_tables(tables_payload)
    tables_summary: list[dict[str, Any]] = []

    for table in tables:
        table_id = table.get("id")
        fields = table.get("fields")
        if not fields and table_id:
            describe_payload = await _call_airtable_tool(
                "describe_table",
                {
                    "baseId": base_id,
                    "tableId": table_id,
                    "detailLevel": "full",
                },
            )
            describe_tables = _extract_tables(describe_payload)
            if describe_tables:
                table = describe_tables[0]
                fields = table.get("fields")
        field_summary = _summarize_fields(fields or [])
        tables_summary.append(
            {
                "id": table.get("id"),
                "name": table.get("name"),
                "field_summary": field_summary,
            }
        )

    diagnostics["notes"].append(
        "Use list_records with filterByFormula for non-text searches."
    )
    suggestions.append(
        "If you need text search, use search_records only when text fields exist."
    )

    return {
        "bases": bases,
        "tables": tables,
        "tables_summary": tables_summary,
        "diagnostics": diagnostics,
        "suggestions": suggestions,
    }


def airtable_build_formula(
    search_term: str,
    field_name: str,
    mode: str = "contains",
    case_insensitive: bool = True,
) -> dict[str, Any]:
    """Build common Airtable filterByFormula expressions."""
    safe_term = _escape_formula_string(search_term)
    field_ref = _normalize_field_name(field_name)
    term_expr = safe_term.lower() if case_insensitive else safe_term
    field_expr = f"LOWER({field_ref})" if case_insensitive else field_ref

    if mode == "equals":
        formula = f'{field_expr} = "{term_expr}"'
    elif mode == "starts_with":
        formula = f'LEFT({field_expr}, LEN("{term_expr}")) = "{term_expr}"'
    else:
        formula = f'SEARCH("{term_expr}", {field_expr})'

    return {
        "formula": formula,
        "notes": [
            "Use list_records with filterByFormula for any field type.",
            "SEARCH is case-insensitive when combined with LOWER().",
        ],
    }


async def airtable_list_records_safe(
    base_id: str,
    table_id: str,
    filter_by_formula: str | None = None,
    max_records: int = 200,
    search_term: str | None = None,
    search_field: str | None = None,
    search_field_id: str | None = None,
    use_search_records: bool = False,
    sort: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """List records with safer defaults and fallbacks for non-text search."""
    diagnostics: dict[str, Any] = {
        "warnings": [],
        "fallback_used": False,
        "used_tool": None,
    }
    suggestions: list[str] = []

    if use_search_records and search_term:
        diagnostics["used_tool"] = "search_records"
        try:
            payload = {
                "baseId": base_id,
                "tableId": table_id,
                "searchTerm": search_term,
                "maxRecords": max_records,
            }
            if search_field_id:
                payload["fieldIds"] = [search_field_id]
            result = await _call_airtable_tool("search_records", payload)
            return {
                "records": result,
                "diagnostics": diagnostics,
                "suggestions": suggestions,
            }
        except Exception as exc:
            diagnostics["warnings"].append(
                f"search_records failed: {exc}. Falling back to list_records."
            )
            diagnostics["fallback_used"] = True

    if not filter_by_formula and search_term and search_field:
        formula_payload = airtable_build_formula(
            search_term=search_term,
            field_name=search_field,
        )
        filter_by_formula = formula_payload["formula"]
        suggestions.append("Built filterByFormula from search_term and search_field.")

    diagnostics["used_tool"] = "list_records"
    list_payload = {
        "baseId": base_id,
        "tableId": table_id,
        "maxRecords": max_records,
    }
    if filter_by_formula:
        list_payload["filterByFormula"] = filter_by_formula
    if sort:
        list_payload["sort"] = sort
    if not filter_by_formula and not search_term:
        diagnostics["warnings"].append(
            "No filter_by_formula provided. Results may be broad."
        )
    if max_records < 200:
        diagnostics["warnings"].append(
            "max_records is low; consider increasing to avoid missing matches."
        )

    result = await _call_airtable_tool("list_records", list_payload)
    if not result:
        diagnostics["warnings"].append(
            "Empty records returned. Verify table_id or filterByFormula."
        )
        suggestions.append("Try describe_table to confirm field names and types.")

    return {
        "records": result,
        "diagnostics": diagnostics,
        "suggestions": suggestions,
        "query": {"filterByFormula": filter_by_formula},
    }


mcp = FastMCP("Airtable MCP Gateway", auth=_build_gateway_auth())
mcp.tool(airtable_discover_schema)
mcp.tool(airtable_build_formula)
mcp.tool(airtable_list_records_safe)
mcp.mount(_create_airtable_proxy())


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    mcp.run(transport="http", host="0.0.0.0", port=port, path="/mcp")
