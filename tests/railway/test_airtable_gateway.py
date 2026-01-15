import importlib

import pytest


def _load_gateway(monkeypatch):
    monkeypatch.setenv("AIRTABLE_API_KEY", "test-key")
    monkeypatch.setenv("MCP_AUTH_TOKEN", "test-token")
    module = importlib.import_module("railway_server")
    return importlib.reload(module)


def test_airtable_build_formula_contains_case_insensitive(monkeypatch):
    gateway = _load_gateway(monkeypatch)
    result = gateway.airtable_build_formula(
        search_term="Defenx",
        field_name="Team Name",
    )
    assert result["formula"] == 'SEARCH("defenx", LOWER({Team Name}))'


@pytest.mark.asyncio
async def test_airtable_discover_schema_requires_base(monkeypatch):
    gateway = _load_gateway(monkeypatch)

    async def fake_call(name, arguments=None):
        assert name == "list_bases"
        return {"bases": [{"id": "base_1", "name": "Main"}]}

    monkeypatch.setattr(gateway, "_call_airtable_tool", fake_call)
    result = await gateway.airtable_discover_schema()
    assert result["bases"][0]["id"] == "base_1"
    assert result["diagnostics"]["warnings"]


@pytest.mark.asyncio
async def test_airtable_list_records_safe_builds_formula(monkeypatch):
    gateway = _load_gateway(monkeypatch)
    calls = {}

    async def fake_call(name, arguments=None):
        calls["name"] = name
        calls["arguments"] = arguments or {}
        return {"records": [{"id": "rec_1"}]}

    monkeypatch.setattr(gateway, "_call_airtable_tool", fake_call)
    result = await gateway.airtable_list_records_safe(
        base_id="base_1",
        table_id="table_1",
        search_term="Alice",
        search_field="Owner",
    )
    assert result["records"]["records"][0]["id"] == "rec_1"
    assert calls["name"] == "list_records"
    assert "filterByFormula" in calls["arguments"]


@pytest.mark.asyncio
async def test_airtable_list_records_safe_fallback(monkeypatch):
    gateway = _load_gateway(monkeypatch)
    calls = {"count": 0}

    async def fake_call(name, arguments=None):
        calls["count"] += 1
        if name == "search_records":
            raise RuntimeError("No text fields available to search.")
        return {"records": []}

    monkeypatch.setattr(gateway, "_call_airtable_tool", fake_call)
    result = await gateway.airtable_list_records_safe(
        base_id="base_1",
        table_id="table_1",
        search_term="Alpha",
        use_search_records=True,
        max_records=50,
    )
    assert result["diagnostics"]["fallback_used"] is True
    assert result["diagnostics"]["used_tool"] == "list_records"

