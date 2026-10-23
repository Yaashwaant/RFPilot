#!/bin/sh
set -e

echo "🚀 Starting FastAPI Backend on 0.0.0.0:8000..."
cd /app/backend
export PYTHONPATH="/app/backend:${PYTHONPATH:-}"

# Start uvicorn with LIVE stdout and stderr output
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
API_PID=$!

echo "Waiting for FastAPI to accept connections on port 8000..."
READY=0
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
        echo "✅ FastAPI Backend is online and ready on port 8000!"
        READY=1
        break
    fi
    sleep 1
done

if [ "$READY" -eq 0 ]; then
    echo "⚠️ Warning: FastAPI health check did not pass within 30s."
fi

echo "🌐 Starting Next.js Frontend on 0.0.0.0:${PORT:-3000}..."
cd /app/frontend
export PORT="${PORT:-3000}"
export HOSTNAME="0.0.0.0"

# Forward termination signals
trap "kill -TERM $API_PID 2>/dev/null || true" INT TERM EXIT

exec node server.js
