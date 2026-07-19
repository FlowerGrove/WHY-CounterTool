let toastTimer = null;

function showToast(msg, spinner = false) {
    const el = document.getElementById('toast');
    el.innerHTML = (spinner ? '<i class="fa-solid fa-spinner fa-spin"></i> ' : '') + msg;
    el.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.remove('visible');
    }, 2200);
}

function hideToast() {
    const el = document.getElementById('toast');
    el.classList.remove('visible');
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
}

function clearAll() {
    if (pages.length === 0 && markers.length === 0) return;
    if (!confirm('确定要清空所有数据吗？此操作不可撤销。')) return;
    documents = [];
    pages = [];
    markers = [];
    usedNumbersByType.clear();
    history.length = 0;
    redoStack.length = 0;
    nextMarkerNumber = findNextNumberForType(currentTypeId);
    nextDocId = 1;
    panX = 0;
    panY = 0;
    zoom = 1;
    statsPanel.classList.remove('visible');
    statsToggle.classList.remove('active');
    syncNumberInput();
    updateUI();
    requestRender();
    updateUndoButtonState();
    clearAutosave();
    pendingRestore = null;
    document.getElementById('sessionBanner').classList.remove('visible');
}