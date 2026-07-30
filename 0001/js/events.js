let mouseDownPos = null;
let mouseDownButton = -1;
let isDragging = false;
let dragStartX = 0,
    dragStartY = 0;
let dragPanStartX = 0,
    dragPanStartY = 0;

const markerContextMenu = document.getElementById('markerContextMenu');
let contextMenuTargetMarker = null;

function showMarkerContextMenu(screenX, screenY, marker) {
    contextMenuTargetMarker = marker;
    markerContextMenu.style.left = screenX + 'px';
    markerContextMenu.style.top = screenY + 'px';

    const hasNote = !!marker.note;
    const clearEl = document.getElementById('contextMenuClear');
    if (clearEl) clearEl.style.display = hasNote ? 'flex' : 'none';

    const hasTag = !!(marker.tagNumber && marker.tagNumber.length > 0);
    const clearTagEl = document.getElementById('contextMenuClearTag');
    if (clearTagEl) clearTagEl.style.display = hasTag ? 'flex' : 'none';

    const hasSize = !!(marker.sizeNote && marker.sizeNote.length > 0);
    const clearSizeEl = document.getElementById('contextMenuClearSize');
    if (clearSizeEl) clearSizeEl.style.display = hasSize ? 'flex' : 'none';

    markerContextMenu.classList.add('visible');
}

function hideMarkerContextMenu() {
    markerContextMenu.classList.remove('visible');
    contextMenuTargetMarker = null;
}

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
    } else if (polylineMode) {
        const pos = getEventPos(e);
        const v = screenToVirtual(pos.x, pos.y);

        // 端点捕捉提示
        const snap = findSnapPoint(v.x, v.y);
        if (snap) {
            if (!snapHint || snapHint.x !== snap.x || snapHint.y !== snap.y) {
                snapHint = snap;
                requestRender();
            }
        } else if (snapHint) {
            snapHint = null;
            requestRender();
        }

        // 校准阶段：计算正交投影预览点
        if (measurePhase === 'calibrate' && calibratePoints.length === 1) {
            const p1 = calibratePoints[0];
            const sx = snap ? snap.x : v.x;
            const sy = snap ? snap.y : v.y;
            const dx = Math.abs(sx - p1.x);
            const dy = Math.abs(sy - p1.y);
            // 正交约束：水平距离大则投影到水平线，否则投影到垂直线
            const projected = dx > dy
                ? { x: sx, y: p1.y }
                : { x: p1.x, y: sy };
            if (!calibratePreview || calibratePreview.x !== projected.x || calibratePreview.y !== projected.y) {
                calibratePreview = projected;
                requestRender();
            }
        }
    }
});

function handleCanvasTap(vx, vy) {
    if (pages.length === 0) {
        showToast('请先导入PDF文件');
        return;
    }

    // 端点捕捉（测量模式内置，始终启用）
    if (polylineMode) {
        const snap = findSnapPoint(vx, vy);
        if (snap) { vx = snap.x; vy = snap.y; }
    }

    if (polylineMode) {
        if (measurePhase === 'calibrate') {
            handleCalibrateTap(vx, vy);
        } else {
            handleMeasureTap(vx, vy);
        }
    } else if (eraseMode) {
        const hit = findMarkerAtVirtual(vx, vy);
        if (hit) deleteMarker(hit);
    } else {
        addMarker(vx, vy);
    }
}

// ===== 校准阶段：点击两点（正交约束）+ 输入真实距离 =====

function handleCalibrateTap(vx, vy) {
    if (calibratePoints.length === 0) {
        calibratePoints.push({ x: vx, y: vy });
        showToast('🎯 校准：已拾取第1点，移动鼠标点击第2点（自动水平/垂直对齐）');
        requestRender();
    } else {
        // 第二点使用正交投影
        const p1 = calibratePoints[0];
        const dx = Math.abs(vx - p1.x);
        const dy = Math.abs(vy - p1.y);
        const projected = dx > dy
            ? { x: vx, y: p1.y }
            : { x: p1.x, y: vy };
        calibratePoints.push(projected);
        calibratePreview = null;
        requestRender();
        openCalibrateDialog();
    }
}

// ===== 测量阶段：连续点击添加点 =====

function handleMeasureTap(vx, vy) {
    currentPolylinePoints.push({ x: vx, y: vy });

    const pointCount = currentPolylinePoints.length;

    if (pointCount === 1) {
        showToast('✓ 第1个点已设置（继续点击添加 / 右键完成）');
    } else {
        const totalLen = calculatePolylineTotalLength(currentPolylinePoints);
        if (pointCount === 2) {
            showToast(`📏 距离: ${totalLen.text} ${totalLen.unit}（可继续添加点 / 右键完成）`);
        } else {
            const areaFmt = calculatePolylineArea(currentPolylinePoints);
            showToast(`📐 已${pointCount}个点 | 总长: ${totalLen.text} ${totalLen.unit} | 面积: ${areaFmt.text} ${areaFmt.unit}（右键结束）`);
        }
    }

    updateMeasureUI();
    requestRender();
}

// 撤回测量：优先撤回当前未完成的点；当前无点时撤回最后一个完成的测量段
function undoLastMeasurePoint() {
    if (measurePhase !== 'measure') return;

    // 1) 当前进行中有點 → 撤回最后一个点
    if (currentPolylinePoints.length > 0) {
        currentPolylinePoints.pop();
        const n = currentPolylinePoints.length;
        if (n === 0) {
            showToast('已撤回所有点');
        } else if (n === 1) {
            showToast('已撤回，剩余1个点');
        } else {
            const totalLen = calculatePolylineTotalLength(currentPolylinePoints);
            showToast(`已撤回，剩余${n}个点 | 总长: ${totalLen.text} ${totalLen.unit}`);
        }
        requestRender();
        return;
    }

    // 2) 当前无点但存在已完成段 → 撤回最后一段（恢复为可编辑状态）
    if (measurements.length === 0) {
        showToast('没有可撤回的测量');
        return;
    }
    const last = measurements.pop();
    currentPolylinePoints = last.points;
    isPolylineComplete = false;
    showToast(`已撤回 M${last.id}，可继续编辑或重新完成`);
    updateMeasureUI();
    requestRender();
}

// 一键清空所有测量段（不影响校准）
function clearAllMeasurements() {
    if (measurePhase !== 'measure') {
        showToast('请先完成校准');
        return;
    }
    currentPolylinePoints = [];
    isPolylineComplete = false;
    measurements = [];
    snapHint = null;
    updateMeasureUI();
    requestRender();
    showToast('🧹 已清空所有测量段');
}

// ===== 校准：用校准两点 + 输入真实距离 → 自动算比例尺 =====

// 常用工程比例（建筑/机械制图标准）
const ENGINEERING_SCALES = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 5000];

// 在 ±3% 误差范围内查找最接近的工程比例
function findClosestEngineeringScale(rawScale) {
    if (!rawScale || rawScale <= 0) return null;
    let best = null;
    let bestErr = Infinity;
    for (const s of ENGINEERING_SCALES) {
        const err = Math.abs(s - rawScale) / rawScale;
        if (err < bestErr) {
            bestErr = err;
            best = s;
        }
    }
    if (bestErr <= 0.03) {
        return { scale: best, error: bestErr };
    }
    return null;
}

// 实时更新校准弹窗中的原值/自动校准显示
function updateCalibratePreview() {
    const raw = parseFloat(document.getElementById('calibrateRealValue').value);
    const unit = document.getElementById('calibrateUnit').value;
    const rawScaleEl = document.getElementById('calibrateRawScale');
    const autoRow = document.getElementById('calibrateAutoRow');
    const autoScaleEl = document.getElementById('calibrateAutoScale');

    if (!raw || raw <= 0 || calibratePoints.length < 2) {
        rawScaleEl.textContent = '1:—';
        autoRow.style.display = 'none';
        return;
    }

    const p1 = calibratePoints[0];
    const p2 = calibratePoints[1];
    const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const drawingMM = pixelsToDrawingMM(pixelDist);
    const realMM = unit === 'm' ? raw * 1000 : raw;
    const scale = realMM / drawingMM;
    const rounded = Math.round(scale * 100) / 100;

    rawScaleEl.textContent = `1:${rounded}`;

    const matched = findClosestEngineeringScale(scale);
    if (matched && matched.scale !== rounded) {
        autoRow.style.display = 'flex';
        autoScaleEl.textContent = `1:${matched.scale}`;
    } else {
        autoRow.style.display = 'none';
    }
}

function openCalibrateDialog() {
    if (calibratePoints.length < 2) return;
    const p1 = calibratePoints[0];
    const p2 = calibratePoints[1];
    const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const drawingMM = pixelsToDrawingMM(pixelDist);
    document.getElementById('calibrateMeasured').textContent = drawingMM.toFixed(2) + ' mm（图纸尺寸）';
    document.getElementById('calibrateRealValue').value = '';
    calibrateAppliedScale = null;
    updateCalibratePreview();
    document.getElementById('calibrateBackdrop').classList.add('visible');
    setTimeout(() => document.getElementById('calibrateRealValue').focus(), 50);
}

function applyCalibration() {
    const raw = parseFloat(document.getElementById('calibrateRealValue').value);
    if (!raw || raw <= 0) {
        showToast('请输入有效的真实距离');
        return;
    }
    const unit = document.getElementById('calibrateUnit').value;
    const p1 = calibratePoints[0];
    const p2 = calibratePoints[1];
    const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const drawingMM = pixelsToDrawingMM(pixelDist);
    const realMM = unit === 'm' ? raw * 1000 : raw;
    const rawScale = realMM / drawingMM;

    // 保存原始测量比例（用于显示）
    measureRawScale = Math.round(rawScale * 100) / 100;

    // 自动检测并采用工程比例（误差≤±3%）
    const matched = findClosestEngineeringScale(rawScale);
    const finalScale = (matched && matched.scale !== measureRawScale)
        ? matched.scale
        : measureRawScale;

    measureScale = finalScale;
    measureMode = 'real';
    settings.measureMode = measureMode;
    settings.measureScale = measureScale;
    saveSettings();

    document.getElementById('calibrateBackdrop').classList.remove('visible');

    // 校准完成 → 进入测量阶段
    calibratePoints = [];
    calibratePreview = null;
    measurePhase = 'measure';
    currentPolylinePoints = [];
    isPolylineComplete = false;
    updateMeasureUI();
    const autoCalibrated = measureRawScale !== null && measureRawScale !== measureScale;
    const toastMsg = autoCalibrated
        ? `✅ 校准完成 1:${measureScale}（原值 1:${measureRawScale}，自动校准至工程比例）`
        : `✅ 校准完成 1:${measureScale}，现在开始测量（可随时撤回）`;
    showToast(toastMsg);
    requestRender();
}

function cancelCalibration() {
    document.getElementById('calibrateBackdrop').classList.remove('visible');
    // 取消校准：清除校准点，留在校准阶段重新拾取
    calibratePoints = [];
    calibratePreview = null;
    updateMeasureUI();
    requestRender();
    showToast('已取消，请重新拾取校准点');
}

document.addEventListener('mouseup', (e) => {
    if (e.button === 1 && isDragging && mouseDownPos) {
        canvas.classList.remove('grabbing');
        requestRender();
    } else if (e.button === 0 && mouseDownPos) {
        const upPos = getEventPos(e);
        const v = screenToVirtual(upPos.x, upPos.y);
        handleCanvasTap(v.x, v.y);
    }
    mouseDownPos = null;
    mouseDownButton = -1;
    isDragging = false;
});

canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
// 右键完成当前测量段（替代双击，避免与 click 添加点冲突）
canvas.addEventListener('contextmenu', (e) => {
    if (isDragging) { e.preventDefault(); return; }

    // 标记模式下：右键已标记位置弹出备注菜单
    if (!polylineMode && !eraseMode) {
        const pos = getEventPos(e);
        const v = screenToVirtual(pos.x, pos.y);
        const hit = findMarkerAtVirtual(v.x, v.y);
        if (hit) {
            e.preventDefault();
            showMarkerContextMenu(e.clientX, e.clientY, hit);
            return;
        }
    }

    if (polylineMode && measurePhase === 'measure' &&
        !isPolylineComplete && currentPolylinePoints.length >= 2) {
        e.preventDefault();
        completeCurrentPolyline();
    } else if (polylineMode) {
        // 测量模式下阻止默认右键菜单
        e.preventDefault();
    }
});

// 标记右键菜单交互
markerContextMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-action]');
    if (!item || !contextMenuTargetMarker) return;

    const action = item.dataset.action;
    const marker = contextMenuTargetMarker;

    if (action === 'cancel') {
        // 直接关闭菜单
    } else if (action === 'tagNumber') {
        const curTag = marker.tagNumber || '';
        const tag = prompt('输入仪表编号（例：001 或 0101 或 0201）', curTag);
        if (tag !== null) {
            const oldTag = marker.tagNumber || '';
            const newTag = tag.trim();
            if (oldTag !== newTag) {
                pushHistory({ type: 'update', marker, field: 'tagNumber', oldValue: oldTag, newValue: newTag });
                marker.tagNumber = newTag || undefined;
                requestRender();
                scheduleAutosave();
            }
        }
    } else if (action === 'clearTag') {
        if (marker.tagNumber) {
            pushHistory({ type: 'update', marker, field: 'tagNumber', oldValue: marker.tagNumber, newValue: '' });
            marker.tagNumber = undefined;
            requestRender();
            scheduleAutosave();
        }
    } else if (action === 'sizeNote') {
        const curSize = marker.sizeNote || '';
        const size = prompt('输入尺寸编号（例：3" 或 3" ANSI 300# RF），仅尺寸将自动拼接 ANSI 150# RF', curSize);
        if (size !== null) {
            const oldSize = marker.sizeNote || '';
            const newSize = size.trim();
            if (oldSize !== newSize) {
                pushHistory({ type: 'update', marker, field: 'sizeNote', oldValue: oldSize, newValue: newSize });
                marker.sizeNote = newSize || undefined;
                requestRender();
                scheduleAutosave();
            }
        }
    } else if (action === 'clearSize') {
        if (marker.sizeNote) {
            pushHistory({ type: 'update', marker, field: 'sizeNote', oldValue: marker.sizeNote, newValue: '' });
            marker.sizeNote = undefined;
            requestRender();
            scheduleAutosave();
        }
    } else if (action === 'note') {
        const note = prompt('输入通用备注', marker.note || '');
        if (note !== null) {
            const oldNote = marker.note || '';
            const newNote = note.trim();
            if (oldNote !== newNote) {
                pushHistory({ type: 'update', marker, field: 'note', oldNote, newNote });
                marker.note = newNote || undefined;
                requestRender();
                scheduleAutosave();
            }
        }
    } else if (action === 'clear') {
        if (marker.note) {
            pushHistory({ type: 'update', marker, field: 'note', oldNote: marker.note, newNote: '' });
            marker.note = undefined;
            requestRender();
            scheduleAutosave();
        }
    } else if (action.startsWith('pipe-')) {
        // 常用尺寸快捷点击：仅存纯尺寸（如 3"），Excel 导出时再拼接 ANSI 150# RF
        const pipeSize = item.textContent.trim();
        const oldSize = marker.sizeNote || '';
        if (oldSize !== pipeSize) {
            pushHistory({ type: 'update', marker, field: 'sizeNote', oldValue: oldSize, newValue: pipeSize });
            marker.sizeNote = pipeSize;
            requestRender();
            scheduleAutosave();
        }
    } else if (action === 'delete') {
        hideMarkerContextMenu();
        deleteMarker(marker);
        return;
    }

    hideMarkerContextMenu();
});

// 点击其他地方关闭菜单
document.addEventListener('click', (e) => {
    if (!markerContextMenu.contains(e.target)) {
        hideMarkerContextMenu();
    }
});

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
            handleCanvasTap(v.x, v.y);
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
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
    }
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
            syncNumberInput();
        }
    }
});

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

// 统一管理模式 UI：测量时智能隐藏标记相关控件
function updateModeUI() {
    document.body.classList.toggle('measure-active', polylineMode);
    measureBtn.classList.toggle('active', polylineMode);
    eraserBtn.classList.toggle('active', eraseMode);
    canvas.classList.toggle('measure-mode', polylineMode);
    canvas.classList.toggle('erase-mode', eraseMode);
    updateMeasureUI();
}

// 控制测量阶段相关 UI（撤回按钮、比例尺显示、汇总）
function updateMeasureUI() {
    const showUndo = polylineMode && measurePhase === 'measure';
    measureUndoBtn.classList.toggle('visible', showUndo);
    updateMeasureScaleDisplay();
    updateMeasureSummary();
}

// 更新测量段汇总：渲染侧边统计面板
function updateMeasureSummary() {
    const panel = document.getElementById('measurePanel');
    if (!panel) return;

    if (!polylineMode || measurePhase !== 'measure') {
        panel.classList.remove('visible');
        return;
    }
    panel.classList.add('visible');

    const listEl = document.getElementById('measureList');
    const countBadge = document.getElementById('measureCountBadge');
    const totalEl = document.getElementById('measureTotal');
    const currentHint = document.getElementById('measureCurrentHint');

    const segCount = measurements.length;
    countBadge.textContent = `${segCount} 段`;

    // 渲染段列表
    if (segCount === 0) {
        listEl.innerHTML = `<div class="measure-panel__empty">
            <i class="fa-solid fa-ruler"></i>
            未测量<br><span style="font-size:10px;color:#bbb;">点击画布添加点，右键完成一段</span>
        </div>`;
    } else {
        const items = measurements.map(m => {
                const lenFmt = formatLength(m.totalLenPixels);
                const pointCount = m.points.length;
                const typeText = pointCount === 2 ? '线段' : `${pointCount}点`;
                const areaHtml = (m.areaPixels !== null && m.areaPixels > 0)
                    ? `<span class="measure-card__stat-item area"><span class="label">▣</span><span class="value">${formatArea(m.areaPixels).text} ${formatArea(m.areaPixels).unit}</span></span>`
                    : '';
                return `<div class="measure-card" data-id="${m.id}">
                    <span class="measure-card__label">M${m.id}</span>
                    <span class="measure-card__type">${typeText}</span>
                    <div class="measure-card__stats">
                        <span class="measure-card__stat-item"><span class="label">📏</span><span class="value">${lenFmt.text} ${lenFmt.unit}</span></span>
                        ${areaHtml}
                    </div>
                    <button class="measure-card__delete" data-del="${m.id}" title="删除此段"><i class="fa-solid fa-xmark"></i></button>
                </div>`;
            }).join('');
        listEl.innerHTML = items;
    }

    // 当前进行中段提示
    if (currentPolylinePoints.length > 0) {
        currentHint.style.display = 'block';
        currentHint.textContent = `编辑中：已 ${currentPolylinePoints.length} 点（右键完成）`;
    } else {
        currentHint.style.display = 'none';
    }

    // 底部汇总
    if (segCount === 0) {
        totalEl.style.display = 'none';
    } else {
        let totalLenPixels = 0;
        let totalAreaPixels = 0;
        let hasArea = false;
        for (const m of measurements) {
            totalLenPixels += m.totalLenPixels;
            if (m.areaPixels !== null && m.areaPixels > 0) {
                totalAreaPixels += m.areaPixels;
                hasArea = true;
            }
        }
        const totalLen = formatLength(totalLenPixels);
        let html = `<div class="measure-panel__total-row">
            <span class="label">合计总长</span>
            <span class="value">${totalLen.text} ${totalLen.unit}</span>
        </div>`;
        if (hasArea) {
            const totalArea = formatArea(totalAreaPixels);
            html += `<div class="measure-panel__total-row area">
                <span class="label">合计面积</span>
                <span class="value">${totalArea.text} ${totalArea.unit}</span>
            </div>`;
        }
        totalEl.innerHTML = html;
        totalEl.style.display = 'flex';
    }
}

// 删除指定测量段
function deleteMeasurement(id) {
    const idx = measurements.findIndex(m => m.id === id);
    if (idx === -1) return;
    measurements.splice(idx, 1);
    // 重新编号（保持 M1/M2/... 连续）
    measurements.forEach((m, i) => { m.id = i + 1; });
    updateMeasureUI();
    requestRender();
    showToast(`已删除该测量段`);
}

// 侧边面板删除按钮事件委托
document.getElementById('measurePanel').addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
        e.stopPropagation();
        deleteMeasurement(parseInt(delBtn.dataset.del, 10));
    }
});

// 更新工具栏校准比例尺显示
function updateMeasureScaleDisplay() {
    if (!polylineMode) return;
    const rawRow = document.getElementById('measureScaleRaw');
    const calibratedRow = document.getElementById('measureScaleCalibrated');
    
    if (measurePhase === 'calibrate') {
        rawRow.querySelector('.measure-scale-value').textContent = '待校准';
        calibratedRow.querySelector('.measure-scale-value').textContent = '待校准';
        measureScaleDisplay.classList.add('unset');
        measureScaleDisplay.classList.remove('auto-calibrated');
    } else if (measureMode === 'real') {
        const rawText = measureRawScale !== null ? `1:${measureRawScale}` : `1:${measureScale}`;
        const calibratedText = `1:${measureScale}`;
        rawRow.querySelector('.measure-scale-value').textContent = rawText;
        calibratedRow.querySelector('.measure-scale-value').textContent = calibratedText;
        
        measureScaleDisplay.classList.remove('unset');
        // 自动校准状态：原值与校准值不同时高亮显示
        const isAutoCalibrated = measureRawScale !== null && measureRawScale !== measureScale;
        measureScaleDisplay.classList.toggle('auto-calibrated', isAutoCalibrated);
    } else {
        rawRow.querySelector('.measure-scale-value').textContent = '1:1';
        calibratedRow.querySelector('.measure-scale-value').textContent = '1:1';
        measureScaleDisplay.classList.remove('unset');
        measureScaleDisplay.classList.remove('auto-calibrated');
    }
}

eraserBtn.addEventListener('click', () => {
    eraseMode = !eraseMode;
    polylineMode = false;
    currentPolylinePoints = [];
    isPolylineComplete = false;
    snapHint = null;
    calibratePoints = [];
    calibratePreview = null;
    measureRawScale = null;
    measurePhase = 'calibrate';
    updateModeUI();
    requestRender();
    showToast(eraseMode ? '橡皮擦模式：点击标记可删除' : '标记模式');
});

measureBtn.addEventListener('click', () => {
    polylineMode = !polylineMode;
    if (polylineMode) {
        eraseMode = false;
        currentPolylinePoints = [];
        isPolylineComplete = false;
        measurements = [];
        snapHint = null;
        // 进入测量模式：先校准，校准后测量
        measurePhase = 'calibrate';
        calibratePoints = [];
        calibratePreview = null;
        if (pages.length === 0) { showToast('请先导入PDF文件'); }
        else { showToast('🎯 第一步·校准：点击两个已知距离的点（自动水平/垂直对齐）'); }
    } else {
        currentPolylinePoints = [];
        isPolylineComplete = false;
        measurements = [];
        snapHint = null;
        calibratePoints = [];
        calibratePreview = null;
        measureRawScale = null;
        measurePhase = 'calibrate';
        requestRender();
        showToast('标记模式');
    }
    updateModeUI();
});

measureUndoBtn.addEventListener('click', undoLastMeasurePoint);
clearMeasureBtn.addEventListener('click', clearAllMeasurements);

// 重新校准：清除当前测量和已存档段，回到校准阶段
recalibrateBtn.addEventListener('click', () => {
    if (!polylineMode) return;
    calibratePoints = [];
    calibratePreview = null;
    currentPolylinePoints = [];
    isPolylineComplete = false;
    measurements = []; // 重新校准意味着比例尺变化，旧测量段失真
    snapHint = null;
    measureRawScale = null;
    measurePhase = 'calibrate';
    updateMeasureUI();
    requestRender();
    showToast('🎯 重新校准：点击两个已知距离的点（自动水平/垂直对齐）');
});

document.getElementById('calibrateSaveBtn').addEventListener('click', applyCalibration);
document.getElementById('calibrateCancelBtn').addEventListener('click', cancelCalibration);
document.getElementById('calibrateCloseBtn').addEventListener('click', cancelCalibration);
document.getElementById('calibrateBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'calibrateBackdrop') cancelCalibration();
});
document.getElementById('calibrateRealValue').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyCalibration(); }
});

// 实时计算原校准值 / 自动校准显示
document.getElementById('calibrateRealValue').addEventListener('input', updateCalibratePreview);
document.getElementById('calibrateUnit').addEventListener('change', updateCalibratePreview);

document.addEventListener('keydown', (e) => {
    if (markerContextMenu.classList.contains('visible')) {
        if (e.key === 'Escape') {
            e.preventDefault();
            hideMarkerContextMenu();
        }
        return;
    }

    if (polylineMode && !isPolylineComplete) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (currentPolylinePoints.length >= 2) {
                completeCurrentPolyline();
            } else {
                showToast('至少需要2个点才能完成测量');
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelCurrentPolyline();
        } else if ((e.key === 'Backspace' || e.key === 'Delete') &&
                   currentPolylinePoints.length > 0) {
            e.preventDefault();
            removeLastPolylinePoint();
        }
    }
});

function completeCurrentPolyline() {
    const pointCount = currentPolylinePoints.length;
    if (pointCount < 2) return;

    const totalLen = calculatePolylineTotalLength(currentPolylinePoints);
    const areaFmt = pointCount >= 3 ? calculatePolylineArea(currentPolylinePoints) : null;

    // 计算像素值用于汇总
    let totalLenPixels = 0;
    for (let i = 0; i < currentPolylinePoints.length - 1; i++) {
        totalLenPixels += calculateDistance(currentPolylinePoints[i], currentPolylinePoints[i + 1]);
    }
    const areaPixels = pointCount >= 3 ? calculatePolygonArea(currentPolylinePoints) : null;

    // 存档当前测量段
    // 记录第一个点所在页面，用于 PDF 导出定位
    const firstPt = currentPolylinePoints[0];
    const hitPage = pages.find(p =>
        firstPt.x >= p.vx && firstPt.x <= p.vx + p.width &&
        firstPt.y >= p.vy && firstPt.y <= p.vy + p.height
    );
    const measurement = {
        id: measurements.length + 1,
        points: currentPolylinePoints.slice(),
        totalLenPixels: totalLenPixels,
        areaPixels: areaPixels,
        docId: hitPage ? hitPage.docId : null,
        pageIndex: hitPage ? hitPage.pageIndex : null
    };
    measurements.push(measurement);

    // 清空当前，自动开始下一段
    currentPolylinePoints = [];
    isPolylineComplete = false;

    const segLabel = `M${measurement.id}`;
    let toastMsg;
    if (pointCount === 2) {
        toastMsg = `✅ ${segLabel} 完成: ${totalLen.text} ${totalLen.unit}（已自动开始下一段）`;
    } else if (areaFmt !== null) {
        toastMsg = `✅ ${segLabel} 完成 (${pointCount}点): 总长 ${totalLen.text} ${totalLen.unit} | 面积 ${areaFmt.text} ${areaFmt.unit}（已自动开始下一段）`;
    } else {
        toastMsg = `✅ ${segLabel} 完成 (${pointCount}点): 总长 ${totalLen.text} ${totalLen.unit}（已自动开始下一段）`;
    }
    showToast(toastMsg);

    updateMeasureUI();
    requestRender();
}

function cancelCurrentPolyline() {
    currentPolylinePoints = [];
    isPolylineComplete = false;
    showToast('已取消测量');
    updateMeasureUI();
    requestRender();
}

function removeLastPolylinePoint() {
    if (currentPolylinePoints.length > 0) {
        currentPolylinePoints.pop();

        if (currentPolylinePoints.length === 0) {
            showToast('已清除所有点');
        } else if (currentPolylinePoints.length === 1) {
            showToast(`已删除，剩余1个点`);
        } else {
            const totalLen = calculatePolylineTotalLength(currentPolylinePoints);
            const areaFmt = currentPolylinePoints.length >= 3 ? calculatePolylineArea(currentPolylinePoints) : null;
            if (areaFmt !== null) {
                showToast(`已删除，当前${currentPolylinePoints.length}个点 | ${totalLen.text} ${totalLen.unit} | ${areaFmt.text} ${areaFmt.unit}`);
            } else {
                showToast(`已删除，当前${currentPolylinePoints.length}个点 | ${totalLen.text} ${totalLen.unit}`);
            }
        }

        updateMeasureUI();
        requestRender();
    }
}

clearBtn.addEventListener('click', clearAll);

settingsBtn.addEventListener('click', () => {
    settingPadDigits.value = String(settings.numberPadDigits);
    settingShowCaption.checked = settings.showPageCaption;
    settingCaptionName.checked = settings.captionShowName;
    settingCaptionSize.checked = settings.captionShowSize;
    settingMeasureMode.value = measureMode;
    settingMeasureScale.value = measureScale;
    // 回填测量标注样式
    settingMeasureShowSegmentLen.checked = settings.measureShowSegmentLen !== false;
    settingMeasureShowArea.checked = settings.measureShowArea !== false;
    settingMeasureShowSegLabel.checked = settings.measureShowSegLabel !== false;
    settingMeasureShowHatch.checked = settings.measureShowHatch !== false;
    settingMeasureLabelFontSize.value = settings.measureLabelFontSize || 13;
    settingMeasureHatchSpacing.value = settings.measureHatchSpacing || 8;
    settingMeasureHatchOpacity.value = settings.measureHatchOpacity != null ? settings.measureHatchOpacity : 0.35;
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
    measureMode = settingMeasureMode.value;
    measureScale = Math.max(1, parseFloat(settingMeasureScale.value) || 1);
    measureRawScale = null;
    settings.measureMode = measureMode;
    settings.measureScale = measureScale;
    // 测量标注样式设置
    settings.measureShowSegmentLen = settingMeasureShowSegmentLen.checked;
    settings.measureShowArea = settingMeasureShowArea.checked;
    settings.measureShowSegLabel = settingMeasureShowSegLabel.checked;
    settings.measureShowHatch = settingMeasureShowHatch.checked;
    settings.measureLabelFontSize = parseInt(settingMeasureLabelFontSize.value, 10) || 13;
    settings.measureHatchSpacing = parseInt(settingMeasureHatchSpacing.value, 10) || 8;
    settings.measureHatchOpacity = parseFloat(settingMeasureHatchOpacity.value) || 0.35;
    saveSettings();
    settingsBackdrop.classList.remove('visible');
    updateMeasureUI();
    requestRender();
});

settingsBackdrop.addEventListener('click', (e) => {
    if (e.target === settingsBackdrop) {
        settingsBackdrop.classList.remove('visible');
    }
});

addTypeBtn.addEventListener('click', addCustomType);

statsToggle.addEventListener('click', () => {
    const visible = statsPanel.classList.toggle('visible');
    statsToggle.classList.toggle('active', visible);
});

exportExcelBtn.addEventListener('click', exportExcel);
exportExcelBottomBtn.addEventListener('click', exportExcel);
exportBtn.addEventListener('click', exportMarkedPDF);
exportPdfFromStatsBtn.addEventListener('click', exportMarkedPDF);
exportBothBtn.addEventListener('click', exportBoth);

// 测量数据导出（独立于仪表标记导出）
exportMeasureExcelBtn.addEventListener('click', exportMeasureExcel);
exportMeasurePdfBtn.addEventListener('click', exportMeasurePdf);

canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
});
canvas.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) await importPDF(files);
});

importBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).filter(f =>
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) await importPDF(files);
    fileInput.value = '';
});

updateModeUI();