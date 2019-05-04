import React, {useEffect, useRef, useState} from 'react'
import socketCluster from 'socketcluster-client'
import p5 from 'p5'
import 'p5/lib/addons/p5.dom'
import {Point, Line, Circle} from './interfaces'

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

const App: React.FC = () => {
  const [id] = useState(
    Math.random()
      .toString(16)
      .substr(2, 8),
  )
  const boardExistRef = useRef<boolean>(false)
  const modeRef = useRef<string>('pencil')
  const channelRef = useRef<any>(null)
  const socketRef = useRef<any>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const pRef = useRef<any>(null)
  const sketch = (p: p5) => {
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
      channelRef.current.watch((data: any) => {
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

      socketRef.current.on('dispatch_history', (data: any) => {
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
    }

    p.draw = () => {
      switch (modeRef.current) {
        case 'pencil':
          if (p.mouseIsPressed === true) {
            if (!Point.validate(new Point(p.mouseX, p.mouseY))) return
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
            channelRef.current.publish({id, lines, mode: modeRef.current})
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
            channelRef.current.publish({id, circles, mode: modeRef.current})
            circles = []
          }
          return
        default:
          return
      }
    }
  }

  useEffect(() => {
    const socket = socketCluster.create({port: 8000})
    const room = 'test'
    socketRef.current = socket
    socket.on('connect', () => {
      if (!boardExistRef.current) {
        const channel = socket.subscribe(`room/${room}`)
        channelRef.current = channel
        if (nodeRef.current) new p5(sketch, nodeRef.current)
        console.log('connected to server')
        boardExistRef.current = true
      } else console.log('reconnected to server')

      socket.emit('request_history', {room: room})
    })
  }, [])

  return (
    <div className="App">
      <h1>Sync Board</h1>
      <button
        onClick={() => {
          modeRef.current = 'rubber'
        }}
      >
        Rubber
      </button>
      <button
        onClick={() => {
          modeRef.current = 'pencil'
        }}
      >
        Pencil
      </button>
      <button
        onClick={() => {
          applyClear(pRef.current)
          channelRef.current.publish({id, mode: 'clear'})
        }}
      >
        Clear
      </button>
      <div ref={nodeRef} />
    </div>
  )
}

export default App
