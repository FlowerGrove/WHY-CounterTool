/**
 * 测量和校准模块 - 处理测量流程、校准流程、UI 更新
 */

// ===== 校准阶段：点击两点（正交约束）+ 输入真实距离 =====

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

// ===== 测量段完成/取消/删除 =====

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

// ===== 测量 UI 更新 =====

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

// ===== 测量模式切换按钮 =====

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

// ===== 校准弹窗按钮 =====
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

// ===== 测量键盘事件 =====
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

// 侧边面板删除按钮事件委托
document.getElementById('measurePanel').addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
        e.stopPropagation();
        deleteMeasurement(parseInt(delBtn.dataset.del, 10));
    }
});