# Telegram Sync Worker - Production Dockerfile
# Optimized for Railway deployment with 24/7 reliability

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for psycopg2
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for Docker layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY *.py ./

# Create directories for persistent data
RUN mkdir -p /data/sessions /data/logs

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV SESSION_PATH=/data/sessions/telegram_session
ENV LOG_PATH=/data/logs

# Expose health check port (Railway will set PORT env var)
EXPOSE 8080

# Health check - Railway will use this to monitor the container
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT:-8080}/health')" || exit 1

# Run the worker
CMD ["python", "main.py"]
