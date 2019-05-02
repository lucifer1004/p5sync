import cors from 'cors'
import express from 'express'
import Redis from 'ioredis'
import morgan from 'morgan'
import path from 'path'
import healthChecker from 'sc-framework-health-check'
import serveStatic from 'serve-static'
import SCWorker from 'socketcluster/scworker'

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

    redis.set('history_length', JSON.stringify(0))

    const channel = scServer.exchange.subscribe('p5')
    channel.watch((data: any) => {
      switch (data.mode) {
        case 'clear':
          redis.set('history_length', JSON.stringify(0))
          return
        default:
          redis.get('history_length', (err, res) => {
            if (err) throw err
            const history_length = JSON.parse(res)
            redis.set(`history_${history_length}`, JSON.stringify(data))
            redis.set('history_length', JSON.stringify(history_length + 1))
          })
      }
    })

    scServer.on('connection', (socket: any) => {
      socket.on('request_history', () => {
        redis.get('history_length', (err, res) => {
          if (err) throw err
          const history_length = JSON.parse(res)
          redis
            .pipeline(
              Array.from({length: history_length}, (v, i) => {
                return ['get', `history_${i}`]
              }),
            )
            .exec((err, results) => {
              const history = results.map((result: any) =>
                JSON.parse(result[1]),
              )
              console.log(
                `dispatching history for ${socket.id}, total: ${
                  history.length
                }`,
              )
              socket.emit('dispatch_history', history)
            })
        })
      })
    })
  }
}

new MySCWorker()
