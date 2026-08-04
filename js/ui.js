/**
 * ui.js - 用户界面交互模块
 * 提供 Toast 消息提示、全局工具提示（Tooltip）、工具栏提示初始化，
 * 以及清空所有数据（clearAll）等核心 UI 操作函数。
 */

let toastTimer = null;

/**
 * 显示 Toast 消息提示
 * @param {string} msg - 提示消息文本
 * @param {boolean} [spinner=false] - 是否显示加载旋转图标
 */
function showToast(msg, spinner = false) {
    const el = document.getElementById('toast');
    el.innerHTML = (spinner ? '<i class="fa-solid fa-spinner fa-spin"></i> ' : '') + msg;
    el.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.remove('visible');
    }, 2200);
}

/**
 * 隐藏 Toast 消息提示
 */
function hideToast() {
    const el = document.getElementById('toast');
    el.classList.remove('visible');
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
}

const globalTooltip = document.getElementById('globalTooltip');
let tooltipHideTimer = null;

/**
 * 显示全局工具提示，定位在目标元素下方
 * @param {HTMLElement} target - 触发工具提示的目标元素
 */
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

/**
 * 隐藏全局工具提示（带短延迟，避免闪烁）
 */
function hideTooltip() {
    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(() => {
        globalTooltip.classList.remove('visible');
    }, 50);
}

/**
 * 初始化工具栏按钮的工具提示事件绑定
 */
function initTooltips() {
    const buttons = document.querySelectorAll('.btn-icon');
    buttons.forEach(btn => {
        btn.addEventListener('mouseenter', () => showTooltip(btn));
        btn.addEventListener('mouseleave', hideTooltip);
    });
}

/**
 * 清空所有数据：包括文档、页面、标记、历史记录等
 * 重置所有状态到初始值，清除自动保存数据
 */
function clearAll() {
    if (pages.length === 0 && markers.length === 0) return;
    if (!confirm('确定要清空所有数据吗？此操作不可撤销。')) return;
    addLog('清空所有数据');
    documents = [];
    pages = [];
    markers = [];
    usedNumbers.clear();
    manualNumberSet = false;
    history.length = 0;
    redoStack.length = 0;
    nextMarkerNumber = findNextNumber();
    _globalOrderCounter = 0;
    nextDocId = 1;
    panX = 0;
    panY = 0;
    zoom = 1;
    // 刷新 excel-config 缓存变量
    if (typeof _customFieldDefs !== 'undefined') _customFieldDefs = null;
    if (typeof _columnSettings !== 'undefined') _columnSettings = null;
    if (typeof _customAttrDefs !== 'undefined') _customAttrDefs = null;
    if (typeof _builtinAttrState !== 'undefined') _builtinAttrState = null;
    if (typeof _customTables !== 'undefined') _customTables = null;
    // 重置批量编辑状态
    if (typeof _pvBatchSelected !== 'undefined') _pvBatchSelected = new Set();
    // 清理选中状态和 Inspector
    if (typeof selectedMarker !== 'undefined') selectedMarker = null;
    if (typeof inspectorPanel !== 'undefined' && inspectorPanel.classList.contains('visible')) {
        closeInspector();
    }
    if (typeof contextMenuTargetMarker !== 'undefined') {
        hideMarkerContextMenu();
    }
    syncNumberInput();
    updateUI();
    requestRender();
    updateUndoButtonState();
    clearAutosave();
    pendingRestore = null;
    document.getElementById('sessionBanner').classList.remove('visible');
}