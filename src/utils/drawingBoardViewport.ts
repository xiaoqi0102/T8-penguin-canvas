export interface BoardViewportInput {
  boardW: number;
  boardH: number;
  maxW: number;
  maxH: number;
}

export interface BoardViewport {
  w: number;
  h: number;
  scale: number;
}

export interface BoardClientPointInput {
  clientX: number;
  clientY: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  boardW: number;
  boardH: number;
}

export function clampBoardZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(0.15, value));
}

function safePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function scaledBoardSize(boardW: number, boardH: number, scale: number): { w: number; h: number } {
  const safeW = safePositive(boardW, 1);
  const safeH = safePositive(boardH, 1);
  const safeScale = clampBoardZoom(scale);
  return {
    w: Math.max(1, Math.round(safeW * safeScale)),
    h: Math.max(1, Math.round(safeH * safeScale)),
  };
}

export function fitBoardViewport(input: BoardViewportInput): BoardViewport {
  const boardW = safePositive(input.boardW, 1);
  const boardH = safePositive(input.boardH, 1);
  const maxW = safePositive(input.maxW, boardW);
  const maxH = safePositive(input.maxH, boardH);
  const scale = Math.min(maxW / boardW, maxH / boardH);
  const size = scaledBoardSize(boardW, boardH, scale);
  return { ...size, scale };
}

export function zoomBoardViewport(input: { boardW: number; boardH: number; zoom: number }): BoardViewport {
  const scale = clampBoardZoom(input.zoom);
  return { ...scaledBoardSize(input.boardW, input.boardH, scale), scale };
}

export function boardPointFromClientPoint(input: BoardClientPointInput): { x: number; y: number } {
  const rectWidth = safePositive(input.rectWidth, 1);
  const rectHeight = safePositive(input.rectHeight, 1);
  const boardW = safePositive(input.boardW, 1);
  const boardH = safePositive(input.boardH, 1);
  const rawX = ((input.clientX - input.rectLeft) / rectWidth) * boardW;
  const rawY = ((input.clientY - input.rectTop) / rectHeight) * boardH;
  return {
    x: Math.min(boardW, Math.max(0, rawX)),
    y: Math.min(boardH, Math.max(0, rawY)),
  };
}
