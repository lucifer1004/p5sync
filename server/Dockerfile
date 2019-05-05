FROM keymetrics/pm2:latest-alpine

RUN apk add --no-cache tini
# Tini is now available at /sbin/tini

WORKDIR /root/p5sync

# Set tini as entrypoint
ENTRYPOINT ["/sbin/tini", "--"]

# copy project file
COPY . .

# install node modules
RUN yarn install
RUN pm2 install typescript

# Expose the listening port of your app
EXPOSE 8000

CMD [ "pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]
