import type { Rectangle } from "electron";

import type { AppOverlayPosition } from "../../shared/types/app-settings";

type OverlayBoundsInput = {
  workArea: Rectangle;
  overlayWidth: number;
  overlayHeight: number;
  margin: number;
  position: AppOverlayPosition;
};

export function resolveOverlayBounds(input: OverlayBoundsInput) {
  const {
    workArea,
    overlayWidth,
    overlayHeight,
    margin,
    position,
  } = input;

  const left = workArea.x + margin;
  const centerX = workArea.x + Math.round((workArea.width - overlayWidth) / 2);
  const right = workArea.x + workArea.width - overlayWidth - margin;

  const top = workArea.y + margin;
  const centerY = workArea.y + Math.round((workArea.height - overlayHeight) / 2);
  const bottom = workArea.y + workArea.height - overlayHeight - margin;

  const horizontalMap = {
    "top-left": left,
    left,
    "bottom-left": left,
    "top-center": centerX,
    center: centerX,
    "bottom-center": centerX,
    "top-right": right,
    right,
    "bottom-right": right,
  } satisfies Record<AppOverlayPosition, number>;

  const verticalMap = {
    "top-left": top,
    "top-center": top,
    "top-right": top,
    left: centerY,
    center: centerY,
    right: centerY,
    "bottom-left": bottom,
    "bottom-center": bottom,
    "bottom-right": bottom,
  } satisfies Record<AppOverlayPosition, number>;

  const resolvedX = horizontalMap[position];
  const resolvedY = verticalMap[position];

  return {
    x: Math.max(
      workArea.x,
      Math.min(resolvedX, workArea.x + workArea.width - overlayWidth),
    ),
    y: Math.max(
      workArea.y,
      Math.min(resolvedY, workArea.y + workArea.height - overlayHeight),
    ),
  };
}
