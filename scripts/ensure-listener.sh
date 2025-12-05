#!/bin/bash
# Telegram Realtime Listener Health Check
# Runs every 5 minutes via cron to ensure the listener is always running
# The listener itself handles catch-up sync on startup, so no messages are missed

PROJECT_DIR="/Users/sagarrabadia/telegram-crm-v2"
LOG_FILE="$PROJECT_DIR/logs/listener-health.log"
STATE_FILE="$PROJECT_DIR/scripts/telegram-sync-python/listener-state.json"

# Ensure log directory exists
mkdir -p "$PROJECT_DIR/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check if listener process is running
if pgrep -f "realtime_listener.py" > /dev/null 2>&1; then
    # Process exists, check if it's healthy by looking at heartbeat
    if [ -f "$STATE_FILE" ]; then
        LAST_HEARTBEAT=$(python3 -c "import json; f=open('$STATE_FILE'); d=json.load(f); print(d.get('last_heartbeat',''))" 2>/dev/null)
        if [ -n "$LAST_HEARTBEAT" ]; then
            # Check if heartbeat is within last 5 minutes (300 seconds)
            HEARTBEAT_AGE=$(python3 -c "
from datetime import datetime, timezone
try:
    hb = datetime.fromisoformat('$LAST_HEARTBEAT'.replace('Z','+00:00'))
    now = datetime.now(timezone.utc)
    age = (now - hb).total_seconds()
    print(int(age))
except:
    print(9999)
" 2>/dev/null)

            if [ "$HEARTBEAT_AGE" -lt 300 ]; then
                log "OK: Listener healthy (heartbeat ${HEARTBEAT_AGE}s ago)"
                exit 0
            else
                log "WARNING: Listener stale (heartbeat ${HEARTBEAT_AGE}s ago), killing and restarting"
                pkill -f "realtime_listener.py"
                sleep 2
            fi
        fi
    fi
else
    log "WARNING: Listener not running, starting..."
fi

# Start the listener
cd "$PROJECT_DIR"
python3 scripts/telegram-sync-python/realtime_listener.py >> "$PROJECT_DIR/logs/listener.log" 2>&1 &
NEW_PID=$!

sleep 5

if ps -p $NEW_PID > /dev/null 2>&1; then
    log "SUCCESS: Listener started (PID: $NEW_PID)"
else
    log "ERROR: Failed to start listener"
    exit 1
fi
