function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === 'true') {
                resolve();
            } else {
                existing.addEventListener('load', resolve);
                existing.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)));
            }
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = function() {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = () => reject(new Error(`加载失败: ${src}`));
        document.head.appendChild(script);
    });
}

async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await loadScript(PDFJS_CDN);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    return window.pdfjsLib;
}

async function loadPdfLib() {
    if (window.PDFLib) return window.PDFLib;
    await loadScript(PDFLIB_CDN);
    return window.PDFLib;
}

async function loadExcelJS() {
    if (window.ExcelJS) return window.ExcelJS;
    await loadScript(EXCELJS_CDN);
    return window.ExcelJS;
}

let settings = loadSettings();

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return { ...defaultSettings };
        return { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
        return { ...defaultSettings };
    }
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* ignore */ }
}

function formatMarkerNumber(n) {
    const digits = Math.min(4, Math.max(2, settings.numberPadDigits | 0));
    return String(n).padStart(digits, '0');
}

function getMarkerTagNumber(m) {
    if (m && typeof m.tagNumber === 'string' && m.tagNumber.length > 0) return m.tagNumber;
    if (m && typeof m.number === 'number' && !isNaN(m.number)) return formatMarkerNumber(m.number);
    return '';
}

function formatMarkerLabel(m) {
    const abbr = m.typeAbbr || getTypeById(m.typeId).abbr;
    const tn = getMarkerTagNumber(m);
    return tn ? `${abbr}-${tn}` : abbr;
}

// 口径显示格式化：存储为 '2' 或 '2x3'，输出为 '2"' 或 '2"x3"'
// - 已含 ANSI/NPT/FLANGED 等连接关键字 → 原样返回（不补引号）
// - 已含 " 或数字+引号 → 原样返回（兼容旧数据）
// - 纯数字 / 数字x数字 → 每段补 "
function formatSizeNote(s) {
    if (!s) return '';
    const str = String(s).trim();
    if (!str) return '';
    if (/\b(ANSI|NPT|FLANGED|THREADED|SW|RTJ)\b/i.test(str)) return str;
    if (/"/.test(str)) return str;
    const parts = str.split(/\s*[xX]\s*/);
    return parts.map(p => p ? `${p}"` : '').join('x');
}

// Process Connection 拼接规则（Detail List / 预览 共用）：
// - sizeNote 经 formatSizeNote 渲染为 '2"' / '2"x3"' 显示格式
// - 已含 ANSI/NPT/FLANGED 等关键字 → 原样输出
// - 其他 → 按仪表代号从 INSTRUMENT_RESOURCES 查找后缀，找不到用默认 ANSI 150# RF
function buildProcessConnection(m) {
    if (!m.sizeNote) return '';
    const s = formatSizeNote(m.sizeNote);
    const res = window.INSTRUMENT_RESOURCES;
    if (res && res.hasConnectionKeyword(s)) return s;
    if (res) {
        const t = getTypeById(m.typeId);
        const abbr = m.typeAbbr || (t && t.abbr) || '';
        return s + ' ' + res.getConnectionSuffix(abbr);
    }
    return s;
}

function computeRenderScale(origWidth, origHeight) {
    let scale = PDF_RENDER_SCALE;
    const dimCap = RENDER_MAX_DIM / Math.max(origWidth, origHeight);
    if (dimCap < scale) scale = dimCap;
    const pixelCap = Math.sqrt(RENDER_MAX_PIXELS / (origWidth * origHeight));
    if (pixelCap < scale) scale = pixelCap;
    return Math.max(1, scale);
}

function virtualToScreen(vx, vy) {
    return {
        x: vx * zoom + panX + canvas.width / 2,
        y: vy * zoom + panY + canvas.height / 2,
    };
}

function screenToVirtual(sx, sy) {
    return {
        x: (sx - panX - canvas.width / 2) / zoom,
        y: (sy - panY - canvas.height / 2) / zoom,
    };
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getDocFileName(docId) {
    const doc = documents.find(d => d.id === docId);
    return doc ? doc.fileName : '未知文件';
}

// 按 Detail List 排序顺序返回 marker → 全局序号 (1-based) 的映射
// 所有仪表类型统一全局计数：PI放5个=1-5，TI放5个=6-10，FT放5个=11-15
// 排序规则：按创建顺序（_globalOrder），确保序号与用户创建顺序一致
function getDetailListIndexMap() {
    const sorted = [...markers].sort((a, b) => {
        return (a._globalOrder || 0) - (b._globalOrder || 0);
    });
    const map = new Map();
    sorted.forEach((m, i) => map.set(m, i + 1));
    // DEBUG: 输出排序结果排查序号不连续问题
    if (sorted.length > 0) {
        const debugInfo = sorted.map((m, i) =>
            `${i + 1}: ${m.typeName || '?'} #${m.number} (order=${m._globalOrder})`
        ).join(' | ');
        console.log('[DEBUG idxMap] 总数=' + sorted.length + ' | ' + debugInfo);
    }
    return map;
}

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
        r: parseInt(h.slice(0, 2), 16) / 255,
        g: parseInt(h.slice(2, 4), 16) / 255,
        b: parseInt(h.slice(4, 6), 16) / 255,
    };
}

function normalizeHexColor(hex) {
    if (!hex || typeof hex !== 'string') return 'E53935';
    const h = hex.replace('#', '').trim();
    if (/^[0-9a-fA-F]{6}$/.test(h)) return h.toUpperCase();
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
        return (h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toUpperCase();
    }
    return 'E53935';
}

function calculateDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function pixelsToDrawingMM(pixels) {
    if (pages.length > 0 && pages[0].width > 0) {
        const renderScale = pages[0].origWidth / pages[0].width;
        return pixels * renderScale / 72 * 25.4;
    }
    return pixels / 72 * 25.4;
}

async function runExportTask(buttons, taskFn, busyMsg, doneMsg, failMsg) {
    for (const b of buttons) if (b) b.disabled = true;
    showToast(busyMsg, true);
    try {
        await taskFn();
        showToast(doneMsg || '导出完成');
    } catch (e) {
        console.error(e);
        hideToast();
        alert(failMsg || '导出失败，请检查网络连接后重试');
    } finally {
        for (const b of buttons) if (b) b.disabled = false;
    }
}

function calculatePolygonArea(points) {
    if (!points || points.length < 3) return 0;
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}

/**
 * 显示自定义输入对话框（替代原生 prompt()）
 * @param {string} title - 对话框标题
 * @param {string} [defaultValue=''] - 默认值
 * @param {string} [placeholder=''] - 占位文本
 * @returns {Promise<string|null>} 用户输入值或 null（取消时）
 */
function showPromptDialog(title, defaultValue = '', placeholder = '') {
    return new Promise((resolve) => {
        const backdrop = document.getElementById('promptDialogBackdrop');
        const titleEl = document.getElementById('promptDialogTitle');
        const input = document.getElementById('promptDialogInput');
        const confirmBtn = document.getElementById('promptDialogConfirm');
        const cancelBtn = document.getElementById('promptDialogCancel');

        titleEl.textContent = title;
        input.value = defaultValue;
        input.placeholder = placeholder;

        function cleanup() {
            backdrop.hidden = true;
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            backdrop.removeEventListener('click', onBackdrop);
            input.removeEventListener('keydown', onKeydown);
        }

        function onConfirm() {
            const val = input.value;
            cleanup();
            resolve(val);
        }

        function onCancel() {
            cleanup();
            resolve(null);
        }

        function onBackdrop(e) {
            if (e.target === backdrop) {
                cleanup();
                resolve(null);
            }
        }

        function onKeydown(e) {
            if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        backdrop.addEventListener('click', onBackdrop);
        input.addEventListener('keydown', onKeydown);

        backdrop.hidden = false;
        setTimeout(() => input.focus(), 50);
    });
}