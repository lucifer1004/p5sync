# SocketCluster Sample App

This is a sample SocketCluster app.

To run the app:

1. You need to start a Redis instance, and change the corresponding properties of `env_production` in `ecosystem.config.js`.
2. You need to build the docker image, via `docker build -t p5sync .`
3. You can run the docker image by `docker run -dit --net=host p5sync`. If your host is Mac and Redis is running on your host, you will need to change the last parameter of `CMD` in `Dockerfile` to `mac` (from `production`).

Now you should have a socket server running on `localhost:8000`.
