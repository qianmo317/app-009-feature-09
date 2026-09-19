import type { Chart } from '../types';

export function drawChartToCanvas(
  chart: Chart,
  canvas: HTMLCanvasElement,
  options?: {
    showGrid?: boolean;
    cellSize?: number;
    startRow?: number;
    endRow?: number;
    // 画布总行数（末页不足时补满，多出行只画底色与网格）
    totalRows?: number;
    thinLineWidth?: number;
    boldLineWidth?: number;
  }
) {
  const { cols, rows, palette, cells } = chart;
  const cellSize = options?.cellSize ?? 20;
  const showGrid = options?.showGrid ?? true;
  const startRow = options?.startRow ?? 0;
  const endRow = options?.endRow ?? rows;
  const visibleRows = endRow - startRow;
  // 末页不满也画满一页：画布按 totalRows 个格子出高，越界行留空
  const totalRows = options?.totalRows ?? visibleRows;
  const thinLineWidth = options?.thinLineWidth ?? 0.5;
  const boldLineWidth = options?.boldLineWidth ?? 1;

  canvas.width = Math.round(cols * cellSize);
  canvas.height = Math.round(totalRows * cellSize);
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#faf8f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Cells（末页补出的空行不涂色）
  for (let r = startRow; r < endRow; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = cells[r * cols + c];
      const color = palette[idx]?.hex ?? '#ffffff';
      ctx.fillStyle = color;
      ctx.fillRect(c * cellSize, (r - startRow) * cellSize, cellSize, cellSize);
    }
  }

  // Grid
  if (showGrid) {
    ctx.strokeStyle = '#e0dcd5';
    ctx.lineWidth = thinLineWidth;
    for (let r = 0; r <= totalRows; r++) {
      const y = r * cellSize;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      const x = c * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Bold lines every 10，按整图绝对行号对齐，保证翻页后粗线仍然连续
    ctx.strokeStyle = '#c0bab0';
    ctx.lineWidth = boldLineWidth;
    for (let r = 0; r <= totalRows; r++) {
      const absRow = startRow + r;
      if (absRow % 10 !== 0) continue;
      const y = r * cellSize;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c += 10) {
      const x = c * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
  }
}

export function exportChartPNG(chart: Chart, scale = 8): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawChartToCanvas(chart, canvas, { showGrid: true, cellSize: 20 * scale });
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}
