import type { RefObject } from "react";

// Mutable state keeps pointer and scroll input out of React's render cycle.
export type SceneMotion = {
  time: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  hover: number;
  targetHover: number;
  scroll: number;
  targetScroll: number;
  press: number;
  pressX: number;
  pressY: number;
};
export type MotionRef = RefObject<SceneMotion>;
