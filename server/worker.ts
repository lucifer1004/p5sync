import cors from 'cors'
import APM from 'elastic-apm-node'
import express from 'express'
import Redis from 'ioredis'
import morgan from 'morgan'
import path from 'path'
import healthChecker from 'sc-framework-health-check'
import serveStatic from 'serve-static'
import SCWorker from 'socketcluster/scworker'
import {SCServerSocket} from 'socketcluster-server'

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
  color?: string
  lines?: Line[]
  circles?: Circle[]
}

interface HistoryRequest {
  room?: string
}

class MySCWorker extends SCWorker {
  run() {
    console.log('   >> Worker PID:', process.pid)
    const environment = this.options.environment

    const apm = APM.start()
    const app = express()
    const corsOptions = {
      origin: ['*'],
      credentials: true,
      optionsSuccessStatus: 200, // some legacy browsers (IE11, constious SmartTVs) choke on 204
    }
    app.use(cors(corsOptions))

    const httpServer = this.httpServer
    const scServer = this.scServer
    const redis = new Redis({
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      host: process.env.REDIS_HOST || '127.0.0.1',
    })

    if (environment === 'dev') {
      // Log every HTTP request. See https://github.com/expressjs/morgan for other
      // available formats.
      app.use(morgan('dev'))
    }
    app.use(serveStatic(path.resolve(__dirname, 'public')))

    // Add GET /health-check express route
    healthChecker.attach(this, app)

    httpServer.on('request', app)

    scServer.on('connection', (socket: SCServerSocket) => {
      console.log(`${socket.id} connected to ${process.pid}`)
      socket.on('draw', async (op: Operation) => {
        try {
          const room = op.room || 'default'
          const roomKey = `rooms/${room}`
          const stringifiedData = JSON.stringify(op)
          const trans = apm.startTransaction(`PUBLISH_DRAWING:${room}`)
          if (stringifiedData.match('null')) return
          scServer.exchange.publish(roomKey, op)

          switch (op.mode) {
            // Handle clear
            case 'clear':
              await redis.del(roomKey)
              return

            // Handle other operations
            default:
              await redis.rpush(roomKey, JSON.stringify(op))
          }
          trans.result = `Drawing successfully published to ${room} and saved to Redis`
          trans.end()
        } catch (err) {
          apm.captureError(err)
        }
      })

      socket.on('request_history', async (req: HistoryRequest) => {
        try {
          const room = req.room || 'default'
          const roomKey = `rooms/${room}`
          const trans = apm.startTransaction(`DISPATH_HISTORY:${room}`)

          // Create a new room if room does not exist
          if ((await redis.sismember('rooms', room)) === 0) {
            await redis.sadd('rooms', [room])
          }

          const rawHistory = await redis.lrange(roomKey, 0, -1)
          const history = rawHistory.map((rawOperation: string) =>
            JSON.parse(rawOperation),
          )

          console.log(
            `dispatching history for ${socket.id}, total: ${history.length}`,
          )

          socket.emit('dispatch_history', history)

          trans.result = `History successfully dispatched to ${socket.id}`
          trans.end()
        } catch (err) {
          apm.captureError(err)
        }
      })
    })

    // scServer.on('disconnection', (socket: SCServerSocket) => {
    //   trans.end()
    // })
  }
}

new MySCWorker()
