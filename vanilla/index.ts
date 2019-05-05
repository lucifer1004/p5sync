import p5 from 'p5'
import 'p5/lib/addons/p5.dom'
import socketCluster from 'socketcluster-client'
import {Line, Circle} from './interfaces'

const applyPencil = (p: p5, data: any) => {
  data.lines.forEach((line: Line) =>
    p.line(line.start.x, line.start.y, line.end.x, line.end.y),
  )
}

const applyRubber = (p: p5, data: any) => {
  p.fill(255)
  p.strokeWeight(0)
  data.circles.forEach((circle: Circle) => {
    p.circle(circle.center.x, circle.center.y, circle.radius)
  })
  p.noFill()
  p.strokeWeight(2)
  p.rect(0, 0, 1280, 720)
}

const applyClear = (p: p5) => {
  p.clear()
  p.rect(0, 0, 1280, 720)
}

const sketch = (id: string, channel: any, socket: any) => (p: p5) => {
  let lines: Line[] = []
  let circles: Circle[] = []

  p.setup = () => {
    pRef.current = p
    p.createCanvas(1280, 720)
    p.stroke(0)
    p.strokeWeight(2)
    p.frameRate(60)
    p.noFill()
    p.rect(0, 0, 1280, 720)
    channel.watch((data: any) => {
      if (data.id === id) return
      switch (data.mode) {
        case 'pencil':
          applyPencil(p, data)
          return
        case 'rubber':
          applyRubber(p, data)
          return
        case 'clear':
          applyClear(p)
          return
        default:
          return
      }
    })

    socket.on('dispatch_history', (data: any) => {
      data.forEach((op: any) => {
        switch (op.mode) {
          case 'pencil':
            applyPencil(p, op)
            return
          case 'rubber':
            applyRubber(p, op)
            return
          default:
            return
        }
      })
    })

    socket.emit('request_history', {room})
  }

  p.draw = () => {
    switch (mode) {
      case 'pencil':
        if (p.mouseIsPressed === true) {
          p.line(p.mouseX, p.mouseY, p.pmouseX, p.pmouseY)
          lines.push({
            end: {
              x: p.mouseX,
              y: p.mouseY,
            },
            start: {
              x: p.pmouseX,
              y: p.pmouseY,
            },
          })
        } else if (lines.length > 0) {
          socket.emit('draw', {room, id, lines, mode})
          lines = []
        }
        return
      case 'rubber':
        if (p.mouseIsPressed === true) {
          p.fill(255)
          p.strokeWeight(0)
          p.circle(p.mouseX, p.mouseY, 100)
          p.noFill()
          p.strokeWeight(2)
          p.rect(0, 0, 1280, 720)
          circles.push({
            center: {
              x: p.mouseX,
              y: p.mouseY,
            },
            radius: 100,
          })
        } else if (circles.length > 0) {
          socket.emit('draw', {room, id, circles, mode})
          circles = []
        }
        return
      default:
        return
    }
  }
}

let boardExist = false
const node = document.getElementById('board')
const room = 'default'
const socket = socketCluster.create({port: 8000})
const channel = socket.subscribe(`rooms/${room}`)
const id = Math.random()
  .toString(16)
  .substr(2, 8)
let mode = 'pencil'
const pRef = {current: null}

const pencil = document.getElementById('pencil')
pencil.onclick = () => {
  mode = 'pencil'
}
const rubber = document.getElementById('rubber')
rubber.onclick = () => {
  mode = 'rubber'
}
const clear = document.getElementById('clear')
clear.onclick = () => {
  applyClear(pRef.current)
  socket.emit('draw', {room, id, mode: 'clear'})
}

socket.on('connect', () => {
  if (!boardExist) {
    new p5(sketch(id, channel, socket), node)
    console.log('connected to server')
    boardExist = true
  } else {
    console.log('reconnected to server')
    socket.emit('request_history', {room})
  }
})
