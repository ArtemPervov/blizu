import { PhotoEffects } from "./PhotoEffects";
import type { MotionRef } from "./motion";

// A single flowing glass surface; the photo has no floating points or sprites.
export function CoastEffects({
  motion,
  reduced,
}: {
  motion: MotionRef;
  reduced: boolean;
}) {
  return (
    <PhotoEffects
      motion={motion}
      imageUrl="/images/kotor.jpg"
      reduced={reduced}
      mood="coast"
    />
  );
}
