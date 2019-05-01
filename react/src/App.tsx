import React, {useEffect, useRef, useState} from 'react'
import socketCluster from 'socketcluster-client'
import p5 from 'p5'
import 'p5/lib/addons/p5.dom'

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

const App: React.FC = () => {
  const [boardExist, setBoardExist] = useState(false)
  const [id] = useState(
    Math.random()
      .toString(16)
      .substr(2, 8),
  )
  const modeRef = useRef<string>('pencil')
  const channelRef = useRef<any>(null)
  const socketRef = useRef<any>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const sketch = (p: p5) => {
    let lines: Line[] = []
    let circles: Circle[] = []

    p.setup = () => {
      p.createCanvas(1280, 720)
      p.stroke(0)
      p.strokeWeight(2)
      p.frameRate(60)
      p.noFill()
      p.rect(0, 0, 1280, 720)
      channelRef.current.watch((data: any) => {
        switch (data.mode) {
          case 'pencil':
            applyPencil(p, data)
            return
          case 'rubber':
            applyRubber(p, data)
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
    socketRef.current = socket
    const channel = socket.subscribe('p5')
    channelRef.current = channel
    socket.on('connect', () => {
      if (!boardExist) {
        if (nodeRef.current) new p5(sketch, nodeRef.current)
        console.log('connected to server')
        setBoardExist(true)
      } else console.log('reconnected to server')

      socket.emit('request_history')
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
      <div ref={nodeRef} />
    </div>
  )
}

export default App
