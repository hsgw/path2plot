import type { Point } from '../types/geometry'

export type PathCommand =
  | { type: 'M'; point: Point }
  | { type: 'L'; point: Point }
  | { type: 'C'; c1: Point; c2: Point; point: Point }
  | { type: 'Z' }
