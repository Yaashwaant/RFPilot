#!/bin/sh
set -e

echo "===================================================="
echo "🚀 Starting RFPilot (Proposal Assistant) Full-Stack"
echo "   Node.js: $(node -v)"
echo "   Python:  $(python3 --version)"
echo "===================================================="

# Ensure directories for SQLite data and file storage
mkdir -p /tmp/rfpilot_data/uploads
chmod -R 777 /tmp/rfpilot_data

# Function to run FastAPI under an auto-restarting supervisor
start_fastapi() {
    cd /app/backend
    export PYTHONPATH="/app/backend:${PYTHONPATH:-}"
    while true; do
        echo "🚀 [FastAPI] Launching Uvicorn on 0.0.0.0:8000..."
        python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
        EXIT_CODE=$?
        echo "⚠️ [FastAPI] Uvicorn exited with code $EXIT_CODE. Restarting in 2s..." >&2
        sleep 2
    done
}

# Launch FastAPI supervisor in the background
start_fastapi &
FASTAPI_PID=$!

echo "Waiting for FastAPI to accept connections on port 8000..."
READY=0
for i in $(seq 1 30); do
    if curl -s -f http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
        echo "✅ FastAPI Backend is online and accepting connections!"
        READY=1
        break
    fi
    sleep 1
done

if [ "$READY" -eq 0 ]; then
    echo "⚠️ Warning: FastAPI health check did not respond in 30s. Diagnostic check:" >&2
    curl -v http://127.0.0.1:8000/api/health 2>&1 || true
fi

echo "🌐 Starting Next.js Frontend on 0.0.0.0:${PORT:-3000}..."
cd /app/frontend
export PORT="${PORT:-3000}"
export HOSTNAME="0.0.0.0"

# Forward termination signals to background FastAPI
trap "kill -TERM $FASTAPI_PID 2>/dev/null || true; exit 0" INT TERM

# If custom command was passed to container, run it; otherwise start standalone Next.js server
if [ $# -gt 0 ] && [ "$1" != "/app/entrypoint.sh" ]; then
    echo "Executing custom container command: $@"
    exec "$@"
else
    exec node server.js
fi
