import p5 from 'p5'
import 'p5/lib/addons/p5.dom'
import socketCluster from 'socketcluster-client'
import {Point, Line, Circle} from './interfaces'

const node = document.getElementById('board')
const room = 'default'
const socket = socketCluster.create({port: 8000})
const channel = socket.subscribe(`rooms/${room}`)
const id = Math.random()
  .toString(16)
  .substr(2, 8)
const pRef = {current: null}
let boardExist = false
let mode = 'pencil'
let color = 'blue'
let rubberRadius = 50

const dist = (a: Point, b: Point): number => {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

const calculateControlPoint = (a: Point, b: Point, k: number) => {
  return {
    x: a.x + k * (b.x - a.x),
    y: a.y + k * (b.y - a.y),
  }
}

const applyPencil = (p: p5, data: any) => {
  if (data.lines.length === 0) return
  data.color && p.stroke(data.color)
  if (data.lines.length === 1) {
    const line = data.lines[0]
    p.line(line.start.x, line.start.y, line.end.x, line.end.y)
  } else {
    const k = 0.3
    let a = data.lines[0].start
    let b = data.lines[0].end
    let a1 = calculateControlPoint(a, b, 1 - k)
    let b1, b2
    p.line(a.x, a.y, a1.x, a1.y)
    for (let i = 1; i < data.lines.length; i++) {
      let c = data.lines[i].end
      b1 = calculateControlPoint(b, c, k)
      b2 = calculateControlPoint(b, c, 1 - k)
      p.bezier(a1.x, a1.y, b.x, b.y, b.x, b.y, b1.x, b1.y)
      p.line(b1.x, b1.y, b2.x, b2.y)
      a = b
      b = c
      a1 = b2
    }
  }
  p.stroke(color)
}

const applyRubber = (p: p5, data: any) => {
  data.circles.forEach((circle: Circle) => {
    ;(p as any).drawingContext.clearRect(
      circle.center.x - circle.radius / 2,
      circle.center.y - circle.radius / 2,
      circle.radius,
      circle.radius,
    )
  })
}

const applyClear = (p: p5) => {
  p.clear()
}

const sketch = (id: string, channel: any, socket: any) => (p: p5) => {
  let lines: Line[] = []
  let circles: Circle[] = []
  let lastX, lastY: number
  let isDrawing: boolean = false

  p.setup = () => {
    pRef.current = p
    p.createCanvas(1280, 720)
    p.stroke(color)
    p.strokeWeight(2)
    p.frameRate(60)
    p.noFill()
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
          if (!isDrawing) {
            isDrawing = true
            lastX = p.mouseX
            lastY = p.mouseY
          }
          if (dist({x: lastX, y: lastY}, {x: p.mouseX, y: p.mouseY}) > 4) {
            applyPencil(p, {lines, color: '#FFFFFF'})
            const line = {
              end: {
                x: p.mouseX,
                y: p.mouseY,
              },
              start: {
                x: lastX,
                y: lastY,
              },
            }
            lastX = p.mouseX
            lastY = p.mouseY
            // applyPencil(p, {lines: [line], color})
            lines.push(line)
            applyPencil(p, {lines, color})
          }
        } else {
          isDrawing = false
          if (lines.length > 0) {
            socket.emit('draw', {room, id, lines, color, mode})
            lines = []
          }
        }
        return
      case 'rubber':
        if (p.mouseIsPressed === true) {
          const circle = {
            center: {
              x: p.mouseX,
              y: p.mouseY,
            },
            radius: rubberRadius,
          }
          applyRubber(p, {circles: [circle]})
          circles.push(circle)
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

const pencil = document.getElementById('pencil')
pencil.onclick = () => {
  mode = 'pencil'
  color = `#${Math.random()
    .toString(16)
    .substr(2, 6)}`
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
