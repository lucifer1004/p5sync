module.exports = {
  apps: [
    {
      name: 'p5sync',
      script: 'index.ts',
      instances: 1,
      autorestart: true,
      watch: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'dev',
      },
      env_mac: {
        NODE_ENV: 'prod',
        REDIS_PORT: 6379,
        REDIS_HOST: 'docker.for.mac.localhost',
      },
      env_production: {
        NODE_ENV: 'prod',
        REDIS_PORT: 6379,
        REDIS_HOST: '127.0.0.1',
      },
    },
  ],
}
