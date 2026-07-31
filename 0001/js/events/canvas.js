/**
 * 画布交互模块 - 处理鼠标、触摸、滚轮等交互事件
 */

let mouseDownPos = null;
let mouseDownButton = -1;
let isDragging = false;
let dragStartX = 0,
    dragStartY = 0;
let dragPanStartX = 0,
    dragPanStartY = 0;

let touchStartPos = null;
let touchStartPanX = 0,
    touchStartPanY = 0;
let isTouchDragging = false;
let lastTouchDist = 0;
let isPinching = false;

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

// ===== 触摸事件 =====
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

// ===== 滚轮事件 =====
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

// ===== 键盘事件（撤销/重做） =====
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

// ===== 拖拽导入 PDF =====
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