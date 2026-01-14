#!/usr/bin/env bash
set -euo pipefail

target="${RAILWAY_START_TARGET:-mcp}"

if [[ "${target}" == "control-plane" ]]; then
  exec /opt/venv/bin/python -m uvicorn control_plane_api:app --host 0.0.0.0 --port "${PORT:-8000}"
fi

exec /opt/venv/bin/python railway_server.py

