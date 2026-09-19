import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.localStorage = dom.window.localStorage;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0)) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = ((h: number) => clearTimeout(h)) as typeof cancelAnimationFrame;

// jsdom 不实现 canvas，打桩 2d 上下文
const noop = () => {};
const ctxStub = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'canvas') return { width: 0, height: 0 };
      return typeof prop === 'string' ? noop : undefined;
    },
    set: () => true,
  }
);
(dom.window.HTMLCanvasElement.prototype as any).getContext = function () {
  return ctxStub;
};


let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log('  ✓', msg);
  } else {
    fail++;
    console.error('  ✗', msg);
  }
}

function renderPrint(route: string) {
  const root = createRoot(document.getElementById('root')!);
  flushSync(() => {
    root.render(
      React.createElement(MemoryRouter, { initialEntries: [route] },
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/print/:id', element: React.createElement(Print) })
        )
      )
    );
  });
  return root;
}


function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

function flush(ms = 20) {
  return new Promise((r) => setTimeout(r, ms));
}

let React: any;
let createRoot: any;
let flushSync: any;
let MemoryRouter: any, Routes: any, Route: any;
let Print: any;
let useChartStore: any;

async function main() {
  ({ default: React } = await import('react'));
  ({ createRoot } = await import('react-dom/client'));
  ({ flushSync } = await import('react-dom'));
  ({ MemoryRouter, Routes, Route } = await import('react-router-dom'));
  ({ default: Print } = await import('./src/pages/Print.tsx'));
  ({ useChartStore } = await import('./src/store/chartStore.ts'));
  // ---- 场景 1：100 行、40 行/页 → 3 页，末页 81-100 补满 ----
  dom.window.localStorage.clear();
  const chartId = useChartStore.getState().createChart(50, 100, '测试围巾图解');
  await flush();
  const root = renderPrint(`/print/${chartId}`);
  await flush();

  const sheets = document.querySelectorAll('.print-sheet');
  console.log('场景1：100行图 / 默认每页40行');
  assert(sheets.length === 4, `共 4 张纸（1 封面 + 3 图解页），实际 ${sheets.length}`);

  const bodyText = document.body.textContent ?? '';
  assert(bodyText.includes('第 1/3 页'), '第1页标注 1/3');
  assert(bodyText.includes('行 1–40'), '第1页行范围 1–40');
  assert(bodyText.includes('第 2/3 页'), '第2页标注 2/3');
  assert(bodyText.includes('行 41–80'), '第2页行范围 41–80');
  assert(bodyText.includes('第 3/3 页'), '第3页标注 3/3');
  assert(bodyText.includes('行 81–100'), '第3页行范围 81–100');
  assert(bodyText.includes('共 3 页图解'), '工具栏显示总页数');

  // 每页都有重复表头
  const gridSheets = document.querySelectorAll('.print-sheet:not(.print-cover)');
  let headersOk = true;
  gridSheets.forEach((s) => {
    const h = s.querySelector('.print-sheet__header');
    if (!h || !h.textContent!.includes('测试围巾图解')) headersOk = false;
  });
  assert(headersOk, '每页图解都有重复表头（含标题）');

  // 末页 canvas 高度按满页 40 行（而非 20 行）——canvas style height 应与其他页一致
  const canvases = document.querySelectorAll('.print-sheet canvas');
  const heights = Array.from(canvases).map((c) => (c as HTMLCanvasElement).style.height);
  assert(canvases.length === 3, `3 个图解 canvas，实际 ${canvases.length}`);
  assert(new Set(heights).size === 1, `末页 canvas 高度与其他页相同（占满一页）：${JSON.stringify(heights)}`);

  // 封面含图例与用线量
  const cover = document.querySelector('.print-cover');
  assert(!!cover && cover.textContent!.includes('图例') && cover.textContent!.includes('用线量'), '封面含图例与用线量');

  // @page 规则已注入（A4 纵向）
  const pageStyle = document.getElementById('print-page-size');
  assert(!!pageStyle && pageStyle.textContent!.includes('A4 portrait'), `@page 为 A4 纵向：${pageStyle?.textContent}`);

  // 纸页尺寸变量（A4 纵向 210×297mm）
  const sheet0 = sheets[0] as HTMLElement;
  assert(sheet0.style.getPropertyValue('--pw') === '210mm', '纸宽 210mm');
  assert(sheet0.style.getPropertyValue('--ph') === '297mm', '纸高 297mm');

  // ---- 改设置：横向 + 每页 30 行 ----
  const orientationSel = document.querySelectorAll('.print-toolbar select')[1] as HTMLSelectElement;
  orientationSel.value = 'landscape';
  orientationSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const rowsInput = document.querySelector('.print-toolbar input') as HTMLInputElement;
  setInputValue(rowsInput, '30');
  rowsInput.focus(); rowsInput.blur();
  await flush();

  const sheets2 = document.querySelectorAll('.print-sheet');
  console.log('场景2：改横向 + 每页30行');
  assert(sheets2.length === 5, `共 5 张纸（1 封面 + 4 图解页：ceil(100/30)=4），实际 ${sheets2.length}`);
  const t2 = document.body.textContent ?? '';
  assert(t2.includes('行 91–100') && t2.includes('第 4/4 页'), '末页 91–100，标注 4/4');
  const style2 = document.getElementById('print-page-size');
  assert(!!style2 && style2.textContent!.includes('A4 landscape'), `@page 切换为 A4 横向：${style2?.textContent}`);
  const s2 = sheets2[0] as HTMLElement;
  assert(s2.style.getPropertyValue('--pw') === '297mm' && s2.style.getPropertyValue('--ph') === '210mm', '预览纸页变为 297×210mm');
  const saved1 = JSON.parse(dom.window.localStorage.getItem('knitting-chart-print-settings')!);
  assert(saved1.orientation === 'landscape' && saved1.rowsPerPage === 30 && saved1.paperSize === 'a4',
    `设置已持久化：${JSON.stringify(saved1)}`);

  root.unmount();

  // ---- 场景 3：重新打开打印页，恢复上次设置 ----
  console.log('场景3：重新打开按上次设置恢复');
  const root2 = renderPrint(`/print/${chartId}`);
  await flush();
  const input3 = document.querySelector('.print-toolbar input') as HTMLInputElement;
  assert(input3.value === '30', `每页行数输入框恢复为 30，实际 ${input3.value}`);
  const sel3 = document.querySelectorAll('.print-toolbar select')[1] as HTMLSelectElement;
  assert(sel3.value === 'landscape', `方向恢复为横向，实际 ${sel3.value}`);
  const sheets3 = document.querySelectorAll('.print-sheet');
  assert(sheets3.length === 5, `仍为 5 张纸，实际 ${sheets3.length}`);

  // ---- 场景 4：异常输入被修正并持久化 ----
  const input4 = document.querySelector('.print-toolbar input') as HTMLInputElement;
  setInputValue(input4, '0');
  input4.focus(); input4.blur();
  await flush();
  const input4b = document.querySelector('.print-toolbar input') as HTMLInputElement;
  assert(input4b.value === '1', `每页行数 0 被修正为 1，实际 ${input4b.value}`);

  root2.unmount();

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
