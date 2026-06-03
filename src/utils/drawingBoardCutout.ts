export interface CutoutPoint {
  x: number;
  y: number;
}

export interface CutoutImageBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

const EPSILON = 1e-6;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function distanceBetween(a: CutoutPoint, b: CutoutPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function closeCutoutPath(points: CutoutPoint[]): CutoutPoint[] {
  const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (clean.length < 3) return clean;
  const first = clean[0];
  const last = clean[clean.length - 1];
  if (distanceBetween(first, last) <= EPSILON) return clean;
  return [...clean, { ...first }];
}

function perpendicularDistance(point: CutoutPoint, start: CutoutPoint, end: CutoutPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) <= EPSILON && Math.abs(dy) <= EPSILON) return distanceBetween(point, start);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.hypot(dx, dy);
}

function simplifyOpenPath(points: CutoutPoint[], tolerance: number): CutoutPoint[] {
  if (points.length <= 2) return points;
  let maxDistance = -1;
  let index = -1;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance <= tolerance || index < 0) return [start, end];
  const left = simplifyOpenPath(points.slice(0, index + 1), tolerance);
  const right = simplifyOpenPath(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

export function simplifyCutoutPath(points: CutoutPoint[], tolerance = 1): CutoutPoint[] {
  const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (clean.length <= 2 || tolerance <= 0) return clean;
  const closed = distanceBetween(clean[0], clean[clean.length - 1]) <= EPSILON;
  if (!closed) return simplifyOpenPath(clean, tolerance);
  const body = clean.slice(0, -1);
  if (body.length <= 2) return clean;
  const simplified = simplifyOpenPath(body, tolerance);
  return closeCutoutPath(simplified);
}

export function polygonArea(points: CutoutPoint[]): number {
  const clean = closeCutoutPath(points);
  if (clean.length < 4) return 0;
  let sum = 0;
  for (let i = 0; i < clean.length - 1; i += 1) {
    const a = clean[i];
    const b = clean[i + 1];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

export function isValidCutoutPath(points: CutoutPoint[], minArea = 16): boolean {
  const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (clean.length < 3) return false;
  return polygonArea(clean) >= minArea;
}

function imageCenter(box: CutoutImageBox): CutoutPoint {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function rotatePoint(point: CutoutPoint, center: CutoutPoint, degrees: number): CutoutPoint {
  if (!degrees) return point;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function boardPointToImageFraction(point: CutoutPoint, box: CutoutImageBox): CutoutPoint {
  const center = imageCenter(box);
  const local = rotatePoint(point, center, -(box.rotation || 0));
  return {
    x: clamp01((local.x - box.x) / Math.max(1, box.w)),
    y: clamp01((local.y - box.y) / Math.max(1, box.h)),
  };
}

export function imageFractionToBoardPoint(point: CutoutPoint, box: CutoutImageBox): CutoutPoint {
  const center = imageCenter(box);
  const local = {
    x: box.x + clamp01(point.x) * box.w,
    y: box.y + clamp01(point.y) * box.h,
  };
  return rotatePoint(local, center, box.rotation || 0);
}

export function cutoutPathToSvg(points: CutoutPoint[]): string {
  const closed = closeCutoutPath(points);
  if (closed.length === 0) return '';
  return closed
    .map((p, index) => `${index === 0 ? 'M' : 'L'} ${Number(p.x.toFixed(2))} ${Number(p.y.toFixed(2))}`)
    .join(' ')
    .concat(closed.length >= 4 ? ' Z' : '');
}
