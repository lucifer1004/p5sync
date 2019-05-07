import React, {useEffect, useRef, useState} from 'react'
import socketCluster, {SCClientSocket} from 'socketcluster-client'
import p5 from 'p5'
import 'p5/lib/addons/p5.dom'
import {Point, Line, Circle} from './interfaces'
import {SCChannel} from 'sc-channel'

interface AppProps {
  room?: string
}

// Tool functions
const applyPencil = (p: p5, data: any) => {
  data.color && p.stroke(data.color)
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
}

const applyClear = (p: p5) => {
  p.clear()
}

const App = ({room = 'default'}: AppProps) => {
  // States
  const [id] = useState(
    Math.random()
      .toString(16)
      .substr(2, 8),
  )

  // Refs
  const boardExistRef = useRef<boolean>(false)
  const modeRef = useRef<string>('pencil')
  const color = useRef<string>('blue')
  const rubberRadius = useRef<number>(100)
  const channelRef = useRef<SCChannel | null>(null)
  const socketRef = useRef<SCClientSocket | null>(null)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const pRef = useRef<any>(null)

  // Sketch function for p5
  const sketch = (p: p5) => {
    let lines: Line[] = []
    let circles: Circle[] = []

    p.setup = () => {
      pRef.current = p
      p.createCanvas(1280, 720)
      p.stroke(color.current)
      p.strokeWeight(2)
      p.frameRate(60)
      p.noFill()
      channelRef.current &&
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

      socketRef.current &&
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

      socketRef.current && socketRef.current.emit('request_history', {room})
    }

    p.draw = () => {
      switch (modeRef.current) {
        case 'pencil':
          if (p.mouseIsPressed === true) {
            if (
              !Point.validate(new Point(p.mouseX, p.mouseY)) ||
              !Point.validate(new Point(p.pmouseX, p.pmouseY))
            )
              return
            const line = {
              end: {
                x: p.mouseX,
                y: p.mouseY,
              },
              start: {
                x: p.pmouseX,
                y: p.pmouseY,
              },
            }
            applyPencil(p, {lines: [line], color: color.current})
            lines.push(line)
          } else if (lines.length > 0) {
            socketRef.current &&
              socketRef.current.emit('draw', {
                room,
                id,
                lines,
                color: color.current,
                mode: modeRef.current,
              })
            lines = []
          }
          return
        case 'rubber':
          if (p.mouseIsPressed === true) {
            const circle = {
              center: {
                x: p.mouseX,
                y: p.mouseY,
              },
              radius: rubberRadius.current,
            }
            applyRubber(p, {circles: [circle]})
            circles.push(circle)
          } else if (circles.length > 0) {
            socketRef.current &&
              socketRef.current.emit('draw', {
                room,
                id,
                circles,
                mode: modeRef.current,
              })
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
    socket.on('connect', () => {
      if (!boardExistRef.current) {
        const channel = socket.subscribe(`rooms/${room}`)
        channelRef.current = channel
        if (nodeRef.current) new p5(sketch, nodeRef.current)
        console.log('connected to server')
        boardExistRef.current = true
      } else {
        console.log('reconnected to server')
        socket.emit('request_history', {room})
      }
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
          color.current = `#${Math.random()
            .toString(16)
            .substr(2, 6)}`
        }}
      >
        Pencil
      </button>
      <button
        onClick={() => {
          applyClear(pRef.current)
          socketRef.current &&
            socketRef.current.emit('draw', {room, id, mode: 'clear'})
        }}
      >
        Clear
      </button>
      <div ref={nodeRef} />
    </div>
  )
}

export default App
