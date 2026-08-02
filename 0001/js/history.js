/**
 * history.js - 历史记录与撤销/重做模块
 * 负责标记的增删改历史记录管理，支持 undo/redo 操作。
 */

const history = [];
const redoStack = [];

/**
 * 从标记数组中移除指定标记，并释放其编号
 * @param {Object} marker - 要移除的标记对象
 */
function removeMarkerFromArray(marker) {
    const idx = markers.indexOf(marker);
    if (idx !== -1) markers.splice(idx, 1);
    // 释放该编号，使其可被复用
    if (typeof marker.number === 'number' && marker.number > 0) {
        getUsedSet().delete(marker.number);
    }
    // DEBUG: 追踪删除
    console.log('[DEBUG removeMarker] 删除: ' + (marker.typeName || '?') + ' #' + marker.number +
        ' | markers剩余=' + markers.length +
        ' | usedNumbers=' + JSON.stringify([...getUsedSet()].sort((a,b)=>a-b)));
}

/**
 * 将标记插入到标记数组末尾，并占用其编号
 * @param {Object} marker - 要插入的标记对象
 */
function insertMarkerToArray(marker) {
    markers.push(marker);
    // 重新占用该编号
    if (typeof marker.number === 'number' && marker.number > 0) {
        getUsedSet().add(marker.number);
    }
}

/**
 * 将一条操作记录推入历史栈，同时清空重做栈
 * @param {Object} entry - 历史记录条目（包含 type、marker 等字段）
 */
function pushHistory(entry) {
    history.push(entry);
    redoStack.length = 0;
    updateUndoButtonState();
}

/**
 * 对单个标记应用/恢复单个字段的更新（如 tagNumber、sizeNote、note）
 * @param {Object} marker - 目标标记对象
 * @param {Object} entry - 包含 field、oldValue、newValue 等字段的历史条目
 * @param {boolean} toOld - true 表示恢复到旧值（撤销），false 表示应用新值（重做）
 */
function applyHistoryUpdate(marker, entry, toOld) {
    if (entry.field === 'tagNumber') {
        const v = toOld ? entry.oldValue : entry.newValue;
        marker.tagNumber = (v && v.length > 0) ? v : undefined;
    }
    if (entry.field === 'sizeNote') {
        const v = toOld ? entry.oldValue : entry.newValue;
        marker.sizeNote = (v && v.length > 0) ? v : undefined;
    }
    if (entry.field === 'note' || typeof entry.oldNote !== 'undefined' || typeof entry.newNote !== 'undefined') {
        const v = toOld ? entry.oldNote : entry.newNote;
        marker.note = (v && v.length > 0) ? v : undefined;
    }
}

/**
 * 批量更新：一次更新/恢复 marker 的多个字段
 * @param {Object} marker - 目标标记对象
 * @param {Object} entry - 包含 changes（旧值映射）和 after（新值映射）的历史条目
 * @param {boolean} toOld - true 表示恢复到旧值，false 表示应用新值
 */
function applyHistoryBulkUpdate(marker, entry, toOld) {
    const map = toOld ? entry.changes : entry.after;
    if (!map) return;
    for (const [field, val] of Object.entries(map)) {
        // 自定义属性（ca_ 前缀）需通过 setCustomAttrValue 设置到 marker.customAttrs 中
        if (field.startsWith('ca_')) {
            setCustomAttrValue(marker, field, val || '');
        } else if (typeof val === 'string' && val.length === 0) {
            marker[field] = undefined;
        } else {
            marker[field] = val;
        }
    }
}

/**
 * 撤销最近一次操作
 * 从历史栈中弹出最后一条记录，逆向执行操作（添加→删除、删除→添加、更新→恢复旧值）
 */
function undo() {
    if (history.length === 0) return;
    const last = history.pop();
    if (last.type === 'add') {
        removeMarkerFromArray(last.marker);
    } else if (last.type === 'delete') {
        insertMarkerToArray(last.marker);
    } else if (last.type === 'update') {
        applyHistoryUpdate(last.marker, last, true);
    } else if (last.type === 'bulkUpdate') {
        // 支持单标记 (marker) 和多标记 (markers) 两种形式
        if (last.markers) {
            last.markers.forEach((m, i) => {
                const changes = last.perMarkerChanges ? last.perMarkerChanges[i] : last.changes;
                const after = last.perMarkerAfter ? last.perMarkerAfter[i] : last.after;
                applyHistoryBulkUpdate(m, { changes, after }, true);
            });
        } else {
            applyHistoryBulkUpdate(last.marker, last, true);
        }
    }
    redoStack.push(last);
    addLog('撤销');
    nextMarkerNumber = findNextNumber();
    syncNumberInput();
    requestRender();
    updateUI();
    updateUndoButtonState();
    scheduleAutosave();
}

/**
 * 重做最近一次被撤销的操作
 * 从重做栈中弹出最后一条记录，重新执行该操作
 */
function redo() {
    if (redoStack.length === 0) return;
    const entry = redoStack.pop();
    if (entry.type === 'add') {
        insertMarkerToArray(entry.marker);
    } else if (entry.type === 'delete') {
        removeMarkerFromArray(entry.marker);
    } else if (entry.type === 'update') {
        applyHistoryUpdate(entry.marker, entry, false);
    } else if (entry.type === 'bulkUpdate') {
        if (entry.markers) {
            entry.markers.forEach((m, i) => {
                const changes = entry.perMarkerChanges ? entry.perMarkerChanges[i] : entry.changes;
                const after = entry.perMarkerAfter ? entry.perMarkerAfter[i] : entry.after;
                applyHistoryBulkUpdate(m, { changes, after }, false);
            });
        } else {
            applyHistoryBulkUpdate(entry.marker, entry, false);
        }
    }
    history.push(entry);
    addLog('重做');
    nextMarkerNumber = findNextNumber();
    syncNumberInput();
    requestRender();
    updateUI();
    updateUndoButtonState();
    scheduleAutosave();
}

/**
 * 删除指定标记，记录历史并更新 UI
 * @param {Object} marker - 要删除的标记对象
 */
function deleteMarker(marker) {
    removeMarkerFromArray(marker);
    pushHistory({ type: 'delete', marker });
    addLog('删除标记 #' + marker.number + ' (' + marker.typeName + ')');
    nextMarkerNumber = findNextNumber();
    syncNumberInput();
    requestRender();
    updateUI();
    scheduleAutosave();
}

/**
 * 在虚拟坐标 (vx, vy) 处查找最近的标记
 * 根据当前缩放级别计算命中半径，返回距离最近的标记（或 null）
 * @param {number} vx - 虚拟坐标 X
 * @param {number} vy - 虚拟坐标 Y
 * @returns {Object|null} 最近的标记对象，未找到则返回 null
 */
function findMarkerAtVirtual(vx, vy) {
    let found = null,
        bestDist = Infinity;
    const minScreenHit = 16;
    const hitRadius = Math.max(markerRadius, minScreenHit / zoom);
    for (const m of markers) {
        const dx = vx - m.vx,
            dy = vy - m.vy;
        const dist = Math.hypot(dx, dy);
        if (dist <= hitRadius && dist < bestDist) {
            bestDist = dist;
            found = m;
        }
    }
    return found;
}

/**
 * 根据历史栈和重做栈的状态，更新撤销/重做按钮的禁用状态
 */
function updateUndoButtonState() {
    undoBtn.disabled = history.length === 0;
    redoBtn.disabled = redoStack.length === 0;
}