/**
 * events.js - 事件处理与交互逻辑模块
 * 负责处理鼠标/触摸/键盘事件、标记右键属性面板、校准与测量交互、
 * 设置面板操作、自定义列/属性管理，以及导出功能的事件绑定。
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

/**
 * 根据口径下拉框的值切换自定义输入框的显隐状态
 */
function updateSizeCustomVisibility() {
    const field = document.getElementById('mcmSizeField');
    const sizeSel = document.getElementById('mcmSize');
    if (!field || !sizeSel) return;
    field.classList.toggle('mcm-field--custom-size', sizeSel.value === '__custom__');
}

/**
 * 根据量程下拉框的值切换自定义输入框的显隐状态
 */
function updateRangeCustomVisibility() {
    const field = document.getElementById('mcmRangeField');
    const rangeSel = document.getElementById('mcmRange');
    if (!field || !rangeSel) return;
    field.classList.toggle('mcm-field--custom-range', rangeSel.value === '__custom__');
}

/**
 * 渲染右键菜单中的自定义属性字段（仅渲染已启用的属性）
 * @param {Object} marker - 当前标记对象
 */
function renderMcmCustomFields(marker) {
    const container = document.getElementById('mcmCustomFields');
    if (!container) return;
    container.innerHTML = '';
    const attrs = getCustomAttrDefs().filter(d => d.enabled !== false);
    if (attrs.length === 0) return;
    attrs.forEach(attr => {
        const value = getCustomAttrValue(marker, attr.key);
        const field = document.createElement('div');
        field.className = 'mcm-field mcm-field--wide';
        field.innerHTML =
            '<label class="mcm-label">' + pvEscape(attr.label) + '</label>' +
            '<input type="text" class="mcm-input mcm-custom-attr" data-attr-key="' + attr.key + '" value="' + pvEscape(value) + '" />';
        container.appendChild(field);
    });
}

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

    // 根据是否进入 IO List 切换字段集
    const isIO = isTypeInIOList(marker.typeId);
    markerContextMenu.classList.toggle('menu-io', isIO);
    markerContextMenu.classList.toggle('menu-ins', !isIO);
    markerContextMenu.querySelectorAll('[data-menu]').forEach(el => {
        const menu = el.dataset.menu;
        el.style.display = (menu === 'both' || menu === (isIO ? 'io' : 'ins')) ? '' : 'none';
    });

    // 根据内置属性启用状态隐藏已禁用的字段
    const builtinFieldMap = {
        mcmTagNumber: 'tagNumber', mcmDcsTag: 'dcsTag', mcmLocation: 'location',
        mcmTypeFullName: 'typeFullName', mcmRevision: 'revision',
        mcmSize: 'sizeNote', mcmSizeField: 'sizeNote', mcmRange: 'range', mcmRangeField: 'range',
        mcmService: 'service', mcmProduct: 'product', mcmDataSheet: 'dataSheet',
        mcmPid: 'pid', mcmPidRev: 'pidRev', mcmNote: 'note',
        mcmIoType: 'ioType', mcmSignalType: 'signalType', mcmPower: 'power',
        mcmZeroStatus: 'zeroStatus', mcmOneStatus: 'oneStatus',
        mcmAlarmLL: 'alarmLL', mcmAlarmL: 'alarmL', mcmAlarmH: 'alarmH', mcmAlarmHH: 'alarmHH',
        mcmRange0: 'range0', mcmRange100: 'range100', mcmUnit: 'unit',
        mcmRioPanel: 'rioPanel', mcmSlotNumber: 'slotNumber', mcmChannelNumber: 'channelNumber',
        mcmCableNo: 'cableNo', mcmJunctionBox: 'junctionBox', mcmCableType: 'cableType',
    };
    for (const [elId, attrKey] of Object.entries(builtinFieldMap)) {
        const el = document.getElementById(elId);
        if (!el) continue;
        if (!isBuiltinAttrEnabled(attrKey)) {
            const field = el.closest('[data-menu]') || el.closest('.mcm-field');
            if (field) field.style.display = 'none';
        }
    }

    // 隐藏空的自定义 section
    const customSection = document.getElementById('mcmCustomSection');
    if (customSection) {
        const attrs = getCustomAttrDefs().filter(d => d.enabled !== false);
        customSection.style.display = attrs.length === 0 ? 'none' : '';
    }

    // ===== 公共字段 =====
    document.getElementById('mcmTagNumber').value = marker.tagNumber || '';
    document.getElementById('mcmLocation').value = marker.location || '';
    document.getElementById('mcmTypeFullName').value = marker.typeFullName || '';
    document.getElementById('mcmPid').value = marker.pid || '';
    document.getElementById('mcmNote').value = marker.note || '';

    // ===== INS 专属字段 =====
    const rawSize = String(marker.sizeNote || '');
    const sizeSel = document.getElementById('mcmSize');
    const sizeInput = document.getElementById('mcmSizeCustom');
    const sizeInput2 = document.getElementById('mcmSizeCustom2');
    const sizeParts = rawSize.replace(/[""]/g, '').split(/\s*[xX]\s*/);
    const sizeMain = sizeParts[0] || '';
    const sizeSec = sizeParts[1] || '';
    let sizeMatched = false;
    if (!sizeSec) {
        for (let i = 0; i < sizeSel.options.length; i++) {
            if (sizeSel.options[i].value && sizeSel.options[i].value === sizeMain) {
                sizeSel.value = sizeMain;
                sizeInput.value = '';
                sizeMatched = true;
                break;
            }
        }
    }
    if (!sizeMatched) {
        if (sizeMain) {
            sizeSel.value = '__custom__';
            sizeInput.value = sizeMain;
        } else {
            sizeSel.selectedIndex = -1;
        }
    }
    sizeInput2.value = sizeSec;
    updateSizeCustomVisibility();

    const rangeSel = document.getElementById('mcmRange');
    const rangeVal = String(marker.range || '');
    let rangeMatched = false;
    if (rangeVal) {
        for (let i = 0; i < rangeSel.options.length; i++) {
            const optVal = rangeSel.options[i].value;
            if (optVal && optVal !== '__custom__' && optVal === rangeVal) {
                rangeSel.value = rangeVal;
                rangeMatched = true;
                break;
            }
        }
    }
    if (!rangeMatched) {
        if (rangeVal) {
            rangeSel.value = '__custom__';
            document.getElementById('mcmRangeCustom').value = rangeVal;
        } else {
            rangeSel.selectedIndex = -1;
            document.getElementById('mcmRangeCustom').value = '';
        }
    } else {
        document.getElementById('mcmRangeCustom').value = '';
    }
    updateRangeCustomVisibility();
    document.getElementById('mcmService').value = marker.service || '';
    document.getElementById('mcmProduct').value = marker.product || '';
    document.getElementById('mcmDataSheet').value = marker.dataSheet || '';

    // ===== IO 专属字段 =====
    document.getElementById('mcmDcsTag').value = marker.dcsTag || '';
    document.getElementById('mcmRevision').value = marker.revision || '';
    document.getElementById('mcmPidRev').value = marker.pidRev || '';
    document.getElementById('mcmZeroStatus').value = marker.zeroStatus || '';
    document.getElementById('mcmOneStatus').value = marker.oneStatus || '';
    document.getElementById('mcmAlarmLL').value = marker.alarmLL || '';
    document.getElementById('mcmAlarmL').value = marker.alarmL || '';
    document.getElementById('mcmAlarmH').value = marker.alarmH || '';
    document.getElementById('mcmAlarmHH').value = marker.alarmHH || '';
    document.getElementById('mcmRange0').value = marker.range0 || '';
    document.getElementById('mcmRange100').value = marker.range100 || '';
    document.getElementById('mcmUnit').value = marker.unit || '';
    document.getElementById('mcmRioPanel').value = marker.rioPanel || '';
    document.getElementById('mcmSlotNumber').value = marker.slotNumber || '';
    document.getElementById('mcmChannelNumber').value = marker.channelNumber || '';
    document.getElementById('mcmCableNo').value = marker.cableNo || '';
    document.getElementById('mcmJunctionBox').value = marker.junctionBox || '';
    document.getElementById('mcmCableType').value = marker.cableType || '';

    // IO Type / Signal Type / Power
    const defs = (typeof getIOListSignalDefaults === 'function')
        ? getIOListSignalDefaults(marker.typeCode)
        : { ioType: '', signalType: '', power: '' };
    const ioTypeSel = document.getElementById('mcmIoType');
    const signalTypeSel = document.getElementById('mcmSignalType');
    const powerSel = document.getElementById('mcmPower');
    ioTypeSel.options[0].textContent = defs.ioType ? `自动推断 (${defs.ioType})` : '自动推断';
    signalTypeSel.options[0].textContent = defs.signalType ? `自动推断 (${defs.signalType})` : '自动推断';
    powerSel.options[0].textContent = defs.power ? `自动推断 (${defs.power})` : '自动推断';
    ioTypeSel.value = marker.ioType || '';
    signalTypeSel.value = marker.signalType || '';
    powerSel.value = marker.power || '';

    // 渲染自定义属性字段
    renderMcmCustomFields(marker);

    // 设置分组默认折叠状态：图纸备注和自定义默认折叠，核心分组展开
    const collapseSections = ['drawing', 'custom'];
    markerContextMenu.querySelectorAll('.mcm-section').forEach(section => {
        const hdr = section.querySelector('.mcm-section-hdr');
        const name = hdr ? hdr.dataset.section : null;
        section.classList.toggle('collapsed', name && collapseSections.includes(name));
    });
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

        // 校准阶段：计算正交投影预览点（Shift 按下时自由预览）
        if (measurePhase === 'calibrate' && calibratePoints.length === 1) {
            const p1 = calibratePoints[0];
            const sx = snap ? snap.x : v.x;
            const sy = snap ? snap.y : v.y;
            const shiftKey = window._shiftDown || false;
            const projected = shiftKey
                ? { x: sx, y: sy }
                : (() => {
                    const dx = Math.abs(sx - p1.x);
                    const dy = Math.abs(sy - p1.y);
                    return dx > dy
                        ? { x: sx, y: p1.y }
                        : { x: p1.x, y: sy };
                })();
            if (!calibratePreview || calibratePreview.x !== projected.x || calibratePreview.y !== projected.y) {
                calibratePreview = projected;
                requestRender();
            }
        }
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
        if (hit) {
            if (confirm(`确定删除标记「${hit.typeName || '?'} #${hit.number}」？`)) {
                addLog('删除标记');
                deleteMarker(hit);
            }
        }
    } else {
        addLog('添加标记');
        addMarker(vx, vy);
    }
}

/**
 * 校准阶段：处理点击事件，拾取两个校准点（正交约束）
 * 拾取完成后弹出距离输入对话框
 * @param {number} vx - 虚拟坐标 X
 * @param {number} vy - 虚拟坐标 Y
 */
function handleCalibrateTap(vx, vy) {
    if (calibratePoints.length === 0) {
        calibratePoints.push({ x: vx, y: vy });
        showToast('🎯 校准：已拾取第1点，移动鼠标点击第2点（自动水平/垂直对齐，按住Shift可自由放置）');
        requestRender();
    } else {
        // 第二点：Shift 按下时自由放置，否则正交投影
        const p1 = calibratePoints[0];
        const shiftKey = window._shiftDown || false;
        const projected = shiftKey
            ? { x: vx, y: vy }
            : (() => {
                const dx = Math.abs(vx - p1.x);
                const dy = Math.abs(vy - p1.y);
                return dx > dy
                    ? { x: vx, y: p1.y }
                    : { x: p1.x, y: vy };
            })();
        calibratePoints.push(projected);
        calibratePreview = null;
        requestRender();
        openCalibrateDialog();
    }
}

/**
 * 测量阶段：处理点击事件，连续添加折线点
 * 显示当前点数量和实时距离/面积信息
 * @param {number} vx - 虚拟坐标 X
 * @param {number} vy - 虚拟坐标 Y
 */
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

/**
 * 撤回测量：优先撤回当前未完成的点；若无点则撤回最后一个已完成的测量段
 */
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

/**
 * 一键清空所有测量段（不影响校准状态）
 */
function clearAllMeasurements() {
    if (measurePhase !== 'measure') {
        showToast('请先完成校准');
        return;
    }
    if (measurements.length === 0 && currentPolylinePoints.length === 0) {
        showToast('没有可清空的测量段');
        return;
    }
    pushHistory({ type: 'measureClear', measurements: measurements.slice() });
    currentPolylinePoints = [];
    isPolylineComplete = false;
    measurements = [];
    snapHint = null;
    addLog('清空所有测量段');
    updateMeasureUI();
    requestRender();
    showToast('🧹 已清空所有测量段');
}

// ===== 校准：用校准两点 + 输入真实距离 → 自动算比例尺 =====

// 常用工程比例（建筑/机械制图标准）
const ENGINEERING_SCALES = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 5000];

/**
 * 在常用工程比例列表中查找最接近原始计算比例的工程比例
 * @param {number} rawScale - 原始计算比例
 * @returns {{scale: number, error: number}|null} 匹配的工程比例及误差，误差超过3%则返回null
 */
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

/**
 * 实时更新校准弹窗中的原始比例和自动校准比例显示
 */
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

/**
 * 打开校准距离输入对话框，显示图纸测量尺寸
 */
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

/**
 * 应用校准：根据输入的真实距离计算比例尺，自动检测工程比例
 * 完成后进入测量阶段
 */
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
    addLog('校准完成: 比例 1:' + measureScale);
    const toastMsg = autoCalibrated
        ? `✅ 校准完成 1:${measureScale}（原值 1:${measureRawScale}，自动校准至工程比例）`
        : `✅ 校准完成 1:${measureScale}，现在开始测量（可随时撤回）`;
    showToast(toastMsg);
    requestRender();
}

/**
 * 取消校准：清除校准点，留在校准阶段重新拾取
 */
function cancelCalibration() {
    document.getElementById('calibrateBackdrop').classList.remove('visible');
    addLog('取消校准');
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
        // 拖拽防误触：移动超过 5px 视为拖拽，不触发点击
        const dx = upPos.x - mouseDownPos.x;
        const dy = upPos.y - mouseDownPos.y;
        if (Math.hypot(dx, dy) < 5) {
            const v = screenToVirtual(upPos.x, upPos.y);
            handleCanvasTap(v.x, v.y);
        }
    }
    mouseDownPos = null;
    mouseDownButton = -1;
    isDragging = false;
});

canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
// 右键完成当前测量段（替代双击，避免与 click 添加点冲突）
canvas.addEventListener('contextmenu', (e) => {
    console.log('[DEBUG contextmenu] 触发右键 | isDragging=' + isDragging + ' | polylineMode=' + polylineMode + ' | eraseMode=' + eraseMode + ' | markers.length=' + markers.length);
    if (isDragging) { e.preventDefault(); return; }

    // 标记模式下：右键已标记位置弹出备注菜单
    if (!polylineMode && !eraseMode) {
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

    if (polylineMode && measurePhase === 'measure' &&
        !isPolylineComplete && currentPolylinePoints.length >= 2) {
        e.preventDefault();
        completeCurrentPolyline();
    } else if (polylineMode) {
        // 测量模式下阻止默认右键菜单
        e.preventDefault();
    }
});

/**
 * 保存标记右键属性面板的更改，对比变更并记录到历史
 */
function saveMarkerContextMenu() {
    const marker = contextMenuTargetMarker;
    if (!marker) return;
    const updates = []; // 记录变更用于 history 合并

    function apply(field, newVal, allowEmptyStrAsUndef = true) {
        const clean = typeof newVal === 'string' ? newVal.trim() : newVal;
        const isEmpty = clean === '' || clean === null || clean === undefined;
        const finalVal = (isEmpty && allowEmptyStrAsUndef) ? undefined : (isEmpty ? '' : clean);
        const oldVal = marker[field] !== undefined ? marker[field] : '';
        const oldForCmp = (oldVal === undefined || oldVal === null) ? '' : String(oldVal);
        const newForCmp = (finalVal === undefined || finalVal === null) ? '' : String(finalVal);
        if (oldForCmp !== newForCmp) {
            updates.push({ field, oldValue: oldForCmp, newValue: newForCmp });
            marker[field] = finalVal;
        }
    }

    const tag = document.getElementById('mcmTagNumber').value;
    apply('tagNumber', tag);
    apply('location', document.getElementById('mcmLocation').value);
    apply('typeFullName', document.getElementById('mcmTypeFullName').value);

    // 口径：下拉 / 主框 / 次框 → 拼接为 sizeNote
    // 存储格式：'2'（同径）或 '2x3'（异径），不带引号
    const sizeSelEl = document.getElementById('mcmSize');
    const sizeSelVal = sizeSelEl.selectedIndex === -1 ? '' : (sizeSelEl.value === '__custom__' ? '' : sizeSelEl.value);
    const sizeCustomVal = document.getElementById('mcmSizeCustom').value.trim();
    const sizeCustom2Val = document.getElementById('mcmSizeCustom2').value.trim();
    const sizeMain = sizeSelVal || sizeCustomVal;
    const sizeNoteVal = sizeMain && sizeCustom2Val ? `${sizeMain}x${sizeCustom2Val}` : sizeMain;
    apply('sizeNote', sizeNoteVal);

    // 量程：下拉 / 自定义 → range
    const rangeSelEl = document.getElementById('mcmRange');
    const rangeSelVal = rangeSelEl.selectedIndex === -1 ? '' : (rangeSelEl.value === '__custom__' ? '' : rangeSelEl.value);
    const rangeCustomVal = document.getElementById('mcmRangeCustom').value.trim();
    apply('range', rangeSelVal || rangeCustomVal);

    apply('unit', document.getElementById('mcmUnit').value);
    apply('service', document.getElementById('mcmService').value);
    apply('product', document.getElementById('mcmProduct').value);
    apply('dataSheet', document.getElementById('mcmDataSheet').value);
    apply('pid', document.getElementById('mcmPid').value);
    apply('note', document.getElementById('mcmNote').value, false);

    // ===== IO List 专属字段 =====
    apply('dcsTag', document.getElementById('mcmDcsTag').value);
    apply('revision', document.getElementById('mcmRevision').value);
    apply('pidRev', document.getElementById('mcmPidRev').value);
    apply('ioType', document.getElementById('mcmIoType').value);
    apply('signalType', document.getElementById('mcmSignalType').value);
    apply('power', document.getElementById('mcmPower').value);
    apply('zeroStatus', document.getElementById('mcmZeroStatus').value);
    apply('oneStatus', document.getElementById('mcmOneStatus').value);
    apply('alarmLL', document.getElementById('mcmAlarmLL').value);
    apply('alarmL', document.getElementById('mcmAlarmL').value);
    apply('alarmH', document.getElementById('mcmAlarmH').value);
    apply('alarmHH', document.getElementById('mcmAlarmHH').value);
    apply('range0', document.getElementById('mcmRange0').value);
    apply('range100', document.getElementById('mcmRange100').value);
    apply('rioPanel', document.getElementById('mcmRioPanel').value);
    apply('slotNumber', document.getElementById('mcmSlotNumber').value);
    apply('channelNumber', document.getElementById('mcmChannelNumber').value);
    apply('cableNo', document.getElementById('mcmCableNo').value);
    apply('junctionBox', document.getElementById('mcmJunctionBox').value);
    apply('cableType', document.getElementById('mcmCableType').value);

    // ===== 自定义属性字段 =====
    const customAttrInputs = markerContextMenu.querySelectorAll('.mcm-custom-attr');
    customAttrInputs.forEach(input => {
        const attrKey = input.dataset.attrKey;
        if (!attrKey) return;
        const newVal = input.value.trim();
        const oldVal = getCustomAttrValue(marker, attrKey);
        if (oldVal !== newVal) {
            setCustomAttrValue(marker, attrKey, newVal.length > 0 ? newVal : '');
            updates.push({ field: attrKey, oldValue: oldVal, newValue: newVal, isCustomAttr: true });
        }
    });

    if (updates.length > 0) {
        addLog('保存标记属性');
        // 合并为一条 history 记录（用 oldValue/newValue 记录所有变更）
        const changes = Object.fromEntries(updates.map(u => [u.field, u.oldValue]));
        const after = Object.fromEntries(updates.map(u => [u.field, u.newValue]));
        pushHistory({ type: 'bulkUpdate', marker, changes, after });
        requestRender();
        scheduleAutosave();
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
    // 口径下拉切换：自定义时显示两个输入框，否则隐藏
    document.getElementById('mcmSize').addEventListener('change', function () {
        if (this.value !== '__custom__') {
            document.getElementById('mcmSizeCustom').value = '';
            document.getElementById('mcmSizeCustom2').value = '';
        }
        updateSizeCustomVisibility();
    });
    // 量程下拉切换：自定义时显示输入框
    document.getElementById('mcmRange').addEventListener('change', function () {
        if (this.value !== '__custom__') {
            document.getElementById('mcmRangeCustom').value = '';
        }
        updateRangeCustomVisibility();
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

// 分组折叠/展开切换
markerContextMenu.addEventListener('click', (e) => {
    const hdr = e.target.closest('.mcm-section-hdr');
    if (!hdr) return;
    const section = hdr.closest('.mcm-section');
    if (section) section.classList.toggle('collapsed');
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
    if (e.key === 'Shift') window._shiftDown = true;

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // 校准弹窗/设置面板中的输入框允许 Escape 关闭
        if (e.key === 'Escape') {
            if (document.getElementById('calibrateBackdrop').classList.contains('visible')) {
                e.preventDefault();
                cancelCalibration();
                return;
            }
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

/**
 * 统一管理模式 UI：测量时智能隐藏标记相关控件，切换工具栏按钮状态
 */
function updateModeUI() {
    document.body.classList.toggle('measure-active', polylineMode);
    measureBtn.classList.toggle('active', polylineMode);
    eraserBtn.classList.toggle('active', eraseMode);
    canvas.classList.toggle('measure-mode', polylineMode);
    canvas.classList.toggle('erase-mode', eraseMode);
    updateMeasureUI();
}

/**
 * 控制测量阶段相关 UI（撤回按钮、比例尺显示、汇总面板）
 */
function updateMeasureUI() {
    const showUndo = polylineMode && measurePhase === 'measure';
    measureUndoBtn.classList.toggle('visible', showUndo);
    updateMeasureScaleDisplay();
    updateMeasureSummary();
}

/**
 * 更新测量段汇总面板：渲染侧边统计面板中的测量段列表和汇总数据
 */
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

/**
 * 删除指定测量段，并重新编号保持连续性
 * @param {number} id - 测量段 ID
 */
function deleteMeasurement(id) {
    const idx = measurements.findIndex(m => m.id === id);
    if (idx === -1) return;
    const removed = measurements.splice(idx, 1)[0];
    // 重新编号（保持 M1/M2/... 连续）
    measurements.forEach((m, i) => { m.id = i + 1; });
    pushHistory({ type: 'measureDelete', measurement: removed });
    addLog('删除测量段');
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

/**
 * 更新工具栏校准比例尺显示，包括原始值和自动校准后的值
 */
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

// 保存校准状态，避免切换模式时丢失
let savedCalibration = null;

eraserBtn.addEventListener('click', () => {
    // 退出测量模式前保存校准状态
    if (polylineMode && measurePhase === 'measure') {
        savedCalibration = { measureMode, measureScale, measureRawScale };
    }
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
    addLog(eraseMode ? '切换橡皮擦模式' : '切换标记模式');
    showToast(eraseMode ? '橡皮擦模式：点击标记可删除' : '标记模式');
});

measureBtn.addEventListener('click', () => {
    polylineMode = !polylineMode;
    if (polylineMode) {
        eraseMode = false;
        currentPolylinePoints = [];
        isPolylineComplete = false;
        snapHint = null;
        // 恢复上次保存的校准状态
        if (savedCalibration && savedCalibration.measureScale > 1) {
            measureMode = savedCalibration.measureMode;
            measureScale = savedCalibration.measureScale;
            measureRawScale = savedCalibration.measureRawScale;
            measurePhase = 'measure';
            calibratePoints = [];
            calibratePreview = null;
            measurements = [];
            addLog('切换测量模式（已恢复校准）');
            showToast('📏 测量模式（已恢复上次校准比例 1:' + measureScale + '）');
        } else {
            // 进入测量模式：先校准，校准后测量
            measurePhase = 'calibrate';
            calibratePoints = [];
            calibratePreview = null;
            measurements = [];
            addLog('切换测量模式');
            if (pages.length === 0) { showToast('请先导入PDF文件'); }
            else { showToast('🎯 第一步·校准：点击两个已知距离的点（自动水平/垂直对齐）'); }
        }
    } else {
        // 退出测量模式前保存校准状态
        if (measurePhase === 'measure') {
            savedCalibration = { measureMode, measureScale, measureRawScale };
        }
        currentPolylinePoints = [];
        isPolylineComplete = false;
        measurements = [];
        snapHint = null;
        calibratePoints = [];
        calibratePreview = null;
        measureRawScale = null;
        measurePhase = 'calibrate';
        addLog('切换标记模式');
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
    addLog('重新校准');
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

/**
 * 完成当前折线测量段：存档测量数据，自动开始下一段
 */
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

    // 记录历史用于撤销
    pushHistory({ type: 'measureAdd', measurement });

    // 清空当前，自动开始下一段
    currentPolylinePoints = [];
    isPolylineComplete = false;

    const segLabel = `M${measurement.id}`;
    addLog('完成测量段 ' + segLabel);
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

/**
 * 取消当前折线测量，清除所有未完成的点
 */
function cancelCurrentPolyline() {
    currentPolylinePoints = [];
    isPolylineComplete = false;
    showToast('已取消测量');
    updateMeasureUI();
    requestRender();
}

/**
 * 删除折线最后一个点，更新实时距离/面积信息
 */
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
    // 页脚子设置显隐
    updateCaptionSubVisibility();
    // 折叠分组默认折叠
    ensureSectionCollapsed('settingMeasureStyleHdr', 'settingMeasureStyleBody');
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
    addLog('保存设置');
    settingsBackdrop.classList.remove('visible');
    updateMeasureUI();
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

// 折叠分组点击切换
document.getElementById('settingMeasureStyleHdr').addEventListener('click', (e) => toggleSection(e.currentTarget));

// 页脚开关联动子设置
settingShowCaption.addEventListener('change', updateCaptionSubVisibility);

// ===== 自定义列对话框 =====
/**
 * 打开自定义列添加对话框
 * @param {string} sheetName - 目标表格名称
 */
function openCustomFieldDialog(sheetName) {
    const dialog = document.getElementById('cfDialogBackdrop');
    const sheetSel = document.getElementById('cfSheet');
    const bindSel = document.getElementById('cfBindField');
    const labelInput = document.getElementById('cfLabel');

    sheetSel.value = sheetName;
    labelInput.value = '';

    // 填充绑定属性下拉
    bindSel.innerHTML = getAllBindableFields().map(f =>
        `<option value="${f.key}">${f.label}</option>`
    ).join('');

    dialog.hidden = false;
}

/**
 * 关闭自定义列添加对话框
 */
function closeCustomFieldDialog() {
    document.getElementById('cfDialogBackdrop').hidden = true;
}

/**
 * 从对话框添加自定义列定义
 */
function addCustomFieldFromDialog() {
    const sheetName = document.getElementById('cfSheet').value;
    const label = document.getElementById('cfLabel').value.trim();
    const bindField = document.getElementById('cfBindField').value;

    if (!label) {
        showToast('请输入列名');
        return;
    }

    addCustomFieldDef(sheetName, label, bindField);
    closeCustomFieldDialog();
    renderPreview();
    showToast(`已添加自定义列「${label}」`);
}

// 对话框事件
document.getElementById('cfDialogClose').addEventListener('click', closeCustomFieldDialog);
document.getElementById('cfDialogCancel').addEventListener('click', closeCustomFieldDialog);
document.getElementById('cfDialogAdd').addEventListener('click', addCustomFieldFromDialog);
document.getElementById('cfDialogBackdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCustomFieldDialog();
});

// ===== 自定义列管理对话框 =====
let cfManageSheet = 'detailList';

/**
 * 打开自定义列管理对话框
 */
function openCustomFieldManage() {
    cfManageSheet = 'detailList';
    document.querySelectorAll('#cfManageTabs .cf-manage-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.sheet === cfManageSheet);
    });
    renderCfManageList();
    document.getElementById('cfManageBackdrop').hidden = false;
}

/**
 * 关闭自定义列管理对话框
 */
function closeCustomFieldManage() {
    document.getElementById('cfManageBackdrop').hidden = true;
}

/**
 * 渲染自定义列管理列表，包含删除按钮事件绑定
 */
function renderCfManageList() {
    const list = document.getElementById('cfManageList');
    const defs = getCustomFieldDefs().filter(d => d.sheet === cfManageSheet);
    if (defs.length === 0) {
        list.innerHTML = '<div class="cf-manage-empty">暂无自定义列，点击表格表头的 + 按钮添加</div>';
        return;
    }
    const bindLabel = (key) => {
        const opt = MARKER_FIELD_OPTIONS.find(f => f.key === key);
        return opt ? opt.label : key;
    };
    list.innerHTML = defs.map(d => `
        <div class="cf-manage-item">
            <span class="cf-manage-item-label">${pvEscape(d.label)}</span>
            <span class="cf-manage-item-bind">← ${pvEscape(bindLabel(d.bindField))}</span>
            <button class="cf-manage-item-del" data-key="${d.key}" title="删除此列">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `).join('');

    // 删除按钮事件
    list.querySelectorAll('.cf-manage-item-del').forEach(btn => {
        btn.addEventListener('click', () => {
            removeCustomFieldDef(btn.dataset.key);
            renderCfManageList();
            renderPreview();
            showToast('已删除自定义列');
        });
    });
}

// 管理 tab 切换
document.getElementById('cfManageTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.cf-manage-tab');
    if (!tab) return;
    cfManageSheet = tab.dataset.sheet;
    document.querySelectorAll('#cfManageTabs .cf-manage-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.sheet === cfManageSheet);
    });
    renderCfManageList();
});

// 管理对话框事件
document.getElementById('cfManageClose').addEventListener('click', closeCustomFieldManage);
document.getElementById('cfManageCancel').addEventListener('click', closeCustomFieldManage);
document.getElementById('cfManageBackdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCustomFieldManage();
});

// 预览窗口管理按钮
document.getElementById('previewManageColsBtn').addEventListener('click', openCustomFieldManage);

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
 * 关闭仪表属性管理对话框，刷新预览
 */
function closeCustomAttrManage() {
    document.getElementById('cfAttrBackdrop').hidden = true;
    renderPreview();
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
    showToast('已添加自定义属性「' + label + '」');
}

// 属性管理对话框事件
const attrsBtn = document.getElementById('previewManageAttrsBtn');
if (attrsBtn) attrsBtn.addEventListener('click', openCustomAttrManage);
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

// IO List 类型选择按钮
const ioSelectBtn = document.getElementById('ioSelectBtn');
if (ioSelectBtn) ioSelectBtn.addEventListener('click', openIOSelectModal);

statsToggle.addEventListener('click', () => {
    const visible = statsPanel.classList.toggle('visible');
    statsToggle.classList.toggle('active', visible);
    addLog(visible ? '打开统计面板' : '关闭统计面板');
});

exportExcelBtn.addEventListener('click', exportExcel);
exportExcelBottomBtn.addEventListener('click', exportExcel);
exportBtn.addEventListener('click', exportMarkedPDF);
exportPdfFromStatsBtn.addEventListener('click', exportMarkedPDF);
exportBothBtn.addEventListener('click', exportBoth);

// 预览窗口事件绑定已移至 js/preview.js（直接读取内存数据，无需 iframe）

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

updateModeUI();