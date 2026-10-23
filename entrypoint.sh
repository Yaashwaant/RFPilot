#!/bin/sh
set -e

echo "🚀 Starting FastAPI Backend on 127.0.0.1:8000..."
cd /app/backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
API_PID=$!

# Wait for FastAPI to accept connections
READY=0
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
        echo "✅ FastAPI Backend is online and ready!"
        READY=1
        break
    fi
    if ! kill -0 $API_PID 2>/dev/null; then
        echo "❌ FastAPI process exited unexpectedly!"
        exit 1
    fi
    sleep 0.5
done

if [ "$READY" -eq 0 ]; then
    echo "⚠️ Warning: FastAPI did not respond on /docs within 15s, continuing..."
fi

echo "🌐 Starting Next.js Frontend on 0.0.0.0:${PORT:-3000}..."
cd /app/frontend
export PORT="${PORT:-3000}"
export HOSTNAME="0.0.0.0"

# Forward termination signals
trap "kill -TERM $API_PID 2>/dev/null || true" INT TERM EXIT

exec node server.js
