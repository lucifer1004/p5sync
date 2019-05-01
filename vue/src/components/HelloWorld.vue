<template>
  <div class="hello">
    <h1>Sync Board</h1>
    <button @click="usePencil">Pencil</button>
    <button @click="useRubber">Rubber</button>
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

export default Vue.extend({
  name: 'HelloWorld',
  data() {
    return {
      id: Math.random()
        .toString(16)
        .substr(2, 8),
      boardExist: false,
      mode: 'pencil',
      socket: null,
      channel: null,
    }
  },
  methods: {
    usePencil() {
      this.mode = 'pencil'
    },
    useRubber() {
      this.mode = 'rubber'
    },
    sketch(id: string, channel: any, socket: any) {
      const that = this
      return function(p: p5) {
        let lines: Line[] = []
        let circles: Circle[] = []

        p.setup = () => {
          p.createCanvas(1280, 720)
          p.stroke(0)
          p.strokeWeight(2)
          p.frameRate(60)
          p.noFill()
          p.rect(0, 0, 1280, 720)
          channel.watch((data: any) => {
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
        }

        p.draw = () => {
          switch (that.mode) {
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
                channel.publish({id, lines, mode: that.mode})
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
                channel.publish({id, circles, mode: that.mode})
                circles = []
              }
              return
            default:
              return
          }
        }
      }
    },
  },
  mounted() {
    console.log('mounted')
    this.socket = socketCluster.create({port: 8000})
    this.channel = this.socket.subscribe('p5')
    this.socket.on('connect', () => {
      if (!this.boardExist) {
        new p5(
          this.sketch(this.id, this.channel, this.socket),
          this.$refs.board,
        )
        console.log('connected to server')
        this.boardExist = true
      } else console.log('reconnected to server')

      this.socket.emit('request_history')

      console.log(this.socket)
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
