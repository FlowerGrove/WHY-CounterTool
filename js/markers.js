/**
 * markers.js - 标记管理模块
 * 负责标记的创建、位置校验、编号分配以及插入到标记数组。
 */

/**
 * 在虚拟坐标 (vx, vy) 处添加一个标记
 * 会检查与已有标记的最小距离，自动分配编号，并关联到命中的 PDF 页面
 * @param {number} vx - 虚拟坐标 X
 * @param {number} vy - 虚拟坐标 Y
 */
function addMarker(vx, vy) {
    const t = getCurrentType();

    for (const m of markers) {
        const dx = vx - m.vx, dy = vy - m.vy;
        if (Math.hypot(dx, dy) < MARKER_MIN_DIST) {
            showToast('距离过近，请稍远一点再标记');
            return;
        }
    }

    const nextNum = manualNumberSet ? nextMarkerNumber : findNextNumber();
    getUsedSet().add(nextNum);
    manualNumberSet = false;

    const marker = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        docId: null,
        pageIndex: 0,
        vx,
        vy,
        number: nextNum,
        color: currentColor,
        typeId: t.id,
        typeCode: t.code,
        typeName: t.name,
        typeFullName: t.fullName,
        typeAbbr: t.abbr,
        _globalOrder: ++_globalOrderCounter,
    };

    const hitPage = pages.find(p => {
        return vx >= p.vx && vx <= p.vx + p.width &&
               vy >= p.vy && vy <= p.vy + p.height;
    });
    if (hitPage) {
        marker.docId = hitPage.docId;
        marker.pageIndex = hitPage.pageIndex;
    }

    insertMarkerToArray(marker);
    nextMarkerNumber = findNextNumber();
    syncNumberInput();
    pushHistory({ type: 'add', marker });
    addLog('添加标记 #' + marker.number + ' (' + marker.typeName + ')');
    // DEBUG: 追踪标记创建顺序
    console.log('[DEBUG addMarker] 创建: ' + marker.typeName + ' #' + marker.number +
        ' | markers总数=' + markers.length +
        ' | usedNumbers=' + JSON.stringify([...usedNumbers].sort((a,b)=>a-b)));
    requestRender();
    updateUI();
    scheduleAutosave();
}