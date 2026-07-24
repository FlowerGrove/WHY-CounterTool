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

function formatMarkerLabel(m) {
    const abbr = m.typeAbbr || getTypeById(m.typeId).abbr;
    return `${abbr}${formatMarkerNumber(m.number)}`;
}

function pageStackGap(prevDocId, nextDocId) {
    const caption = PAGE_CAPTION_H;
    return (prevDocId !== nextDocId ? DOC_GAP : PAGE_GAP) + caption;
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

function convertPixelsToMM(pixels) {
    if (pages.length > 0 && pages[0].width > 0) {
        const renderScale = pages[0].origWidth / pages[0].width;
        const pdfPoints = pixels * renderScale;
        return (pdfPoints / 72 * 25.4).toFixed(2);
    }
    return (pixels / 72 * 25.4).toFixed(2);
}

function calculatePolylineTotalLength(points) {
    if (!points || points.length < 2) return '0.00';
    let totalPixels = 0;
    for (let i = 0; i < points.length - 1; i++) {
        totalPixels += calculateDistance(points[i], points[i + 1]);
    }
    return convertPixelsToMM(totalPixels);
}

function getSegmentDistances(points) {
    const segments = [];
    if (!points || points.length < 2) return segments;
    for (let i = 0; i < points.length - 1; i++) {
        const dist = calculateDistance(points[i], points[i + 1]);
        segments.push({
            from: i + 1,
            to: i + 2,
            distanceMM: convertPixelsToMM(dist)
        });
    }
    return segments;
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

function calculateLabelPosition(points) {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    if (points.length === 2) {
        return {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2
        };
    }
    let sumX = 0, sumY = 0;
    points.forEach(p => { sumX += p.x; sumY += p.y; });
    return {
        x: sumX / points.length,
        y: sumY / points.length
    };
}