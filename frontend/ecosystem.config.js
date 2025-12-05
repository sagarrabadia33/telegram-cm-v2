module.exports = {
  apps: [{
    name: 'telegram-crm',
    script: 'npm',
    args: 'run dev',
    cwd: '/Users/sagarrabadia/telegram-crm-v2/frontend',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000,
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    error_file: '/Users/sagarrabadia/telegram-crm-v2/logs/pm2-error.log',
    out_file: '/Users/sagarrabadia/telegram-crm-v2/logs/pm2-out.log',
    merge_logs: true,
    time: true
  }]
};
