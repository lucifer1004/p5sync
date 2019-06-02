<template>
  <div class="hello">
    <h1>Sync Board</h1>
    <button @click="usePencil">Pencil</button>
    <button @click="useRubber">Rubber</button>
    <button @click="useClear">Clear</button>
    <div ref="board"></div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import p5 from 'p5'
import 'p5/lib/addons/p5.dom'
import socketCluster from 'socketcluster-client'
import {Point, Line, Circle} from '@/interfaces'

const dist = (a: Point, b: Point): number => {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

const calculateControlPoint = (a: Point, b: Point, k: number) => {
  return {
    x: a.x + k * (b.x - a.x),
    y: a.y + k * (b.y - a.y),
  }
}

const applyPencil = (p: p5, data: any, originalColor?: any) => {
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
  originalColor && p.stroke(originalColor)
}

const applyRubber = (p: p5, data: any) => {
  data.circles.forEach((circle: Circle) => {
    (p as any).drawingContext.clearRect(circle.center.x - circle.radius / 2, circle.center.y - circle.radius / 2, circle.radius, circle.radius)
  })
}

const applyClear = (p: p5) => {
  p.clear()
}

export default Vue.extend({
  name: 'Board',
  props: {
    room: {
      type: String,
      default: 'default',
    },
  },
  data() {
    return {
      id: Math.random()
        .toString(16)
        .substr(2, 8),
      boardExist: false,
      isDrawing: false,
      lastX: 0,
      lastY: 0,
      color: 'blue',
      rubberRadius: 50,
      mode: 'pencil',
      socket: null,
      channel: null,
      p: null,
    }
  },
  methods: {
    usePencil() {
      this.mode = 'pencil'
      this.color = `#${Math.random()
        .toString(16)
        .substr(2, 6)}`
    },
    useRubber() {
      this.mode = 'rubber'
    },
    useClear() {
      applyClear(this.p)
      this.socket.emit('draw', {room: this.room, id: this.id, mode: 'clear'})
    },
    sketch(p: p5) {
      let lines: Line[] = []
      let circles: Circle[] = []

      p.setup = () => {
        this.p = p
        p.createCanvas(1280, 720)
        p.stroke(0)
        p.strokeWeight(2)
        p.frameRate(60)
        p.noFill()
        this.channel.watch((data: any) => {
          if (data.id === this.id) return
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

        this.socket.on('dispatch_history', (data: any) => {
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

        this.socket.emit('request_history', {room: this.room})
      }

      p.draw = () => {
        switch (this.mode) {
          case 'pencil':
            if (p.mouseIsPressed === true) {
              if (!this.isDrawing) {
                this.isDrawing = true
                this.lastX = p.mouseX
                this.lastY = p.mouseY
              }
              if (dist({x: this.lastX, y: this.lastY}, {x: p.mouseX, y: p.mouseY}) > 4) {
                applyPencil(p, {lines, color: '#FFFFFF'}, this.color)
                const line = {
                  end: {
                    x: p.mouseX,
                    y: p.mouseY,
                  },
                  start: {
                    x: this.lastX,
                    y: this.lastY,
                  },
                }
                this.lastX = p.mouseX
                this.lastY = p.mouseY
                // applyPencil(p, {lines: [line], color})
                lines.push(line)
                applyPencil(p, {lines, color: this.color})
              }
            } else {
              this.isDrawing = false
              if (lines.length > 0) {
                this.socket.emit('draw', {room: this.room, id: this.id, lines, color: this.color, mode: this.mode})
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
                radius: this.rubberRadius,
              }
              applyRubber(p, {circles: [circle]})
              circles.push(circle)
            } else if (circles.length > 0) {
              this.socket.emit('draw', {
                room: this.room,
                id: this.id,
                circles,
                mode: this.mode,
              })
              circles = []
            }
            return
          default:
            return
        }
      }
    },
  },
  mounted() {
    this.socket = socketCluster.create({port: 8000})
    this.channel = this.socket.subscribe(`rooms/${this.room}`)
    this.socket.on('connect', () => {
      if (!this.boardExist) {
        new p5(this.sketch, this.$refs.board)
        console.log('connected to server')
        this.boardExist = true
      } else {
        console.log('reconnected to server')
        this.socket.emit('request_history', {room: this.room})
      }
    })
  },
})
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="stylus">
h3
  margin 40px 0 0

ul
  list-style-type none
  padding 0

li
  display inline-block
  margin 0 10px

a
  color #42b983
</style>
