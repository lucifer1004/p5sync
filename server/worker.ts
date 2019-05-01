import cors from 'cors'
import express from 'express'
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
      origin: 'http://localhost:3000',
      credentials: true,
      optionsSuccessStatus: 200, // some legacy browsers (IE11, constious SmartTVs) choke on 204
    }
    app.use(cors(corsOptions))

    const httpServer = this.httpServer
    const scServer = this.scServer

    if (environment === 'dev') {
      // Log every HTTP request. See https://github.com/expressjs/morgan for other
      // available formats.
      app.use(morgan('dev'))
    }
    app.use(serveStatic(path.resolve(__dirname, 'public')))

    // Add GET /health-check express route
    healthChecker.attach(this, app)

    httpServer.on('request', app)

    scServer.exchange.set('history', [], err => console.log(err))

    /*
      In here we handle our incoming realtime connections and listen for events.
    */
    scServer.on('connection', (socket: any) => {
      scServer.exchange.get('history', (err, history) => {
        socket.emit('get-history', history)
      })

      const channel = scServer.exchange.subscribe('p5')
      channel.watch((data: any) => {
        scServer.exchange.get('history', (err, history) => {
          scServer.exchange.set('history', [...history, data], err => {})
        })
      })
    })
  }
}

new MySCWorker()
