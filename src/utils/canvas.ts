import type { Chart } from '../types';

export type DrawChartOptions = {
  showGrid?: boolean;
  cellSize?: number;
  startRow?: number;
  endRow?: number;
  /** 顶部列号边距宽度（px）；为 0 表示不画列号 */
  colGutter?: number;
  /** 左侧行号边距宽度（px）；为 0 表示不画行号 */
  rowGutter?: number;
  /** 实际绘制的总行数（含末尾补位的空行，用于让最后一页占满整页） */
  fullRowCount?: number;
};

export function drawChartToCanvas(chart: Chart, canvas: HTMLCanvasElement, options?: DrawChartOptions) {
  const { cols, rows, palette, cells } = chart;
  const cellSize = options?.cellSize ?? 20;
  const showGrid = options?.showGrid ?? true;
  const startRow = options?.startRow ?? 0;
  const endRow = options?.endRow ?? rows;
  const dataRows = endRow - startRow;
  const fullRowCount = options?.fullRowCount ?? dataRows;
  const visibleRows = Math.max(dataRows, fullRowCount);
  const colGutter = options?.colGutter ?? 0;
  const rowGutter = options?.rowGutter ?? 0;

  canvas.width = rowGutter + cols * cellSize;
  canvas.height = colGutter + visibleRows * cellSize;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#faf8f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Gutter background
  if (rowGutter > 0 || colGutter > 0) {
    ctx.fillStyle = '#f1ede6';
    ctx.fillRect(0, 0, canvas.width, colGutter);
    ctx.fillRect(0, 0, rowGutter, canvas.height);
  }

  const gridX0 = rowGutter;
  const gridY0 = colGutter;
  const gridW = cols * cellSize;
  const gridH = visibleRows * cellSize;

  // Cells
  for (let r = startRow; r < endRow; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = cells[r * cols + c];
      const color = palette[idx]?.hex ?? '#ffffff';
      ctx.fillStyle = color;
      ctx.fillRect(gridX0 + c * cellSize, gridY0 + (r - startRow) * cellSize, cellSize, cellSize);
    }
  }

  // Grid
  if (showGrid) {
    ctx.strokeStyle = '#e0dcd5';
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= visibleRows; r++) {
      const y = gridY0 + r * cellSize;
      ctx.beginPath();
      ctx.moveTo(gridX0, y);
      ctx.lineTo(gridX0 + gridW, y);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      const x = gridX0 + c * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, gridY0);
      ctx.lineTo(x, gridY0 + gridH);
      ctx.stroke();
    }

    // Bold lines every 10
    ctx.strokeStyle = '#c0bab0';
    ctx.lineWidth = 1;
    for (let r = 0; r <= visibleRows; r += 10) {
      const y = gridY0 + r * cellSize;
      ctx.beginPath();
      ctx.moveTo(gridX0, y);
      ctx.lineTo(gridX0 + gridW, y);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c += 10) {
      const x = gridX0 + c * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, gridY0);
      ctx.lineTo(x, gridY0 + gridH);
      ctx.stroke();
    }
  }

  // Row / column numbers
  if (rowGutter > 0 || colGutter > 0) {
    const fontSize = Math.max(6, Math.min(11, cellSize * 0.42));
    ctx.fillStyle = '#7a746a';
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (rowGutter > 0) {
      for (let r = 0; r < dataRows; r++) {
        const y = gridY0 + (r + 0.5) * cellSize;
        const label = String(startRow + r + 1);
        const isBoldRow = (startRow + r + 1) % 10 === 0;
        ctx.font = `${isBoldRow ? 'bold ' : ''}${fontSize}px sans-serif`;
        ctx.fillText(label, rowGutter / 2, y);
      }
    }

    if (colGutter > 0) {
      for (let c = 0; c < cols; c++) {
        if ((c + 1) % 10 !== 0) continue;
        const x = gridX0 + (c + 0.5) * cellSize;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillText(String(c + 1), x, colGutter / 2);
      }
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
