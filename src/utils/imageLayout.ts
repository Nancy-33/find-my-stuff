/**
 * Calculate the actual display rectangle of an image when using resizeMode="contain".
 * Returns offsets and scale for mapping between screen coordinates and image ratios.
 */
export interface ImageDisplayRect {
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
  scale: number;
}

export function getImageDisplayRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): ImageDisplayRect {
  if (containerWidth === 0 || containerHeight === 0 || imageWidth === 0 || imageHeight === 0) {
    return { offsetX: 0, offsetY: 0, displayWidth: containerWidth, displayHeight: containerHeight, scale: 1 };
  }

  const containerRatio = containerWidth / containerHeight;
  const imageRatio = imageWidth / imageHeight;

  let displayWidth: number;
  let displayHeight: number;

  if (imageRatio > containerRatio) {
    // Image is wider → constrained by container width
    displayWidth = containerWidth;
    displayHeight = containerWidth / imageRatio;
  } else {
    // Image is taller → constrained by container height
    displayHeight = containerHeight;
    displayWidth = containerHeight * imageRatio;
  }

  const offsetX = (containerWidth - displayWidth) / 2;
  const offsetY = (containerHeight - displayHeight) / 2;
  const scale = displayWidth / imageWidth;

  return { offsetX, offsetY, displayWidth, displayHeight, scale };
}

/**
 * Convert screen touch coordinates to image ratio (0-1).
 */
export function screenToImageRatio(
  touchX: number,
  touchY: number,
  rect: ImageDisplayRect
): { x: number; y: number } {
  const x = (touchX - rect.offsetX) / rect.displayWidth;
  const y = (touchY - rect.offsetY) / rect.displayHeight;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}

/**
 * Convert image ratio back to screen coordinates for rendering.
 */
export function imageRatioToScreen(
  ratioX: number,
  ratioY: number,
  rect: ImageDisplayRect
): { cx: number; cy: number; r: number } {
  const cx = ratioX * rect.displayWidth + rect.offsetX;
  const cy = ratioY * rect.displayHeight + rect.offsetY;
  return { cx, cy, r: 0 };
}

/**
 * Convert radius from ratio space to screen pixels.
 */
export function radiusToScreen(radiusRatio: number, rect: ImageDisplayRect): number {
  return radiusRatio * Math.min(rect.displayWidth, rect.displayHeight);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
