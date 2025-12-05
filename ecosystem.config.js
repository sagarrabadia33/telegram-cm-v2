/**
 * PM2 Ecosystem Configuration for Telegram CRM
 *
 * Start all services:
 *   pm2 start ecosystem.config.js
 *
 * Start specific service:
 *   pm2 start ecosystem.config.js --only telegram-listener
 *
 * Monitor:
 *   pm2 monit
 *
 * Logs:
 *   pm2 logs telegram-listener
 *
 * Setup auto-start on system boot:
 *   pm2 startup
 *   pm2 save
 */

module.exports = {
  apps: [
    {
      name: 'telegram-listener',
      script: 'scripts/telegram-sync-python/realtime_listener.py',
      interpreter: 'python3',
      cwd: '/Users/sagarrabadia/telegram-crm-v2',

      // Auto-restart configuration
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',
      restart_delay: 5000,  // 5 second delay between restarts

      // Exponential backoff for repeated failures
      exp_backoff_restart_delay: 100,

      // Resource limits
      max_memory_restart: '500M',

      // Logging
      error_file: 'logs/telegram-listener-error.log',
      out_file: 'logs/telegram-listener-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Environment
      env: {
        NODE_ENV: 'production',
      },

      // Watch for config changes (disabled for stability)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
    },
  ]
};
