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
  room?: string
  id: string
  mode: 'clear' | 'pencil' | 'rubber'
  lines?: Line[]
  circles?: Circle[]
}

class MySCWorker extends SCWorker {
  run() {
    console.log('   >> Worker PID:', process.pid)
    const environment = this.options.environment

    const app = express()
    const corsOptions = {
      origin: ['http://localhost:*'],
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

    scServer.on('connection', (socket: any) => {
      console.log(`${socket.id} connected to ${process.pid}`)
      socket.on('draw', async (data: Operation) => {
        try {
          const room = data.room || 'default'
          const roomKey = `rooms/${room}`
          scServer.exchange.publish(roomKey, data)

          switch (data.mode) {
            // Handle clear
            case 'clear':
              await redis.del(roomKey)
              return

            // Handle other operations
            default:
              await redis.rpush(roomKey, JSON.stringify(data))
          }
        } catch (err) {
          console.log(err)
        }
      })

      socket.on('request_history', async (data: any) => {
        try {
          const room = data.room || 'default'
          const roomKey = `rooms/${room}`

          // Create a new room if room does not exist
          if ((await redis.sismember('rooms', room)) === 0) {
            await redis.sadd(room)
          }

          const rawHistory = await redis.lrange(roomKey, 0, -1)
          const history = rawHistory.map((rawOperation: string) =>
            JSON.parse(rawOperation),
          )

          console.log(
            `dispatching history for ${socket.id}, total: ${history.length}`,
          )

          socket.emit('dispatch_history', history)
        } catch (err) {
          console.log(err)
        }
      })
    })
  }
}

new MySCWorker()
