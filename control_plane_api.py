import os
import sqlite3
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from fastmcp import Client


DATABASE_PATH = os.getenv("CONTROL_PLANE_DB", "control-plane.db")


@dataclass(slots=True)
class CheckResult:
    ok: bool
    latency_ms: int
    detail: str


class ServerCreate(BaseModel):
    name: str
    endpoint: str
    type: str = Field(pattern="^(stdio|http|sse)$")


class ServerRecord(ServerCreate):
    id: str
    createdAt: str
    lastCheckAt: str | None = None
    lastCheckStatus: str | None = None
    lastCheckLatencyMs: int | None = None
    lastCheckDetail: str | None = None


class LogRecord(BaseModel):
    id: str
    server_id: str
    timestamp: str
    level: str
    message: str


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="FastMCP Control Plane API", lifespan=lifespan)

origins = os.getenv("CONTROL_PLANE_CORS_ORIGINS", "").split(",")
origins = [origin.strip() for origin in origins if origin.strip()]
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_check_at TEXT,
                last_check_status TEXT,
                last_check_latency_ms INTEGER,
                last_check_detail TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS logs (
                id TEXT PRIMARY KEY,
                server_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
            )
            """
        )


def row_to_server(row: sqlite3.Row) -> ServerRecord:
    data = dict(row)
    return ServerRecord(
        id=data["id"],
        name=data["name"],
        endpoint=data["endpoint"],
        type=data["type"],
        createdAt=data["created_at"],
        lastCheckAt=data["last_check_at"],
        lastCheckStatus=data["last_check_status"],
        lastCheckLatencyMs=data["last_check_latency_ms"],
        lastCheckDetail=data["last_check_detail"],
    )


def row_to_log(row: sqlite3.Row) -> LogRecord:
    return LogRecord(**dict(row))


def append_log(server_id: str, level: str, message: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO logs (id, server_id, timestamp, level, message) VALUES (?, ?, ?, ?, ?)",
            (
                os.urandom(8).hex(),
                server_id,
                time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                level,
                message,
            ),
        )
        conn.execute(
            """
            DELETE FROM logs
            WHERE id IN (
                SELECT id FROM logs
                WHERE server_id = ?
                ORDER BY timestamp DESC
                LIMIT -1 OFFSET 200
            )
            """,
            (server_id,),
        )


async def run_check(server: ServerRecord) -> CheckResult:
    start = time.perf_counter()
    try:
        async with Client(server.endpoint) as client:
            await client.list_tools()
        latency = int((time.perf_counter() - start) * 1000)
        return CheckResult(ok=True, latency_ms=latency, detail="Connection succeeded.")
    except Exception as exc:
        latency = int((time.perf_counter() - start) * 1000)
        return CheckResult(ok=False, latency_ms=latency, detail=str(exc))


@app.get("/servers")
def list_servers() -> dict[str, list[ServerRecord]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM servers ORDER BY created_at DESC").fetchall()
    return {"servers": [row_to_server(row) for row in rows]}


@app.post("/servers")
def create_server(payload: ServerCreate) -> dict[str, ServerRecord]:
    server_id = os.urandom(8).hex()
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO servers (id, name, endpoint, type, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (server_id, payload.name, payload.endpoint, payload.type, created_at),
        )
    append_log(server_id, "info", f"Server {payload.name} registered.")
    return {
        "server": ServerRecord(
            id=server_id,
            name=payload.name,
            endpoint=payload.endpoint,
            type=payload.type,
            createdAt=created_at,
        )
    }


@app.delete("/servers/{server_id}")
def delete_server(server_id: str) -> dict[str, Any]:
    with get_conn() as conn:
        result = conn.execute("DELETE FROM servers WHERE id = ?", (server_id,))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Server not found.")
    return {"ok": True}


@app.get("/servers/{server_id}/logs")
def get_logs(server_id: str) -> dict[str, list[LogRecord]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM logs WHERE server_id = ? ORDER BY timestamp DESC",
            (server_id,),
        ).fetchall()
    return {"logs": [row_to_log(row) for row in rows]}


@app.post("/servers/{server_id}/check")
async def check_server(server_id: str) -> dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM servers WHERE id = ?", (server_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Server not found.")
    server = row_to_server(row)
    result = await run_check(server)
    status = "healthy" if result.ok else "unreachable"
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE servers
            SET last_check_at = ?, last_check_status = ?, last_check_latency_ms = ?, last_check_detail = ?
            WHERE id = ?
            """,
            (timestamp, status, result.latency_ms, result.detail, server_id),
        )
    level = "info" if result.ok else "error"
    append_log(
        server_id,
        level,
        f"Connectivity check: {status} ({result.latency_ms}ms) - {result.detail}",
    )
    return {
        "status": status,
        "latency_ms": result.latency_ms,
        "detail": result.detail,
    }

