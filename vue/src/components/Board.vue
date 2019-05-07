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
import {Line, Circle} from '@/interfaces'

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
      color: 'blue',
      rubberRadius: 100,
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
              p.line(p.mouseX, p.mouseY, p.pmouseX, p.pmouseY)
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
              applyPencil(p, {lines: [line], color: this.color})
              lines.push(line)
            } else if (lines.length > 0) {
              this.socket.emit('draw', {
                room: this.room,
                id: this.id,
                lines,
                color: this.color,
                mode: this.mode,
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
