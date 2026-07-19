function addMarker(vx, vy) {
    const t = getCurrentType();
    const num = parseInt(numberInput.value, 10);
    if (isNaN(num) || num < 1 || num > MAX_MARKER_NUMBER) {
        showToast(`编号无效，请输入 1-${MAX_MARKER_NUMBER}`);
        return;
    }
    if (isNumberUsed(num)) {
        showToast(`编号 ${formatMarkerNumber(num)} 已被使用`);
        return;
    }

    for (const m of markers) {
        const dx = vx - m.vx, dy = vy - m.vy;
        if (Math.hypot(dx, dy) < MARKER_MIN_DIST) {
            showToast('距离过近，请稍远一点再标记');
            return;
        }
    }

    const marker = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        docId: null,
        pageIndex: 0,
        vx,
        vy,
        number: num,
        color: currentColor,
        typeId: t.id,
        typeCode: t.code,
        typeName: t.name,
        typeFullName: t.fullName,
        typeAbbr: t.abbr,
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
    pushHistory({ type: 'add', marker });
    nextMarkerNumber = findNextNumberForType(currentTypeId);
    syncNumberInput();
    requestRender();
    updateUI();
    scheduleAutosave();
}