import { useParams } from 'react-router-dom';
import { useMemo, useRef, useEffect, useState } from 'react';
import { useChartStore } from '../store/chartStore';
import { drawChartToCanvas } from '../utils/canvas';
import { calcYarnUsage } from '../utils/yarnCalc';
import {
  PAPER_SIZE_KEYWORD,
  PAPER_SIZE_LABELS,
  PAPER_SIZES,
  MM_PER_INCH,
  PRINT_DPI,
  loadPrintSettings,
  savePrintSettings,
  getPrintLayout,
  clampRows,
  MAX_ROWS_PER_PAGE,
  type PrintSettings,
  type PaperSizeId,
  type Orientation,
} from '../utils/paper';

// 打印时网格线按物理宽度取，缩放到 PRINT_DPI 的离屏像素
const THIN_LINE_MM = 0.15;
const BOLD_LINE_MM = 0.4;

type PageInfo = {
  startRow: number;
  endRow: number;
  pageNum: number;
  totalPages: number;
};

export default function Print() {
  const { id } = useParams<{ id: string }>();
  const charts = useChartStore((s) => s.charts);
  const chart = charts.find((c) => c.id === id);
  const usage = useMemo(() => (chart ? calcYarnUsage(chart) : []), [chart]);

  // 上次打印设置自动恢复
  const [settings, setSettings] = useState<PrintSettings>(() => loadPrintSettings());
  const [rowsText, setRowsText] = useState(() => String(settings.rowsPerPage));
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    savePrintSettings(settings);
  }, [settings]);

  // 纸张方向写进 @page，让浏览器按物理纸出页（@page margin 为 0，留白由纸页内边距控制）
  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'print-page-size';
    el.textContent = `@page { size: ${PAPER_SIZE_KEYWORD[settings.paperSize]} ${settings.orientation}; margin: 0; }`;
    document.head.appendChild(el);
    return () => {
      document.getElementById('print-page-size')?.remove();
    };
  }, [settings.paperSize, settings.orientation]);

  // 格子大小按纸张可打印区域自动计算（取宽/高限制中的较小者，保证整张图进得了纸）
  const layout = useMemo(
    () => getPrintLayout(settings, chart?.cols ?? 1),
    [settings, chart]
  );

  const pages = useMemo<PageInfo[]>(() => {
    if (!chart) return [];
    const rowsPerPage = settings.rowsPerPage;
    const count = Math.max(1, Math.ceil(chart.rows / rowsPerPage));
    return Array.from({ length: count }, (_, i) => ({
      startRow: i * rowsPerPage,
      endRow: Math.min((i + 1) * rowsPerPage, chart.rows),
      pageNum: i + 1,
      totalPages: count,
    }));
  }, [chart, settings.rowsPerPage]);

  useEffect(() => {
    if (!chart) return;
    const pxPerMm = PRINT_DPI / MM_PER_INCH;
    const cellDevice = Math.max(1, layout.cellMm * pxPerMm);
    pages.forEach((page, i) => {
      const canvas = canvasRefs.current[i];
      if (!canvas) return;
      drawChartToCanvas(chart, canvas, {
        showGrid: true,
        cellSize: cellDevice,
        startRow: page.startRow,
        endRow: page.endRow,
        totalRows: settings.rowsPerPage, // 末页不满也画满一整页
        thinLineWidth: THIN_LINE_MM * pxPerMm,
        boldLineWidth: BOLD_LINE_MM * pxPerMm,
      });
    });
  }, [chart, pages, layout.cellMm, settings.rowsPerPage]);

  const update = (patch: Partial<PrintSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  const commitRows = () => {
    const n = clampRows(rowsText);
    setRowsText(String(n));
    if (n !== settings.rowsPerPage) update({ rowsPerPage: n });
  };

  if (!chart) {
    return <div style={{ padding: 40, textAlign: 'center' }}>图解不存在</div>;
  }

  const gridWidthMm = chart.cols * layout.cellMm;
  const gridHeightMm = settings.rowsPerPage * layout.cellMm;
  const sheetStyle = {
    '--pw': `${layout.pageWidthMm}mm`,
    '--ph': `${layout.pageHeightMm}mm`,
  } as React.CSSProperties;

  return (
    <div className="print-app">
      <div className="print-toolbar">
        <button className="secondary" onClick={() => window.history.back()}>
          ← 返回
        </button>
        <label>
          纸张
          <select
            value={settings.paperSize}
            onChange={(e) => update({ paperSize: e.target.value as PaperSizeId })}
          >
            {(Object.keys(PAPER_SIZES) as PaperSizeId[]).map((pid) => (
              <option key={pid} value={pid}>
                {PAPER_SIZE_LABELS[pid]}
              </option>
            ))}
          </select>
        </label>
        <label>
          方向
          <select
            value={settings.orientation}
            onChange={(e) => update({ orientation: e.target.value as Orientation })}
          >
            <option value="portrait">纵向</option>
            <option value="landscape">横向</option>
          </select>
        </label>
        <label>
          每页行数
          <input
            type="number"
            min={1}
            max={MAX_ROWS_PER_PAGE}
            value={rowsText}
            onChange={(e) => setRowsText(e.target.value)}
            onBlur={commitRows}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <span className="print-hint">
          格子约 {layout.cellMm.toFixed(2)}mm · 共 {pages.length} 页图解
          {settings.rowsPerPage > layout.recommendedRows &&
            `（当前纸宽下每页建议不超过 ${layout.recommendedRows} 行，再多格子会缩小留边）`}
        </span>
        <button onClick={() => window.print()}>打印</button>
      </div>

      <div className="print-preview">
        {/* 封面页：图例与用线量（不占图解页码） */}
        <div className="print-sheet print-cover" style={sheetStyle}>
          <div className="print-sheet__header">
            <h1 className="print-sheet__title">{chart.title}</h1>
            <span className="print-sheet__meta">
              {chart.cols}针 × {chart.rows}行 | 密度 {chart.gauge.stsPer10cm}针/{chart.gauge.rowsPer10cm}行 (10cm)
            </span>
            <span className="print-sheet__mark">图例与用线量</span>
          </div>
          <div className="print-sheet__body" style={{ display: 'block' }}>
            <h4>图例</h4>
            <div className="print-cover__legend">
              {usage.map((u) => (
                <span key={u.paletteId}>
                  <i style={{ background: u.hex }} />
                  {u.colorName}（{u.cells}格，{u.percentage}%）
                </span>
              ))}
            </div>
            <h4>用线量</h4>
            <table>
              <thead>
                <tr>
                  <th>颜色</th>
                  <th className="num">格数</th>
                  <th className="num">占比</th>
                  <th className="num">米数</th>
                  <th className="num">建议团数(+15%)</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.paletteId}>
                    <td>
                      <i
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          marginRight: 4,
                          background: u.hex,
                          border: '1px solid #ddd',
                        }}
                      />
                      {u.colorName}
                    </td>
                    <td className="num">{u.cells}</td>
                    <td className="num">{u.percentage}%</td>
                    <td className="num">{u.meters}m</td>
                    <td className="num">{Math.ceil(u.skeins * 1.15 * 10) / 10}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 图解分页：每页都带重复表头，末页补满一整页 */}
        {pages.map((page, i) => (
          <div className="print-sheet" key={i} style={sheetStyle}>
            <div className="print-sheet__header">
              <h2 className="print-sheet__title">{chart.title}</h2>
              <span className="print-sheet__meta">
                {chart.cols}针 × {chart.rows}行 | {chart.gauge.stsPer10cm}针/{chart.gauge.rowsPer10cm}行(10cm)
              </span>
              <span className="print-sheet__mark">
                第 {page.pageNum}/{page.totalPages} 页 · 行 {page.startRow + 1}–{page.endRow}
              </span>
            </div>
            <div className="print-sheet__body">
              <canvas
                ref={(el) => {
                  // el 为 null 表示该 canvas 卸载，清掉对应槽位，避免页数减少后残留旧引用
                  canvasRefs.current[i] = el;
                }}
                style={{
                  width: `${gridWidthMm.toFixed(3)}mm`,
                  height: `${gridHeightMm.toFixed(3)}mm`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
