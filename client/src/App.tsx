import React, {useEffect, useRef, useState} from 'react'
import socketCluster from 'socketcluster-client'
import p5 from 'p5'
import 'p5/lib/addons/p5.dom'

const App: React.FC = () => {
  const [boardExist, setBoardExist] = useState(false)
  const [id] = useState(
    Math.random()
      .toString(16)
      .substr(2, 8),
  )
  const chatRef = useRef<any>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const sketch = (width: number) => (p: p5) => {
    let lines: Array<Object> = []

    p.setup = () => {
      const canvas = p.createCanvas(width, 400)
      canvas.position(0, 0)
      p.stroke(0)
      p.strokeWeight(2)
      p.frameRate(60)
      p.noFill()
      p.rect(0, 0, width, 400)
      chatRef.current.watch((data: any) => {
        if (data.id !== id) {
          p.stroke('red')
          data.lines.forEach((line: any) =>
            p.line(line.mouseX, line.mouseY, line.pmouseX, line.pmouseY),
          )
          p.stroke(0)
        }
      })
    }

    p.draw = () => {
      if (p.mouseIsPressed === true) {
        p.line(p.mouseX, p.mouseY, p.pmouseX, p.pmouseY)
        lines.push({
          mouseX: p.mouseX,
          mouseY: p.mouseY,
          pmouseX: p.pmouseX,
          pmouseY: p.pmouseY,
        })
      } else if (lines.length > 0) {
        chatRef.current.publish({id, lines})
        lines = []
      }
    }
  }

  useEffect(() => {
    const socket = socketCluster.create({port: 8000})
    const channel = socket.subscribe('p5')
    chatRef.current = channel
    socket.on('connect', () => {
      if (!boardExist) {
        if (nodeRef.current) new p5(sketch(600), nodeRef.current)
        console.log('connected to server')
        setBoardExist(true)
      } else console.log('reconnected to server')
    })
  }, [])

  return (
    <div className="App">
      <h1>Sync Board</h1>
      <div ref={nodeRef}>Some text</div>
    </div>
  )
}

export default App
