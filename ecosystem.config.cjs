module.exports = {
  apps: [
    {
      name: "specter-command",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "/var/www/specter-command",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      },
      env_production: {
        NODE_ENV: "production"
      },
      max_memory_restart: "512M",
      time: true
    },
    {
      name: "specter-bot-worker",
      script: "node_modules/.bin/tsx",
      args: "src/workers/baileys-worker.ts",
      cwd: "/var/www/specter-command",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        BAILEYS_AUTH_DIR: "/var/www/specter-command/.data/baileys"
      },
      env_production: {
        NODE_ENV: "production",
        BAILEYS_AUTH_DIR: "/var/www/specter-command/.data/baileys"
      },
      max_memory_restart: "384M",
      time: true
    }
  ]
};
