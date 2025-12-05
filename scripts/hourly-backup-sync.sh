#!/bin/bash
# Telegram Hourly Backup Sync
# Runs every hour as a safety net to catch any messages the realtime listener might have missed
# Uses the lock manager to prevent conflicts with the realtime listener

PROJECT_DIR="/Users/sagarrabadia/telegram-crm-v2"
LOG_FILE="$PROJECT_DIR/logs/backup-sync.log"

# Ensure log directory exists
mkdir -p "$PROJECT_DIR/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "Starting hourly backup sync..."

cd "$PROJECT_DIR"

# Run incremental sync (it will acquire a lock and skip if listener is busy)
START_TIME=$(date +%s)
python3 scripts/telegram-sync-python/incremental_sync.py >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [ $EXIT_CODE -eq 0 ]; then
    log "SUCCESS: Backup sync completed in ${DURATION}s"
else
    log "WARNING: Backup sync exited with code $EXIT_CODE (may have skipped due to lock)"
fi
