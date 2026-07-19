let pendingRestore = null;
let autosaveTimer = null;

function serializeMarkersForDoc(docId) {
    const pageMap = new Map(pages.filter(p => p.docId === docId).map(p => [p.pageIndex, p]));
    return markers.filter(m => m.docId === docId).map(m => {
        const pd = pageMap.get(m.pageIndex);
        return {
            pageIndex: m.pageIndex,
            localX: pd ? +(m.vx - pd.vx).toFixed(2) : m.vx,
            localY: pd ? +(m.vy - pd.vy).toFixed(2) : m.vy,
            number: m.number,
            color: m.color,
            typeCode: m.typeCode,
            typeName: m.typeName,
            typeFullName: m.typeFullName,
            typeAbbr: m.typeAbbr,
        };
    });
}

function buildAutosavePayload() {
    const customTypes = markerTypes
        .filter(t => t.id.startsWith('custom_'))
        .map(t => ({ name: t.name, fullName: t.fullName, color: t.color, abbr: t.abbr, code: t.code }));
    const docsPayload = documents
        .map(d => ({ fileName: d.fileName, pageCount: d.pageCount, markers: serializeMarkersForDoc(d.id) }))
        .filter(d => d.markers.length > 0);
    if (pendingRestore && Array.isArray(pendingRestore.docs)) {
        for (const d of pendingRestore.docs) {
            if (!docsPayload.some(x => x.fileName === d.fileName)) docsPayload.push(d);
        }
    }
    return { v: 1, savedAt: Date.now(), customTypes, docs: docsPayload };
}

function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        try {
            const payload = buildAutosavePayload();
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('自动保存失败', e);
        }
    }, AUTOSAVE_DEBOUNCE_MS);
}

function clearAutosave() {
    try {
        localStorage.removeItem(AUTOSAVE_KEY);
    } catch { /* ignore */ }
}

function checkPendingRestore() {
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.docs) || data.docs.length === 0) return;
        pendingRestore = data;
        const banner = document.getElementById('sessionBanner');
        const text = document.getElementById('sessionBannerText');
        text.textContent = `检测到上次未保存的标注记录（${data.docs.reduce((s, d) => s + (d.markers?.length || 0), 0)} 个标记）`;
        banner.classList.add('visible');
    } catch {
        clearAutosave();
    }
}

document.getElementById('sessionBannerDismiss').addEventListener('click', () => {
    document.getElementById('sessionBanner').classList.remove('visible');
});