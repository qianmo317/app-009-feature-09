import { useParams, useNavigate } from 'react-router-dom';
import { useMemo, useRef, useEffect, useState } from 'react';
import { useChartStore } from '../store/chartStore';
import { usePrintSettingsStore } from '../store/printSettingsStore';
import { drawChartToCanvas } from '../utils/canvas';
import { calcYarnUsage } from '../utils/yarnCalc';
import './Print.css';

// CSS 参考像素换算：1mm = 96/25.4 px
const MM_TO_PX = 96 / 25.4;
// canvas 实际像素倍率，保证打印出来线条/文字清晰
const CANVAS_SCALE = 2;
// 页内尺寸（mm）：A4 四边留白 10mm
const PAGE_MARGIN_MM = 10;
const HEADER_MM = 18;
const BODY_TOP_MM = 3;
const ROW_GUTTER_MM = 9; // 左侧行号边距
const COL_GUTTER_MM = 8; // 顶部列号边距
const MAX_CELL_MM = 10;

const PAGE_SIZE = {
  portrait: { w: 210, h: 297 },
  landscape: { w: 297, h: 210 },
} as const;

type PageInfo = { startRow: number; endRow: number; pageNum: number; totalPages: number };

export default function Print() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const charts = useChartStore((s) => s.charts);
  const chart = charts.find((c) => c.id === id);

  const orientation = usePrintSettingsStore((s) => s.orientation);
  const rowsPerPage = usePrintSettingsStore((s) => s.rowsPerPage);
  const setOrientation = usePrintSettingsStore((s) => s.setOrientation);
  const setRowsPerPage = usePrintSettingsStore((s) => s.setRowsPerPage);

  const [rowsInput, setRowsInput] = useState(() => String(usePrintSettingsStore.getState().rowsPerPage));

  const usage = useMemo(() => (chart ? calcYarnUsage(chart) : []), [chart]);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // 根据纸张方向 + 每页行数，自动算出格子大小与可用网格区（mm）
  const layout = useMemo(() => {
    if (!chart) return null;
    const size = PAGE_SIZE[orientation];
    const bodyW = size.w - PAGE_MARGIN_MM * 2;
    const bodyH = size.h - PAGE_MARGIN_MM * 2 - HEADER_MM - BODY_TOP_MM;
    const gridW = bodyW - ROW_GUTTER_MM;
    const gridH = bodyH - COL_GUTTER_MM;
    const cellMm = Math.min(gridW / chart.cols, gridH / rowsPerPage, MAX_CELL_MM);
    const canvasWMm = ROW_GUTTER_MM + chart.cols * cellMm;
    const canvasHMm = COL_GUTTER_MM + rowsPerPage * cellMm;
    return { size, cellMm, canvasWMm, canvasHMm };
  }, [chart, orientation, rowsPerPage]);

  // 每页实际容纳行数（非法输入时兜底为 1；图解行数更少时由 ceil 保证只出一页）
  const effRowsPerPage = Math.max(1, rowsPerPage);

  const pages = useMemo<PageInfo[]>(() => {
    if (!chart) return [];
    const count = Math.ceil(chart.rows / effRowsPerPage);
    return Array.from({ length: count }, (_, i) => ({
      startRow: i * effRowsPerPage,
      endRow: Math.min((i + 1) * effRowsPerPage, chart.rows),
      pageNum: i + 1,
      totalPages: count,
    }));
  }, [chart, effRowsPerPage]);

  useEffect(() => {
    if (!chart || !layout) return;
    const cellPx = layout.cellMm * MM_TO_PX * CANVAS_SCALE;
    pages.forEach((page, i) => {
      const canvas = canvasRefs.current[i];
      if (!canvas) return;
      drawChartToCanvas(chart, canvas, {
        showGrid: true,
        cellSize: cellPx,
        startRow: page.startRow,
        endRow: page.endRow,
        rowGutter: ROW_GUTTER_MM * MM_TO_PX * CANVAS_SCALE,
        colGutter: COL_GUTTER_MM * MM_TO_PX * CANVAS_SCALE,
        // 最后一页不足整页，也把格子补满整页
        fullRowCount: rowsPerPage,
      });
    });
  }, [chart, pages, layout, rowsPerPage]);

  // 把纸张方向写进 @page，浏览器打印时按 A4 横向/纵向出纸
  useEffect(() => {
    const elId = 'print-page-orientation';
    let el = document.getElementById(elId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = elId;
      document.head.appendChild(el);
    }
    el.textContent = `@page { size: A4 ${orientation}; margin: 0; }`;
  }, [orientation]);

  if (!chart || !layout) {
    return <div style={{ padding: 40, textAlign: 'center' }}>图解不存在</div>;
  }

  const commitRows = (text: string) => {
    setRowsInput(text);
    const n = Number(text);
    if (Number.isInteger(n) && n >= 1) setRowsPerPage(n);
  };

  const canvasStyle = {
    width: `${layout.canvasWMm}mm`,
    height: `${layout.canvasHMm}mm`,
  };

  return (
    <div style={{ background: '#f5f3ef', minHeight: '100vh' }}>
      {/* 打印设置栏：仅屏幕可见，打印时隐藏 */}
      <div className="print-toolbar">
        <button onClick={() => navigate(`/editor/${chart.id}`)}>← 返回编辑</button>
        <div className="tb-group">
          <label>纸张方向</label>
          <select value={orientation} onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}>
            <option value="portrait">A4 纵向</option>
            <option value="landscape">A4 横向</option>
          </select>
        </div>
        <div className="tb-group">
          <label>每页行数</label>
          <input
            type="number"
            min={1}
            max={500}
            value={rowsInput}
            onChange={(e) => commitRows(e.target.value)}
            onBlur={() => setRowsInput(String(rowsPerPage))}
          />
        </div>
        <span className="tb-hint">
          每格 ≈ {layout.cellMm.toFixed(2)}mm · 共 {pages.length} 页图解 · 设置自动记住
        </span>
        <div className="tb-spacer" />
        <button className="primary" onClick={() => window.print()}>
          打印 / 另存 PDF
        </button>
      </div>

      <div className="print-root">
        {/* 封面：标题、图例、用线量（只在第一页出现） */}
        <div className={`print-page ${orientation === 'landscape' ? 'landscape' : ''}`}>
          <div className="page-header">
            <span className="ph-title">{chart.title}</span>
            <span className="ph-spacer" />
            <span className="ph-page">封面 · 图例与用线量</span>
          </div>
          <div className="cover-body">
            <h2>{chart.title}</h2>
            <p className="cover-sub">
              {chart.cols} 针 × {chart.rows} 行 ｜ 密度：{chart.gauge.stsPer10cm} 针 / {chart.gauge.rowsPer10cm} 行（每 10cm）
              ｜ 图解共 {pages.length} 页，本页之后每页 {effRowsPerPage} 行
            </p>

            <h3>图例</h3>
            <div className="cover-legend">
              {usage.map((u) => (
                <div key={u.paletteId} className="legend-item">
                  <span className="legend-swatch" style={{ background: u.hex }} />
                  <span>
                    {u.colorName}（{u.cells} 格，{u.percentage}%）
                  </span>
                </div>
              ))}
            </div>

            <h3>用线量</h3>
            <table className="cover-yarn">
              <thead>
                <tr>
                  <th>颜色</th>
                  <th className="num">格数</th>
                  <th className="num">占比</th>
                  <th className="num">米数</th>
                  <th className="num">建议团数（含 15% 余量）</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.paletteId}>
                    <td>
                      <span className="legend-swatch" style={{ background: u.hex, display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />
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

        {/* 图解分页：每页重复表头 */}
        {pages.map((page, i) => (
          <div key={i} className={`print-page ${orientation === 'landscape' ? 'landscape' : ''}`}>
            <div className="page-header">
              <span className="ph-title">{chart.title}</span>
              <span className="ph-meta">
                {chart.cols}针 × {chart.rows}行｜{chart.gauge.stsPer10cm}/{chart.gauge.rowsPer10cm}（10cm）
              </span>
              <span className="ph-spacer" />
              <span className="ph-direction">奇数行→ 偶数行←</span>
              <span className="ph-page">
                第 {page.pageNum}/{page.totalPages} 页 · 行 {page.startRow + 1}–{page.endRow}
              </span>
            </div>
            <div className="page-body">
              <canvas
                ref={(el) => {
                  canvasRefs.current[i] = el;
                }}
                style={canvasStyle}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
