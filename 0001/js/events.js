let mouseDownPos = null;
let mouseDownButton = -1;
let isDragging = false;
let dragStartX = 0,
    dragStartY = 0;
let dragPanStartX = 0,
    dragPanStartY = 0;

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

function handleCanvasTap(vx, vy) {
    if (pages.length === 0) {
        showToast('请先导入PDF文件');
        return;
    }
    
    if (polylineMode) {
        if (isPolylineComplete) {
            currentPolylinePoints = [];
            isPolylineComplete = false;
        }
        
        currentPolylinePoints.push({ x: vx, y: vy });
        
        const pointCount = currentPolylinePoints.length;
        
        if (pointCount === 1) {
            showToast('✓ 第1个点已设置（继续点击添加 / 双击完成）');
        } else {
            const totalMM = calculatePolylineTotalLength(currentPolylinePoints);
            
            if (pointCount === 2) {
                showToast(`📏 距离: ${totalMM} mm（可继续添加点形成多线段 / 双击完成）`);
            } else {
                showToast(`📐 已${pointCount}个点 | 总长: ${totalMM} mm（双击结束）`);
            }
        }
        
        requestRender();
    } else if (eraseMode) {
        const hit = findMarkerAtVirtual(vx, vy);
        if (hit) deleteMarker(hit);
    } else {
        addMarker(vx, vy);
    }
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
canvas.addEventListener('contextmenu', (e) => { if (isDragging) e.preventDefault(); });

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

eraserBtn.addEventListener('click', () => {
    eraseMode = !eraseMode;
    polylineMode = false;
    eraserBtn.classList.toggle('active', eraseMode);
    measureBtn.classList.toggle('active', false);
    canvas.classList.toggle('erase-mode', eraseMode);
    canvas.classList.toggle('measure-mode', false);
    currentPolylinePoints = [];
    isPolylineComplete = false;
    requestRender();
    showToast(eraseMode ? '橡皮擦模式：点击标记可删除' : '标记模式');
});

measureBtn.addEventListener('click', () => {
    polylineMode = !polylineMode;
    eraseMode = false;
    measureBtn.classList.toggle('active', polylineMode);
    eraserBtn.classList.toggle('active', false);
    canvas.classList.toggle('measure-mode', polylineMode);
    canvas.classList.toggle('erase-mode', false);
    
    if (polylineMode) {
        currentPolylinePoints = [];
        isPolylineComplete = false;
        showToast('📐 折线测量：点击画布开始');
    } else {
        currentPolylinePoints = [];
        isPolylineComplete = false;
        requestRender();
        showToast('标记模式');
    }
});

canvas.addEventListener('dblclick', (e) => {
    if (polylineMode && !isPolylineComplete && currentPolylinePoints.length >= 2) {
        e.preventDefault();
        completeCurrentPolyline();
    }
});

document.addEventListener('keydown', (e) => {
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
    isPolylineComplete = true;
    const totalMM = calculatePolylineTotalLength(currentPolylinePoints);
    const pointCount = currentPolylinePoints.length;
    
    if (pointCount === 2) {
        showToast(`✅ 单线段测量完成: ${totalMM} mm（继续点击开始新测量）`);
    } else {
        showToast(`✅ 多线段折线完成 (${pointCount}个点): 总长 ${totalMM} mm（继续点击开始新测量）`);
    }
    
    requestRender();
}

function cancelCurrentPolyline() {
    currentPolylinePoints = [];
    isPolylineComplete = false;
    showToast('已取消测量');
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
            const totalMM = calculatePolylineTotalLength(currentPolylinePoints);
            showToast(`已删除，当前${currentPolylinePoints.length}个点 | ${totalMM} mm`);
        }
        
        requestRender();
    }
}

clearBtn.addEventListener('click', clearAll);

settingsBtn.addEventListener('click', () => {
    settingPadDigits.value = String(settings.numberPadDigits);
    settingShowCaption.checked = settings.showPageCaption;
    settingCaptionName.checked = settings.captionShowName;
    settingCaptionSize.checked = settings.captionShowSize;
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
    settingsBackdrop.classList.remove('visible');
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