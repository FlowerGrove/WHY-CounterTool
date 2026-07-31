/**
 * 右键菜单模块 - 处理标记的属性编辑面板
 */

const markerContextMenu = document.getElementById('markerContextMenu');
let contextMenuTargetMarker = null;

// 口径字段：根据下拉是否"自定义"切换两个输入框的显隐
function updateSizeCustomVisibility() {
    const field = document.getElementById('mcmSizeField');
    const sizeSel = document.getElementById('mcmSize');
    if (!field || !sizeSel) return;
    field.classList.toggle('mcm-field--custom-size', sizeSel.value === '__custom__');
}

// 量程字段：根据下拉是否"自定义"切换输入框的显隐
function updateRangeCustomVisibility() {
    const field = document.getElementById('mcmRangeField');
    const rangeSel = document.getElementById('mcmRange');
    if (!field || !rangeSel) return;
    field.classList.toggle('mcm-field--custom-range', rangeSel.value === '__custom__');
}

// 显示右键属性面板：填充当前标记值到表单
function showMarkerContextMenu(screenX, screenY, marker) {
    contextMenuTargetMarker = marker;

    // 标题显示类型 + 编号
    const t = getTypeById(marker.typeId);
    const typeLabel = t.name || marker.typeName || '';
    const numberLabel = marker.number ? `-${padWithFormat(marker.number)}` : '';
    document.getElementById('mcmTitle').textContent = `标记属性：${typeLabel}${numberLabel}`;

    // 根据是否进入 IO List 切换字段集：io=IO List 表格字段，ins=明细清单字段
    const isIO = isTypeInIOList(marker.typeId);
    markerContextMenu.classList.toggle('menu-io', isIO);
    markerContextMenu.classList.toggle('menu-ins', !isIO);
    markerContextMenu.querySelectorAll('[data-menu]').forEach(el => {
        const menu = el.dataset.menu;
        el.style.display = (menu === 'both' || menu === (isIO ? 'io' : 'ins')) ? '' : 'none';
    });

    // ===== 公共字段 =====
    document.getElementById('mcmTagNumber').value = marker.tagNumber || '';
    document.getElementById('mcmLocation').value = marker.location || '';
    document.getElementById('mcmPid').value = marker.pid || '';
    document.getElementById('mcmNote').value = marker.note || '';

    // ===== INS 专属字段（明细清单） =====
    // 口径：解析 sizeNote → 下拉 / 主框 / 次框
    // 存储格式：'2'（裸数字）或 '2x3'（异径）；旧数据 '2"' / '2"x3"' 也兼容
    const rawSize = String(marker.sizeNote || '');
    const sizeSel = document.getElementById('mcmSize');
    const sizeInput = document.getElementById('mcmSizeCustom');
    const sizeInput2 = document.getElementById('mcmSizeCustom2');
    // 去掉引号后按 x/X 拆分为主/次
    const sizeParts = rawSize.replace(/[""]/g, '').split(/\s*[xX]\s*/);
    const sizeMain = sizeParts[0] || '';
    const sizeSec = sizeParts[1] || '';
    // 优先匹配下拉预设（同径）
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
            // 非空但不匹配任何下拉项 → 自定义
            sizeSel.value = '__custom__';
            sizeInput.value = sizeMain;
        } else {
            // sizeMain 为空时：下拉保持空选择状态
            sizeSel.selectedIndex = -1;
        }
    }
    sizeInput2.value = sizeSec;
    updateSizeCustomVisibility();
    // Range：匹配预设 → 下拉选中；否则 → 自定义
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

    // ===== IO 专属字段（IO List 表格字段） =====
    document.getElementById('mcmDcsTag').value = marker.dcsTag || '';
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

    // IO Type / Signal Type / Power：空值=自动推断，下拉首项显示当前推断值
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

    // 位置：优先出现在鼠标点击点，超出视口则回推
    // 强制清除 resize 遗留的尺寸：先关 resize → 清尺寸 → 重排 → 再开 resize
    markerContextMenu.style.resize = 'none';
    markerContextMenu.style.width = '';
    markerContextMenu.style.height = '';
    void markerContextMenu.offsetHeight; // 强制重排
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

function hideMarkerContextMenu() {
    markerContextMenu.classList.remove('visible');
    contextMenuTargetMarker = null;
}

// 保存标记右键属性面板的更改
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
    apply('note', document.getElementById('mcmNote').value);

    // ===== IO List 专属字段 =====
    apply('dcsTag', document.getElementById('mcmDcsTag').value);
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

    if (updates.length > 0) {
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
    // 关闭按钮
    document.getElementById('mcmCloseBtn').addEventListener('click', () => {
        hideMarkerContextMenu();
    });
    // 删除按钮
    document.getElementById('mcmDeleteBtn').addEventListener('click', () => {
        const m = contextMenuTargetMarker;
        hideMarkerContextMenu();
        if (m) deleteMarker(m);
    });
    // 取消
    document.getElementById('mcmCancelBtn').addEventListener('click', () => {
        hideMarkerContextMenu();
    });
    // 确定
    document.getElementById('mcmOkBtn').addEventListener('click', () => {
        saveMarkerContextMenu();
        hideMarkerContextMenu();
    });
    // 面板内输入框回车 = 确定（尺寸输入框除外，防止误触）
    markerContextMenu.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveMarkerContextMenu();
            hideMarkerContextMenu();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideMarkerContextMenu();
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

// 点击菜单外关闭
document.addEventListener('click', (e) => {
    if (!markerContextMenu.classList.contains('visible')) return;
    if (!markerContextMenu.contains(e.target)) {
        hideMarkerContextMenu();
    }
});