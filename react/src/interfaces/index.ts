const minX = 0
const maxX = 1280
const minY = 0
const maxY = 720

export class Point {
  x: number
  y: number
  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  static validate(point: Point): boolean {
    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY)
      return false
    else return true
  }
}

export interface Circle {
  center: Point
  radius: number
}

export interface Line {
  start: Point
  end: Point
}
