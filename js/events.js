/**
 * events.js - 事件处理与交互逻辑模块
 * 负责处理鼠标/触摸/键盘事件、标记右键属性面板、
 * 设置面板操作、仪表属性管理，以及导出功能的事件绑定。
 */

let mouseDownPos = null;
let mouseDownButton = -1;
let isDragging = false;
let dragStartX = 0,
    dragStartY = 0;
let dragPanStartX = 0,
    dragPanStartY = 0;

const markerContextMenu = document.getElementById('markerContextMenu');
let contextMenuTargetMarker = null;
let selectedMarker = null;  // 左键点击选中的标记（用于 Ctrl+1 打开 Inspector）

/**
 * 填充右键菜单表单字段（不处理定位和显示逻辑）
 * @param {Object} marker - 当前标记对象
 */
function _fillMarkerContextMenuFields(marker) {
    // 标题显示类型 + 编号
    const t = getTypeById(marker.typeId);
    const typeLabel = t.name || marker.typeName || '';
    const numberLabel = marker.number ? `-${formatMarkerNumber(marker.number)}` : '';
    document.getElementById('mcmTitle').textContent = `${typeLabel}${numberLabel}`;

    document.getElementById('mcmTagNumber').value = marker.tagNumber || '';
    document.getElementById('mcmLocation').value = marker.location || '';
}

/**
 * 显示标记右键属性面板，填充当前标记的值到表单
 * 如果面板已打开则自动保存并切换到新标记
 * @param {number} screenX - 屏幕 X 坐标
 * @param {number} screenY - 屏幕 Y 坐标
 * @param {Object} marker - 目标标记对象
 */
function showMarkerContextMenu(screenX, screenY, marker) {
    // 如果菜单已打开，自动保存当前数据并切换到新标记（不改变位置）
    if (markerContextMenu.classList.contains('visible') && contextMenuTargetMarker) {
        if (contextMenuTargetMarker === marker) return; // 同一标记，不操作
        saveMarkerContextMenu();
        contextMenuTargetMarker = marker;
        _fillMarkerContextMenuFields(marker);
        setTimeout(() => document.getElementById('mcmTagNumber').focus(), 30);
        return;
    }

    addLog('编辑标记属性');
    contextMenuTargetMarker = marker;
    _fillMarkerContextMenuFields(marker);
    markerContextMenu.style.resize = 'none';
    markerContextMenu.style.width = '';
    markerContextMenu.style.height = '';
    void markerContextMenu.offsetHeight;
    markerContextMenu.style.resize = 'both';
    markerContextMenu.classList.add('visible');
    const rect = markerContextMenu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = screenX;
    let y = screenY;
    if (x + rect.width > vw) x = Math.max(4, vw - rect.width);
    if (y + rect.height > vh) y = Math.max(4, vh - rect.height);
    if (y < 4) y = 4;
    markerContextMenu.style.left = x + 'px';
    markerContextMenu.style.top = y + 'px';

    // 焦点到仪表编号输入
    setTimeout(() => document.getElementById('mcmTagNumber').focus(), 30);
}

/**
 * 隐藏标记右键属性面板，重置目标标记引用
 */
function hideMarkerContextMenu() {
    markerContextMenu.classList.remove('visible');
    contextMenuTargetMarker = null;
}

/**
 * 获取事件相对于画布内容的坐标（考虑设备像素比）
 * @param {Event} e - 鼠标或触摸事件
 * @returns {{x: number, y: number}} 画布坐标系中的坐标
 */
function getEventPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches && e.touches.length > 0) {
        return {
            x: (e.touches[0].clientX - rect.left) * scaleX,
            y: (e.touches[0].clientY - rect.top) * scaleY
        };
    }
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

canvas.addEventListener('mousedown', (e) => {
    mouseDownPos = getEventPos(e);
    mouseDownButton = e.button;

    if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        dragStartX = mouseDownPos.x;
        dragStartY = mouseDownPos.y;
        dragPanStartX = panX;
        dragPanStartY = panY;
        canvas.classList.add('grabbing');
    }
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const pos = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
        panX = dragPanStartX + (pos.x - dragStartX);
        panY = dragPanStartY + (pos.y - dragStartY);
        requestRender();
    }
});

/**
 * 处理画布点击/轻触事件，根据当前模式分派到对应的操作
 * @param {number} vx - 虚拟坐标 X
 * @param {number} vy - 虚拟坐标 Y
 */
function handleCanvasTap(vx, vy) {
    if (pages.length === 0) {
        showToast('请先导入PDF文件');
        return;
    }

    if (eraseMode) {
        const hit = findMarkerAtVirtual(vx, vy);
        if (hit) {
            addLog('删除标记');
            deleteMarker(hit);
        }
    } else {
        addLog('添加标记');
        addMarker(vx, vy);
    }
}

document.addEventListener('mouseup', (e) => {
    if (e.button === 1 && isDragging && mouseDownPos) {
        canvas.classList.remove('grabbing');
        requestRender();
    } else if (e.button === 0 && mouseDownPos) {
        const upPos = getEventPos(e);
        // 拖拽防误触：移动超过 5px 视为拖拽，不触发点击
        const dx = upPos.x - mouseDownPos.x;
        const dy = upPos.y - mouseDownPos.y;
        if (Math.hypot(dx, dy) < 5) {
            const v = screenToVirtual(upPos.x, upPos.y);

            // 检查是否点击了已有标记（用于选中）
            const hit = findMarkerAtVirtual(v.x, v.y);
            if (hit && !eraseMode) {
                // 左键点击标记 → 选中并打开 Inspector
                selectedMarker = hit;
                openInspector(hit);
                requestRender();
            } else if (inspectorPanel.classList.contains('visible') && !eraseMode) {
                // 点击空白区域 → 退出 Inspector 属性状态
                selectedMarker = null;
                closeInspector();
                requestRender();
            } else {
                selectedMarker = null;
                handleCanvasTap(v.x, v.y);
            }
        }
    }
    mouseDownPos = null;
    mouseDownButton = -1;
    isDragging = false;
});

canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

canvas.addEventListener('contextmenu', (e) => {
    console.log('[DEBUG contextmenu] 触发右键 | isDragging=' + isDragging + ' | eraseMode=' + eraseMode + ' | markers.length=' + markers.length);
    if (isDragging) { e.preventDefault(); return; }

    // 标记模式下：右键已标记位置弹出备注菜单
    if (!eraseMode) {
        const pos = getEventPos(e);
        const v = screenToVirtual(pos.x, pos.y);
        const hit = findMarkerAtVirtual(v.x, v.y);
        console.log('[DEBUG contextmenu] 虚拟坐标=' + v.x.toFixed(1) + ',' + v.y.toFixed(1) + ' | hit=' + (hit ? hit.typeName + '#' + hit.number : 'null'));
        if (hit) {
            e.preventDefault();
            showMarkerContextMenu(e.clientX, e.clientY, hit);
            return;
        }
    }
});

/**
 * 保存标记右键属性面板的更改，对比变更并记录到历史
 */
function saveMarkerContextMenu() {
    const marker = contextMenuTargetMarker;
    if (!marker) return;
    const updates = [];

    function apply(field, newVal) {
        const clean = typeof newVal === 'string' ? newVal.trim() : newVal;
        const finalVal = (clean === '' || clean === null || clean === undefined) ? undefined : clean;
        const oldVal = marker[field] !== undefined ? marker[field] : '';
        const oldForCmp = (oldVal === undefined || oldVal === null) ? '' : String(oldVal);
        const newForCmp = (finalVal === undefined || finalVal === null) ? '' : String(finalVal);
        if (oldForCmp !== newForCmp) {
            updates.push({ field, oldValue: oldForCmp, newValue: newForCmp });
            marker[field] = finalVal;
        }
    }

    apply('tagNumber', document.getElementById('mcmTagNumber').value);
    apply('location', document.getElementById('mcmLocation').value);

    if (updates.length > 0) {
        addLog('保存标记属性');
        const changes = Object.fromEntries(updates.map(u => [u.field, u.oldValue]));
        const after = Object.fromEntries(updates.map(u => [u.field, u.newValue]));
        pushHistory({ type: 'bulkUpdate', marker, changes, after });
        requestRender();
        scheduleAutosave();
        // 若预览已打开，刷新预览表
        if (typeof pvRefreshPreview === 'function') pvRefreshPreview();
    }
}

// 右键属性面板按钮事件绑定
(function bindMarkerContextMenuActions() {
    // 关闭按钮（header）
    document.getElementById('mcmCloseBtn').addEventListener('click', () => {
        hideMarkerContextMenu();
    });
    // 关闭按钮（footer）
    document.getElementById('mcmCloseBtn2').addEventListener('click', () => {
        hideMarkerContextMenu();
    });
    // 删除按钮
    document.getElementById('mcmDeleteBtn').addEventListener('click', () => {
        const m = contextMenuTargetMarker;
        hideMarkerContextMenu();
        if (m) deleteMarker(m);
    });
    // 打开 Inspector 属性面板按钮
    document.getElementById('mcmInspectorBtn').addEventListener('click', () => {
        const m = contextMenuTargetMarker;
        if (m) {
            hideMarkerContextMenu();
            openInspector(m);
        }
    });
    // 保存按钮（仅保存，不关闭）
    document.getElementById('mcmSaveBtn').addEventListener('click', () => {
        saveMarkerContextMenu();
    });
    // 面板内输入框回车 = 保存
    markerContextMenu.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveMarkerContextMenu();
        }
    });

    // ===== 通过 header 拖动菜单 =====
    const header = markerContextMenu.querySelector('.mcm-header');
    let dragState = null; // {startX, startY, menuX, menuY, moved}

    header.addEventListener('mousedown', (e) => {
        // 点击按钮时不启动拖动
        if (e.target.closest('button')) return;
        if (!markerContextMenu.classList.contains('visible')) return;
        const rect = markerContextMenu.getBoundingClientRect();
        dragState = {
            startX: e.clientX,
            startY: e.clientY,
            menuX: rect.left,
            menuY: rect.top,
            moved: false,
        };
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragState) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        // 阈值 3px，避免微小移动被识别为拖动
        if (!dragState.moved && Math.hypot(dx, dy) < 3) return;
        dragState.moved = true;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = markerContextMenu.offsetWidth;
        const h = markerContextMenu.offsetHeight;
        let x = dragState.menuX + dx;
        let y = dragState.menuY + dy;
        // 边界约束：至少保留部分在视口内
        x = Math.max(4 - w + 80, Math.min(x, vw - 80));
        y = Math.max(4, Math.min(y, vh - 32));
        markerContextMenu.style.left = x + 'px';
        markerContextMenu.style.top = y + 'px';
    });

    document.addEventListener('mouseup', () => {
        const wasMoved = dragState && dragState.moved;
        dragState = null;
        // 拖动结束后阻止接下来的 click（防止触发"点击菜单外关闭"）
        if (wasMoved) {
            const suppress = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                document.removeEventListener('click', suppress, true);
            };
            document.addEventListener('click', suppress, true);
        }
    });
})();

let touchStartPos = null;
let touchStartPanX = 0,
    touchStartPanY = 0;
let isTouchDragging = false;
let lastTouchDist = 0;
let isPinching = false;

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches.length === 1) {
        const touch = e.touches[0];
        touchStartPos = { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
        touchStartPanX = panX;
        touchStartPanY = panY;
        isTouchDragging = true;
        isPinching = false;
    } else if (e.touches.length === 2) {
        const t1 = e.touches[0],
            t2 = e.touches[1];
        lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        isPinching = true;
        isTouchDragging = false;
        const cx = ((t1.clientX + t2.clientX) / 2 - rect.left) * scaleX;
        const cy = ((t1.clientY + t2.clientY) / 2 - rect.top) * scaleY;
        touchStartPos = { x: cx, y: cy };
        touchStartPanX = panX;
        touchStartPanY = panY;
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches.length === 1 && isTouchDragging && !isPinching) {
        const touch = e.touches[0];
        const dx = (touch.clientX - rect.left) * scaleX - touchStartPos.x;
        const dy = (touch.clientY - rect.top) * scaleY - touchStartPos.y;
        panX = touchStartPanX + dx;
        panY = touchStartPanY + dy;
        requestRender();
    } else if (e.touches.length === 2 && isPinching) {
        const t1 = e.touches[0],
            t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const scale = dist / lastTouchDist;
        lastTouchDist = dist;
        const cx = ((t1.clientX + t2.clientX) / 2 - rect.left) * scaleX;
        const cy = ((t1.clientY + t2.clientY) / 2 - rect.top) * scaleY;
        const vBefore = screenToVirtual(cx, cy);
        zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * scale));
        const vAfter = screenToVirtual(cx, cy);
        panX += (vAfter.x - vBefore.x) * zoom;
        panY += (vAfter.y - vBefore.y) * zoom;
        requestRender();
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.touches.length === 0 && isTouchDragging && touchStartPos) {
        const dx = Math.abs((e.changedTouches[0].clientX - canvas.getBoundingClientRect().left) * (canvas.width / canvas.getBoundingClientRect().width) - touchStartPos.x);
        const dy = Math.abs((e.changedTouches[0].clientY - canvas.getBoundingClientRect().top) * (canvas.height / canvas.getBoundingClientRect().height) - touchStartPos.y);
        if (dx < 8 && dy < 8) {
            const v = screenToVirtual(touchStartPos.x, touchStartPos.y);
            const hit = findMarkerAtVirtual(v.x, v.y);
            if (hit && !eraseMode) {
                selectedMarker = hit;
                openInspector(hit);
                requestRender();
            } else if (inspectorPanel.classList.contains('visible') && !eraseMode) {
                selectedMarker = null;
                closeInspector();
                requestRender();
            } else {
                selectedMarker = null;
                handleCanvasTap(v.x, v.y);
            }
        }
    }
    isTouchDragging = false;
    isPinching = false;
    touchStartPos = null;
}, { passive: false });

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const sx = (e.clientX - rect.left) * scaleX;
    const sy = (e.clientY - rect.top) * scaleY;

    if (e.ctrlKey || e.metaKey) {
        panX += e.deltaX * WHEEL_PAN_SPEED;
        panY += e.deltaY * WHEEL_PAN_SPEED;
    } else {
        const vBefore = screenToVirtual(sx, sy);

        const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
        zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));

        const vAfter = screenToVirtual(sx, sy);
        panX += (vAfter.x - vBefore.x) * zoom;
        panY += (vAfter.y - vBefore.y) * zoom;
    }
    requestRender();
}, { passive: false });

document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') window._shiftDown = true;

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // 设置面板中的输入框允许 Escape 关闭
        if (e.key === 'Escape') {
            if (settingsBackdrop.classList.contains('visible')) {
                e.preventDefault();
                settingsBackdrop.classList.remove('visible');
                return;
            }
        }
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
    }
    // Ctrl+1：打开 Inspector 属性面板
    if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        if (selectedMarker && markers.includes(selectedMarker)) {
            openInspector(selectedMarker);
        } else if (contextMenuTargetMarker && markers.includes(contextMenuTargetMarker)) {
            openInspector(contextMenuTargetMarker);
        } else {
            showToast('请先点击选择一个标记，或右键标记');
        }
    }
    // Escape 关闭 Inspector
    if (e.key === 'Escape') {
        if (inspectorPanel.classList.contains('visible')) {
            e.preventDefault();
            closeInspector();
            return;
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') window._shiftDown = false;
});

radiusSlider.addEventListener('input', () => {
    markerRadius = parseFloat(radiusSlider.value);
    radiusValueEl.textContent = markerRadius;
    requestRender();
});

fontSizeSlider.addEventListener('input', () => {
    markerFontSize = parseFloat(fontSizeSlider.value);
    fontSizeValueEl.textContent = markerFontSize;
    requestRender();
});

numberInput.addEventListener('input', () => {
    updateNumberInputState();
});

numberInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const val = parseInt(numberInput.value, 10);
        if (!isNaN(val) && val >= 1 && val <= MAX_MARKER_NUMBER && !isNumberUsed(val)) {
            nextMarkerNumber = val;
            manualNumberSet = true;
            syncNumberInput();
        }
    }
});

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

eraserBtn.addEventListener('click', () => {
    eraseMode = !eraseMode;
    eraserBtn.classList.toggle('active', eraseMode);
    canvas.classList.toggle('erase-mode', eraseMode);
    addLog(eraseMode ? '切换橡皮擦模式' : '切换标记模式');
    showToast(eraseMode ? '橡皮擦模式：点击标记可删除' : '标记模式');
});

clearBtn.addEventListener('click', clearAll);

settingsBtn.addEventListener('click', () => {
    settingPadDigits.value = String(settings.numberPadDigits);
    settingShowCaption.checked = settings.showPageCaption;
    settingCaptionName.checked = settings.captionShowName;
    settingCaptionSize.checked = settings.captionShowSize;
    // 页脚子设置显隐
    updateCaptionSubVisibility();
    settingsBackdrop.classList.add('visible');
});

settingsCloseBtn.addEventListener('click', () => {
    settingsBackdrop.classList.remove('visible');
});
settingsCancelBtn.addEventListener('click', () => {
    settingsBackdrop.classList.remove('visible');
});

settingsSaveBtn.addEventListener('click', () => {
    settings.numberPadDigits = parseInt(settingPadDigits.value, 10) || 3;
    settings.showPageCaption = settingShowCaption.checked;
    settings.captionShowName = settingCaptionName.checked;
    settings.captionShowSize = settingCaptionSize.checked;
    saveSettings();
    addLog('保存设置');
    settingsBackdrop.classList.remove('visible');
    requestRender();
});

settingsBackdrop.addEventListener('click', (e) => {
    if (e.target === settingsBackdrop) {
        settingsBackdrop.classList.remove('visible');
    }
});

// ===== 设置面板折叠分组 & 子设置联动 =====
/**
 * 确保设置面板中的指定分组处于折叠状态
 * @param {string} hdrId - 分组标题元素 ID
 * @param {string} bodyId - 分组内容元素 ID（未使用，保留兼容性）
 */
function ensureSectionCollapsed(hdrId, bodyId) {
    const hdr = document.getElementById(hdrId);
    if (!hdr) return;
    const section = hdr.closest('.setting-section');
    if (!section) return;
    section.classList.add('collapsed');
}

/**
 * 切换设置面板中分组的折叠/展开状态
 * @param {HTMLElement} hdr - 分组标题元素
 */
function toggleSection(hdr) {
    const section = hdr.closest('.setting-section');
    if (!section) return;
    section.classList.toggle('collapsed');
}

/**
 * 根据"显示页脚"开关状态，更新页脚子设置项的显隐
 */
function updateCaptionSubVisibility() {
    const show = settingShowCaption.checked;
    document.getElementById('settingCaptionNameRow').classList.toggle('visible', show);
    document.getElementById('settingCaptionSizeRow').classList.toggle('visible', show);
}

// 页脚开关联动子设置
settingShowCaption.addEventListener('change', updateCaptionSubVisibility);



// ===== 仪表属性管理对话框 =====
/**
 * 打开仪表属性管理对话框
 */
function openCustomAttrManage() {
    renderCfAttrList();
    document.getElementById('cfAttrBackdrop').hidden = false;
    document.getElementById('cfAttrLabel').value = '';
    document.getElementById('cfAttrDesc').value = '';
    setTimeout(() => document.getElementById('cfAttrLabel').focus(), 50);
}

/**
 * 关闭仪表属性管理对话框，刷新预览和 Inspector
 */
function closeCustomAttrManage() {
    document.getElementById('cfAttrBackdrop').hidden = true;
    renderPreview();
    refreshInspectorIfOpen();
}

/**
 * 刷新 Inspector（如果已打开），供对话框操作后同步
 */
function refreshInspectorIfOpen() {
    if (typeof inspectorPanel !== 'undefined' && inspectorPanel.classList.contains('visible') && typeof inspectorTarget !== 'undefined' && inspectorTarget) {
        if (typeof renderInspector === 'function') renderInspector();
    }
}

/**
 * 渲染仪表属性管理列表：内置属性（分组显示）和自定义属性
 * 包含启用/禁用切换、隐藏、删除等交互事件绑定
 */
function renderCfAttrList() {
    const list = document.getElementById('cfAttrList');
    const customDefs = getCustomAttrDefs();
    let html = '';

    // 内置属性（按分组排列，显示名称 + 描述 + 启用 + 隐藏）
    const groups = {};
    getVisibleBuiltinAttrs().forEach(a => {
        if (!groups[a.group]) groups[a.group] = [];
        groups[a.group].push(a);
    });
    for (const [group, attrs] of Object.entries(groups)) {
        html += '<div class="cf-manage-group">';
        html += '<div class="cf-manage-group-title">' + pvEscape(group) + '</div>';
        attrs.forEach(a => {
            const enabled = isBuiltinAttrEnabled(a.key);
            html +=
                '<div class="cf-manage-item cf-manage-item--builtin">' +
                    '<span class="cf-manage-item-label" title="' + pvEscape(a.label) + '">' + pvEscape(a.label) + '</span>' +
                    '<span class="cf-manage-item-desc cf-manage-item-desc--builtin" title="' + pvEscape(a.desc || '') + '">' + pvEscape(a.desc || '') + '</span>' +
                    '<button class="cf-manage-item-toggle' + (enabled ? ' enabled' : '') + '" data-bkey="' + a.key + '" title="' + (enabled ? '已启用，点击禁用' : '已禁用，点击启用') + '">' + (enabled ? 'ON' : 'OFF') + '</button>' +
                    '<button class="cf-manage-item-del" data-bkey="' + a.key + '" title="隐藏此属性">' +
                        '<i class="fa-solid fa-trash-can"></i>' +
                    '</button>' +
                '</div>';
        });
        html += '</div>';
    }

    // 自定义属性（名称 + 描述 + 启用 + 删除）
    if (customDefs.length > 0) {
        html += '<div class="cf-manage-group">';
        html += '<div class="cf-manage-group-title">自定义属性</div>';
        customDefs.forEach(d => {
            const enabled = d.enabled !== false;
            html +=
                '<div class="cf-manage-item">' +
                    '<span class="cf-manage-item-label" title="' + pvEscape(d.label) + '">' + pvEscape(d.label) + '</span>' +
                    '<span class="cf-manage-item-desc cf-manage-item-desc--editable" data-key="' + d.key + '" data-field="desc" title="点击编辑描述">' + pvEscape(d.description || '') + '</span>' +
                    '<button class="cf-manage-item-toggle' + (enabled ? ' enabled' : '') + '" data-key="' + d.key + '" data-field="enabled" title="' + (enabled ? '已启用，点击禁用' : '已禁用，点击启用') + '">' + (enabled ? 'ON' : 'OFF') + '</button>' +
                    '<button class="cf-manage-item-del" data-key="' + d.key + '" title="删除此属性">' +
                        '<i class="fa-solid fa-trash-can"></i>' +
                    '</button>' +
                '</div>';
        });
        html += '</div>';
    } else {
        html += '<div class="cf-manage-empty">暂无自定义属性，在上方输入属性名后点击"添加属性"</div>';
    }

    // 恢复隐藏的内置属性按钮
    if (hasHiddenBuiltinAttrs()) {
        html += '<div class="cf-manage-restore">' +
            '<button class="btn-secondary cf-restore-btn" id="cfRestoreBuiltin">恢复已隐藏的内置属性</button>' +
            '</div>';
    }

    list.innerHTML = html;

    // 内置属性启用/禁用切换
    list.querySelectorAll('.cf-manage-item--builtin .cf-manage-item-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.bkey;
            const enabled = isBuiltinAttrEnabled(key);
            updateBuiltinAttrState(key, { enabled: !enabled });
            renderCfAttrList();
            showToast(enabled ? '已禁用内置属性' : '已启用内置属性');
        });
    });

    // 内置属性隐藏（"删除"）
    list.querySelectorAll('.cf-manage-item--builtin .cf-manage-item-del').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.bkey;
            const attr = ALL_MARKER_ATTRIBUTES.find(a => a.key === key);
            updateBuiltinAttrState(key, { hidden: true });
            renderCfAttrList();
            showToast('已隐藏「' + (attr ? attr.label : key) + '」');
        });
    });

    // 恢复隐藏的内置属性
    const restoreBtn = document.getElementById('cfRestoreBuiltin');
    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
            restoreAllBuiltinAttrs();
            renderCfAttrList();
            showToast('已恢复所有内置属性');
        });
    }

    // 启用/禁用切换（自定义属性）
    list.querySelectorAll('.cf-manage-item:not(.cf-manage-item--builtin) .cf-manage-item-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const defs = getCustomAttrDefs();
            const d = defs.find(x => x.key === key);
            if (!d) return;
            const newEnabled = d.enabled === false;
            updateCustomAttrDef(key, { enabled: newEnabled });
            renderCfAttrList();
            renderPreview();
            refreshInspectorIfOpen();
            showToast(newEnabled ? '已启用「' + d.label + '」' : '已禁用「' + d.label + '」');
        });
    });

    // 描述点击编辑
    list.querySelectorAll('.cf-manage-item-desc--editable').forEach(span => {
        span.addEventListener('click', async (e) => {
            e.stopPropagation();
            const key = span.dataset.key;
            const defs = getCustomAttrDefs();
            const d = defs.find(x => x.key === key);
            if (!d) return;
            const newDesc = await showPromptDialog('编辑属性描述', d.description || '', '属性说明');
            if (newDesc === null) return; // 取消
            updateCustomAttrDef(key, { description: newDesc.trim() });
            renderCfAttrList();
            showToast('描述已更新');
        });
    });

    // 删除按钮事件
    list.querySelectorAll('.cf-manage-item-del').forEach(btn => {
        btn.addEventListener('click', () => {
            removeCustomAttrDef(btn.dataset.key);
            renderCfAttrList();
            renderPreview();
            refreshInspectorIfOpen();
            showToast('已删除自定义属性');
        });
    });
}

/**
 * 从对话框添加自定义属性定义，校验重名
 */
function addCustomAttrFromDialog() {
    const label = document.getElementById('cfAttrLabel').value.trim();
    const desc = document.getElementById('cfAttrDesc').value.trim();
    if (!label) {
        showToast('请输入属性名');
        return;
    }
    // 检查是否已存在同名属性（内置 + 自定义）
    if (ALL_MARKER_ATTRIBUTES.some(a => a.label === label)) {
        showToast('与内置属性重名，请使用其他名称');
        return;
    }
    const defs = getCustomAttrDefs();
    if (defs.some(d => d.label === label)) {
        showToast('属性名已存在');
        return;
    }
    addCustomAttrDef(label, desc);
    document.getElementById('cfAttrLabel').value = '';
    document.getElementById('cfAttrDesc').value = '';
    renderCfAttrList();
    renderPreview();
    refreshInspectorIfOpen();
    showToast('已添加自定义属性「' + label + '」');
}

// 属性管理对话框事件
document.getElementById('cfAttrClose').addEventListener('click', closeCustomAttrManage);
document.getElementById('cfAttrCancel').addEventListener('click', closeCustomAttrManage);
document.getElementById('cfAttrAdd').addEventListener('click', addCustomAttrFromDialog);
document.getElementById('cfAttrLabel').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomAttrFromDialog(); }
});
document.getElementById('cfAttrDesc').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomAttrFromDialog(); }
});
document.getElementById('cfAttrBackdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCustomAttrManage();
});

// ===== 列选择 UI（已废弃，保留兼容性） =====

addTypeBtn.addEventListener('click', addCustomType);

exportExcelBottomBtn.addEventListener('click', exportExcel);
exportBtn.addEventListener('click', exportMarkedPDF);
exportBothBtn.addEventListener('click', exportBoth);

canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
});
canvas.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) { addLog('导入PDF...'); await importPDF(files); }
});

importBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).filter(f =>
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) { addLog('导入PDF...'); await importPDF(files); }
    fileInput.value = '';
});