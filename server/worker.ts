import cors from 'cors'
import express from 'express'
import Redis from 'ioredis'
import morgan from 'morgan'
import path from 'path'
import healthChecker from 'sc-framework-health-check'
import serveStatic from 'serve-static'
import SCWorker from 'socketcluster/scworker'

interface Point {
  x: number
  y: number
}

interface Circle {
  center: Point
  radius: number
}

interface Line {
  start: Point
  end: Point
}

interface Operation {
  id: string
  mode: 'clear' | 'pencil' | 'rubber'
  lines?: Line[]
  circles?: Circle[]
  timestamp?: Date
}

class MySCWorker extends SCWorker {
  run() {
    console.log('   >> Worker PID:', process.pid)
    const environment = this.options.environment

    const app = express()
    const corsOptions = {
      origin: ['http://localhost:3000', 'http://localhost:1234'],
      credentials: true,
      optionsSuccessStatus: 200, // some legacy browsers (IE11, constious SmartTVs) choke on 204
    }
    app.use(cors(corsOptions))

    const httpServer = this.httpServer
    const scServer = this.scServer
    const redis = new Redis()

    if (environment === 'dev') {
      // Log every HTTP request. See https://github.com/expressjs/morgan for other
      // available formats.
      app.use(morgan('dev'))
    }
    app.use(serveStatic(path.resolve(__dirname, 'public')))

    // Add GET /health-check express route
    healthChecker.attach(this, app)

    httpServer.on('request', app)

    redis.set('rooms', JSON.stringify([]))

    // redis.set('room/default/users', JSON.stringify([]))

    scServer.on('connection', (socket: any) => {
      socket.on('request_history', async (data: any) => {
        const roomToJoin = data.room || 'default'
        try {
          const rooms = JSON.parse(await redis.get(`rooms`))
          if (!rooms.find((room: string) => room === roomToJoin)) {
            await redis
              .pipeline([
                ['set', 'rooms', JSON.stringify(rooms.concat(roomToJoin))],
                ['set', `room/${roomToJoin}/users`, JSON.stringify([])],
              ])
              .exec()
            const channel = scServer.exchange.subscribe(`room/${roomToJoin}`)
            channel.watch(async (data: Operation) => {
              try {
                switch (data.mode) {
                  case 'clear':
                    await redis.set(
                      `room/${roomToJoin}/users`,
                      JSON.stringify([]),
                    )
                    return
                  default:
                    const res = await redis.get(`room/${roomToJoin}/users`)
                    const users = JSON.parse(res)
                    const dataWithTime = {...data, timestamp: Date.now()}
                    if (users.find((user: string) => user === data.id)) {
                      const length =
                        JSON.parse(
                          await redis.get(
                            `room/${roomToJoin}/user/${data.id}/length`,
                          ),
                        ) + 1
                      await redis
                        .pipeline([
                          [
                            'set',
                            `room/${roomToJoin}/user/${data.id}/length`,
                            JSON.stringify(length),
                          ],
                          [
                            'set',
                            `room/${roomToJoin}/user/${data.id}/${length}`,
                            JSON.stringify(dataWithTime),
                          ],
                        ])
                        .exec()
                    } else {
                      const length = 0
                      await redis
                        .pipeline([
                          [
                            'set',
                            `room/${roomToJoin}/users`,
                            JSON.stringify(users.concat([data.id])),
                          ],
                          [
                            'set',
                            `room/${roomToJoin}/user/${data.id}/length`,
                            JSON.stringify(0),
                          ],
                          [
                            'set',
                            `room/${roomToJoin}/user/${data.id}/${length}`,
                            JSON.stringify(dataWithTime),
                          ],
                        ])
                        .exec()
                    }
                }
              } catch (err) {
                console.log(err)
              }
            })
          }
        } catch (err) {
          console.log(err)
        }
        try {
          const users = JSON.parse(await redis.get(`room/${roomToJoin}/users`))
          let history: Operation[] = []
          for (const user of users) {
            const userLength = JSON.parse(
              await redis.get(`room/${roomToJoin}/user/${user}/length`),
            )
            const userHistoryRaw = await redis
              .pipeline(
                Array.from({length: userLength + 1}, (v, i) => {
                  return ['get', `room/${roomToJoin}/user/${user}/${i}`]
                }),
              )
              .exec()
            const userHistory = userHistoryRaw.map((result: any) =>
              JSON.parse(result[1]),
            )
            history = history.concat(userHistory)
          }
          console.log(
            `dispatching history for ${socket.id}, total: ${history.length}`,
          )
          const historyAscending = history.sort((a, b) =>
            a.timestamp > b.timestamp ? 1 : -1,
          )
          socket.emit('dispatch_history', historyAscending)
        } catch (err) {
          console.log(err)
        }
      })
    })
  }
}

new MySCWorker()
