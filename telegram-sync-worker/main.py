#!/usr/bin/env python3
"""
Telegram Sync Worker - Production Entry Point

This is the main entry point for the Railway-deployed Telegram sync worker.

ARCHITECTURE:
1. Health server (HTTP on PORT) - Railway monitors this
2. Session restoration from env var or volume
3. Realtime listener with automatic recovery
4. Periodic session backups
5. Graceful shutdown handling
6. On-demand media download endpoint

RELIABILITY GUARANTEES:
- Auto-restart on crash (Railway health check)
- Session persistence (Railway Volume)
- Database-backed distributed locking (prevents duplicate listeners)
- Catch-up sync on startup (no missed messages)
- On-demand media download from Telegram API

Author: telegram-crm-v2
Build: v2.4-20251210 (on-demand media download)
"""

import os
import sys
import asyncio
import signal
import json
import base64
from datetime import datetime, timezone
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs
from aiohttp import web

# Import our modules
from session_manager import restore_session_from_env, backup_session, get_session_info

# Configuration
PORT = int(os.getenv('PORT', 8080))
SESSION_PATH = Path(os.getenv('SESSION_PATH', '/data/sessions/telegram_session'))
LOG_PATH = Path(os.getenv('LOG_PATH', '/data/logs'))

# Global state for health checks
worker_state = {
    'status': 'starting',
    'started_at': None,
    'messages_received': 0,
    'last_heartbeat': None,
    'errors': [],
    'listener': None,  # Will hold the RealtimeListener instance
}


def log(message: str, level: str = 'INFO'):
    """Simple logging with timestamp."""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] [{level}] {message}")


# =============================================================================
# HEALTH CHECK SERVER
# =============================================================================

async def health_handler(request):
    """
    Health check endpoint for Railway.

    Returns 200 if:
    - Worker is running
    - Listener has heartbeat within last 5 minutes

    Returns 503 if unhealthy (triggers Railway restart).
    """
    global worker_state

    # Check if we're in a healthy state
    if worker_state['status'] == 'running':
        # Check heartbeat freshness
        last_heartbeat = worker_state.get('last_heartbeat')
        if last_heartbeat:
            heartbeat_age = (datetime.now(timezone.utc) - last_heartbeat).total_seconds()
            if heartbeat_age > 300:  # 5 minutes
                return web.Response(
                    status=503,
                    text=json.dumps({
                        'status': 'unhealthy',
                        'reason': f'Heartbeat stale ({heartbeat_age:.0f}s old)',
                    }),
                    content_type='application/json'
                )

        return web.Response(
            status=200,
            text=json.dumps({
                'status': 'healthy',
                'uptime': (datetime.now(timezone.utc) - worker_state['started_at']).total_seconds() if worker_state['started_at'] else 0,
                'messages_received': worker_state['messages_received'],
            }),
            content_type='application/json'
        )

    elif worker_state['status'] == 'starting':
        # Still starting up - return 200 to avoid premature restart
        return web.Response(
            status=200,
            text=json.dumps({
                'status': 'starting',
                'message': 'Worker is initializing...',
            }),
            content_type='application/json'
        )

    else:
        return web.Response(
            status=503,
            text=json.dumps({
                'status': 'unhealthy',
                'worker_status': worker_state['status'],
                'errors': worker_state['errors'][-5:],
            }),
            content_type='application/json'
        )


async def status_handler(request):
    """Detailed status endpoint."""
    global worker_state

    session_info = get_session_info()

    status = {
        'worker': {
            'status': worker_state['status'],
            'started_at': worker_state['started_at'].isoformat() if worker_state['started_at'] else None,
            'messages_received': worker_state['messages_received'],
            'last_heartbeat': worker_state['last_heartbeat'].isoformat() if worker_state['last_heartbeat'] else None,
            'errors': worker_state['errors'][-10:],
        },
        'session': session_info,
        'environment': {
            'PORT': PORT,
            'SESSION_PATH': str(SESSION_PATH),
            'has_database_url': bool(os.getenv('DATABASE_URL')),
            'has_telegram_credentials': bool(os.getenv('TELEGRAM_API_ID')),
        }
    }

    return web.Response(
        text=json.dumps(status, indent=2, default=str),
        content_type='application/json'
    )


async def download_handler(request):
    """
    On-demand media download from Telegram.

    Query params:
    - telegram_message_id: The Telegram message ID containing media
    - telegram_chat_id: The Telegram chat/channel/user ID

    Returns the media file as binary with appropriate Content-Type.
    """
    global worker_state

    try:
        # Parse query parameters
        telegram_message_id = request.query.get('telegram_message_id')
        telegram_chat_id = request.query.get('telegram_chat_id')

        if not telegram_message_id or not telegram_chat_id:
            return web.Response(
                status=400,
                text=json.dumps({'error': 'Missing telegram_message_id or telegram_chat_id'}),
                content_type='application/json'
            )

        telegram_message_id = int(telegram_message_id)
        telegram_chat_id = int(telegram_chat_id)

        # Get the listener which has the Telegram client
        listener = worker_state.get('listener')
        if not listener or not listener.client:
            return web.Response(
                status=503,
                text=json.dumps({'error': 'Telegram client not ready'}),
                content_type='application/json'
            )

        # Ensure client is connected
        if not listener.client.is_connected():
            return web.Response(
                status=503,
                text=json.dumps({'error': 'Telegram client not connected'}),
                content_type='application/json'
            )

        client = listener.client

        # Fetch the message from Telegram
        try:
            # Get the entity (chat/user/channel) first
            entity = await client.get_entity(telegram_chat_id)

            # Get the specific message
            messages = await client.get_messages(entity, ids=telegram_message_id)
            message = messages if not isinstance(messages, list) else (messages[0] if messages else None)

            if not message or not message.media:
                return web.Response(
                    status=404,
                    text=json.dumps({'error': 'Message or media not found'}),
                    content_type='application/json'
                )

            # Download the media to memory
            media_bytes = await client.download_media(message, file=bytes)

            if not media_bytes:
                return web.Response(
                    status=404,
                    text=json.dumps({'error': 'Failed to download media'}),
                    content_type='application/json'
                )

            # Determine content type and filename
            content_type = 'application/octet-stream'
            filename = f'media_{telegram_message_id}'

            if hasattr(message.media, 'photo'):
                content_type = 'image/jpeg'
                filename = f'photo_{telegram_message_id}.jpg'
            elif hasattr(message.media, 'document'):
                doc = message.media.document
                # Try to get mime type from document
                if hasattr(doc, 'mime_type') and doc.mime_type:
                    content_type = doc.mime_type
                # Try to get filename from attributes
                if hasattr(doc, 'attributes'):
                    for attr in doc.attributes:
                        if hasattr(attr, 'file_name') and attr.file_name:
                            filename = attr.file_name
                            break

            log(f"[DOWNLOAD] Served media: chat={telegram_chat_id}, msg={telegram_message_id}, size={len(media_bytes)}")

            return web.Response(
                body=media_bytes,
                content_type=content_type,
                headers={
                    'Content-Disposition': f'inline; filename="{filename}"',
                    'Cache-Control': 'public, max-age=86400',  # Cache for 24 hours
                }
            )

        except ValueError as e:
            log(f"[DOWNLOAD] Entity not found: {e}", level='WARN')
            return web.Response(
                status=404,
                text=json.dumps({'error': f'Chat not found: {telegram_chat_id}'}),
                content_type='application/json'
            )

    except Exception as e:
        log(f"[DOWNLOAD] Error: {e}", level='ERROR')
        return web.Response(
            status=500,
            text=json.dumps({'error': str(e)}),
            content_type='application/json'
        )


async def start_health_server():
    """Start the HTTP health check server with download endpoint."""
    app = web.Application(client_max_size=50*1024*1024)  # 50MB max for downloads
    app.router.add_get('/health', health_handler)
    app.router.add_get('/status', status_handler)
    app.router.add_get('/download', download_handler)  # On-demand media download
    app.router.add_get('/', health_handler)  # Default route

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', PORT)
    await site.start()
    log(f"Health server started on port {PORT}")
    log(f"Media download endpoint: /download?telegram_chat_id=X&telegram_message_id=Y")


# =============================================================================
# LISTENER CALLBACKS
# =============================================================================

def on_message_received():
    """Called by listener when a message is received."""
    global worker_state
    worker_state['messages_received'] += 1


def on_heartbeat():
    """Called by listener on heartbeat."""
    global worker_state
    worker_state['last_heartbeat'] = datetime.now(timezone.utc)


def on_error(error: str):
    """Called by listener on error."""
    global worker_state
    worker_state['errors'].append({
        'error': error,
        'timestamp': datetime.now(timezone.utc).isoformat()
    })
    # Keep only last 20 errors
    worker_state['errors'] = worker_state['errors'][-20:]


# =============================================================================
# MAIN WORKER LOOP
# =============================================================================

async def run_listener():
    """Run the Telegram realtime listener."""
    global worker_state

    # Import here to avoid issues during health check startup
    from realtime_listener import RealtimeListener

    log("Starting realtime listener...")

    listener = RealtimeListener(
        session_path=str(SESSION_PATH),
        on_message=on_message_received,
        on_heartbeat=on_heartbeat,
        on_error=on_error,
    )

    worker_state['listener'] = listener
    worker_state['status'] = 'running'
    worker_state['started_at'] = datetime.now(timezone.utc)

    try:
        await listener.start()
    except Exception as e:
        log(f"Listener error: {e}", level='ERROR')
        worker_state['status'] = 'error'
        on_error(str(e))
        raise


async def periodic_backup():
    """Periodically backup the session file."""
    while True:
        await asyncio.sleep(3600)  # Every hour
        try:
            backup_session()
            log("Session backed up successfully")
        except Exception as e:
            log(f"Session backup failed: {e}", level='WARN')


async def main():
    """Main entry point."""
    global worker_state

    log("=" * 60)
    log("  TELEGRAM SYNC WORKER - RAILWAY EDITION")
    log("=" * 60)
    log(f"Port: {PORT}")
    log(f"Session path: {SESSION_PATH}")
    log("")

    # Start health server first (so Railway knows we're alive)
    await start_health_server()

    # Restore session from env var if needed
    log("Checking session...")
    if not restore_session_from_env():
        log("FATAL: Could not restore Telegram session", level='ERROR')
        log("Set TELEGRAM_SESSION_BASE64 environment variable to fix this")
        worker_state['status'] = 'error'
        worker_state['errors'].append({
            'error': 'Session restoration failed',
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
        # Keep the health server running so we can diagnose
        while True:
            await asyncio.sleep(60)

    # Validate environment
    required_vars = ['DATABASE_URL', 'TELEGRAM_API_ID', 'TELEGRAM_API_HASH']
    missing = [v for v in required_vars if not os.getenv(v)]
    if missing:
        log(f"FATAL: Missing environment variables: {missing}", level='ERROR')
        worker_state['status'] = 'error'
        while True:
            await asyncio.sleep(60)

    # Start periodic backup task
    asyncio.create_task(periodic_backup())

    # Run the listener (with auto-restart)
    retry_count = 0
    max_retries = 10

    while retry_count < max_retries:
        try:
            await run_listener()
        except KeyboardInterrupt:
            log("Shutdown requested")
            break
        except Exception as e:
            retry_count += 1
            log(f"Listener crashed (attempt {retry_count}/{max_retries}): {e}", level='ERROR')
            worker_state['status'] = 'restarting'

            if retry_count < max_retries:
                wait_time = min(30, 5 * retry_count)  # Exponential backoff, max 30s
                log(f"Restarting in {wait_time} seconds...")
                await asyncio.sleep(wait_time)
            else:
                log("Max retries exceeded, giving up", level='ERROR')
                worker_state['status'] = 'failed'
                # Exit with error code to trigger Railway restart
                sys.exit(1)

    log("Worker shutting down")


def signal_handler(signum, frame):
    """Handle shutdown signals."""
    log(f"Received signal {signum}, initiating graceful shutdown...")

    # If we have a listener, trigger its shutdown
    if worker_state.get('listener'):
        worker_state['listener'].request_shutdown()

    # Create a task to cleanly exit
    asyncio.create_task(graceful_shutdown())


async def graceful_shutdown():
    """Graceful shutdown procedure."""
    global worker_state

    log("Starting graceful shutdown...")
    worker_state['status'] = 'stopping'

    # Backup session before exit
    try:
        backup_session()
        log("Final session backup completed")
    except Exception as e:
        log(f"Final backup failed: {e}", level='WARN')

    # Give tasks a moment to finish
    await asyncio.sleep(2)

    log("Shutdown complete")
    sys.exit(0)


if __name__ == '__main__':
    # Setup signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # Run the main async loop
    asyncio.run(main())
