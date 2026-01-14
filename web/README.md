# FastMCP Control Plane UI

This is a Next.js 16 + shadcn/ui dashboard for managing FastMCP servers.

## Features

- Add, delete, and list MCP servers
- View recent log entries per server
- Built on Next.js App Router with API routes

## Running locally

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

The UI proxies API requests to the control plane service. Set the API base URL:

```bash
export CONTROL_PLANE_API_URL="http://localhost:8001"
```

## Control plane API (required)

The FastAPI control plane powers real server management, connectivity checks, and logs.

```bash
uv run uvicorn control_plane_api:app --reload --port 8001
```

Set `CONTROL_PLANE_DB` to point at a SQLite file if you want a custom path. For
production, use a durable database and configure `CONTROL_PLANE_CORS_ORIGINS`
to allow the UI domain.

