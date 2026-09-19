// 打印纸张与分页设置：尺寸、方向、按纸张自动计算格子大小，设置持久化到 localStorage。

export type PaperSizeId = 'a3' | 'a4' | 'letter';
export type Orientation = 'portrait' | 'landscape';

export type PrintSettings = {
  paperSize: PaperSizeId;
  orientation: Orientation;
  rowsPerPage: number;
};

// CSS @page size 关键字（letter 为美式信纸，a3/a4 均为标准关键字）
export const PAPER_SIZE_KEYWORD: Record<PaperSizeId, string> = {
  a3: 'A3',
  a4: 'A4',
  letter: 'letter',
};

export const PAPER_SIZE_LABELS: Record<PaperSizeId, string> = {
  a3: 'A3',
  a4: 'A4',
  letter: 'Letter (信纸)',
};

// 纸张短边 × 长边，单位毫米
export const PAPER_SIZES: Record<PaperSizeId, { widthMm: number; heightMm: number }> = {
  a3: { widthMm: 297, heightMm: 420 },
  a4: { widthMm: 210, heightMm: 297 },
  letter: { widthMm: 215.9, heightMm: 279.4 },
};

export const PAGE_PADDING_MM = 10; // @page margin 为 0，由纸页内边距留白
export const HEADER_MM = 14; // 每页表头占用高度（含下间距）
export const PRINT_FIT_SLOP_MM = 1; // 安全余量，避免亚像素舍入把纸页撑出空白页
export const PRINT_DPI = 300; // canvas 离屏渲染分辨率，保证打印清晰
export const MM_PER_INCH = 25.4;

const STORAGE_KEY = 'knitting-chart-print-settings';
export const MAX_ROWS_PER_PAGE = 1000;

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperSize: 'a4',
  orientation: 'portrait',
  rowsPerPage: 40,
};

export function getPaperSizeMm(id: PaperSizeId, orientation: Orientation) {
  const p = PAPER_SIZES[id];
  return orientation === 'portrait'
    ? { widthMm: p.widthMm, heightMm: p.heightMm }
    : { widthMm: p.heightMm, heightMm: p.widthMm };
}

export type PrintLayout = {
  pageWidthMm: number;
  pageHeightMm: number;
  contentWidthMm: number;
  contentHeightMm: number;
  cellMm: number;
  // 在“格子宽度由针数撑满纸宽”的前提下，一页最多放几行
  recommendedRows: number;
};

export function getPrintLayout(settings: PrintSettings, cols: number): PrintLayout {
  const paper = getPaperSizeMm(settings.paperSize, settings.orientation);
  const contentWidthMm = paper.widthMm - PAGE_PADDING_MM * 2 - PRINT_FIT_SLOP_MM;
  const contentHeightMm = paper.heightMm - PAGE_PADDING_MM * 2 - HEADER_MM - PRINT_FIT_SLOP_MM;

  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, settings.rowsPerPage);
  // 格子为正方形：宽向由针数决定、高向由每页行数决定，取较小者保证整张图放进纸内
  const cellMm = Math.min(contentWidthMm / safeCols, contentHeightMm / safeRows);

  const cellByWidth = contentWidthMm / safeCols;
  const recommendedRows = Math.max(1, Math.floor(contentHeightMm / cellByWidth));

  return {
    pageWidthMm: paper.widthMm,
    pageHeightMm: paper.heightMm,
    contentWidthMm,
    contentHeightMm,
    cellMm,
    recommendedRows,
  };
}

export function loadPrintSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRINT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PrintSettings>;
    return {
      paperSize: parsed.paperSize && parsed.paperSize in PAPER_SIZES ? parsed.paperSize : DEFAULT_PRINT_SETTINGS.paperSize,
      orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
      rowsPerPage: clampRows(parsed.rowsPerPage),
    };
  } catch {
    return DEFAULT_PRINT_SETTINGS;
  }
}

export function savePrintSettings(settings: PrintSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式等场景下持久化失败不影响使用
  }
}

export function clampRows(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PRINT_SETTINGS.rowsPerPage;
  return Math.min(MAX_ROWS_PER_PAGE, Math.max(1, Math.round(n)));
}
