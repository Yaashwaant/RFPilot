#!/bin/sh
set -e

echo "🚀 Starting FastAPI Backend on 0.0.0.0:8000..."
cd /app/backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/uvicorn.log 2>&1 &
API_PID=$!

# Wait for FastAPI to accept connections
READY=0
for i in $(seq 1 40); do
    if curl -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
        echo "✅ FastAPI Backend is online and ready!"
        READY=1
        break
    fi
    if ! kill -0 $API_PID 2>/dev/null; then
        echo "❌ FastAPI process exited unexpectedly! Recent logs:"
        cat /tmp/uvicorn.log
        exit 1
    fi
    sleep 0.5
done

if [ "$READY" -eq 0 ]; then
    echo "⚠️ Warning: FastAPI took longer than 20s to respond. Recent logs:"
    cat /tmp/uvicorn.log
fi

echo "🌐 Starting Next.js Frontend on 0.0.0.0:${PORT:-3000}..."
cd /app/frontend
export PORT="${PORT:-3000}"
export HOSTNAME="0.0.0.0"

# Forward termination signals
trap "kill -TERM $API_PID 2>/dev/null || true" INT TERM EXIT

exec node server.js
