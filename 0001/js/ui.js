let toastTimer = null;

function showToast(msg, spinner = false) {
    const el = document.getElementById('toast');
    el.innerHTML = (spinner ? '<i class="fa-solid fa-spinner fa-spin"></i> ' : '') + msg;
    el.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.remove('visible');
    }, 2200);
}

function hideToast() {
    const el = document.getElementById('toast');
    el.classList.remove('visible');
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
}

const globalTooltip = document.getElementById('globalTooltip');
let tooltipHideTimer = null;

function showTooltip(target) {
    const tooltipEl = target.querySelector('.tooltip');
    if (!tooltipEl) return;
    const text = tooltipEl.textContent.trim();
    if (!text) return;

    if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }

    globalTooltip.textContent = text;
    globalTooltip.classList.add('visible');

    const rect = target.getBoundingClientRect();
    const tooltipRect = globalTooltip.getBoundingClientRect();
    const top = rect.bottom + 6;
    let left = rect.left + rect.width / 2;

    const viewportW = window.innerWidth;
    const tooltipW = tooltipRect.width;
    if (left - tooltipW / 2 < 4) left = tooltipW / 2 + 4;
    if (left + tooltipW / 2 > viewportW - 4) left = viewportW - tooltipW / 2 - 4;

    globalTooltip.style.left = left + 'px';
    globalTooltip.style.top = top + 'px';
}

function hideTooltip() {
    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(() => {
        globalTooltip.classList.remove('visible');
    }, 50);
}

function initTooltips() {
    const buttons = document.querySelectorAll('.btn-icon');
    buttons.forEach(btn => {
        btn.addEventListener('mouseenter', () => showTooltip(btn));
        btn.addEventListener('mouseleave', hideTooltip);
    });
}

function clearAll() {
    if (pages.length === 0 && markers.length === 0 && measurements.length === 0) return;
    if (!confirm('确定要清空所有数据吗？此操作不可撤销。')) return;
    documents = [];
    pages = [];
    markers = [];
    measurements = [];
    currentPolylinePoints = [];
    isPolylineComplete = false;
    calibratePoints = [];
    calibratePreview = null;
    measurePhase = 'calibrate';
    measureRawScale = null;
    snapHint = null;
    usedNumbersByType.clear();
    history.length = 0;
    redoStack.length = 0;
    nextMarkerNumber = findNextNumberForType(currentTypeId);
    nextDocId = 1;
    panX = 0;
    panY = 0;
    zoom = 1;
    statsPanel.classList.remove('visible');
    statsToggle.classList.remove('active');
    // 重置 IO List 选择状态为默认值
    ioListSelectedIds = (() => {
        const targetAbbrs = new Set(['PI', 'TI', 'FI', 'LI']);
        const selected = new Set();
        for (const t of markerTypes) {
            if (targetAbbrs.has(t.abbr)) selected.add(t.id);
        }
        return selected;
    })();
    // 刷新 excel-config 缓存变量
    if (typeof _customFieldDefs !== 'undefined') _customFieldDefs = null;
    if (typeof _columnSettings !== 'undefined') _columnSettings = null;
    if (typeof _customAttrDefs !== 'undefined') _customAttrDefs = null;
    if (typeof _builtinAttrState !== 'undefined') _builtinAttrState = null;
    if (typeof _customTables !== 'undefined') _customTables = null;
    syncNumberInput();
    updateUI();
    updateMeasureUI();
    requestRender();
    updateUndoButtonState();
    clearAutosave();
    pendingRestore = null;
    document.getElementById('sessionBanner').classList.remove('visible');
}