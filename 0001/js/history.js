const history = [];
const redoStack = [];

function removeMarkerFromArray(marker) {
    const idx = markers.indexOf(marker);
    if (idx !== -1) markers.splice(idx, 1);
    releaseNumber(marker.number, marker.typeId);
}

function insertMarkerToArray(marker) {
    reserveNumber(marker.number, marker.typeId);
    markers.push(marker);
}

function pushHistory(entry) {
    history.push(entry);
    redoStack.length = 0;
    updateUndoButtonState();
}

function undo() {
    if (history.length === 0) return;
    const last = history.pop();
    if (last.type === 'add') {
        removeMarkerFromArray(last.marker);
    } else if (last.type === 'delete') {
        insertMarkerToArray(last.marker);
    }
    redoStack.push(last);
    nextMarkerNumber = findNextNumberForType(currentTypeId);
    syncNumberInput();
    requestRender();
    updateUI();
    updateUndoButtonState();
    scheduleAutosave();
}

function redo() {
    if (redoStack.length === 0) return;
    const entry = redoStack.pop();
    if (entry.type === 'add') {
        insertMarkerToArray(entry.marker);
    } else if (entry.type === 'delete') {
        removeMarkerFromArray(entry.marker);
    }
    history.push(entry);
    nextMarkerNumber = findNextNumberForType(currentTypeId);
    syncNumberInput();
    requestRender();
    updateUI();
    updateUndoButtonState();
    scheduleAutosave();
}

function deleteMarker(marker) {
    removeMarkerFromArray(marker);
    pushHistory({ type: 'delete', marker });
    nextMarkerNumber = findNextNumberForType(currentTypeId);
    syncNumberInput();
    requestRender();
    updateUI();
    scheduleAutosave();
}

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

function updateUndoButtonState() {
    undoBtn.disabled = history.length === 0;
    redoBtn.disabled = redoStack.length === 0;
}