/**
 * autosave.js - 自动保存与恢复模块
 * 负责将标记数据序列化到 localStorage，支持会话恢复和自动保存防抖。
 */

let pendingRestore = null;
let autosaveTimer = null;

// marker 上可持久化的可选字段（值为空则不写入 autosave）
const MARKER_OPTIONAL_FIELDS = [
    'tagNumber', 'sizeNote', 'note',
    'location', 'range', 'unit', 'service', 'product', 'dataSheet', 'pid',
    'dcsTag', 'pidRev', 'ioType', 'signalType', 'power',
    'zeroStatus', 'oneStatus', 'alarmLL', 'alarmL', 'alarmH', 'alarmHH',
    'range0', 'range100', 'rioPanel', 'slotNumber', 'channelNumber',
    'cableNo', 'junctionBox', 'cableType',
];

/**
 * 将指定文档的所有标记序列化为可持久化的对象数组
 * 坐标转换为相对于页面左上角的本地坐标
 * @param {string} docId - 文档 ID
 * @returns {Object[]} 序列化后的标记数组
 */
function serializeMarkersForDoc(docId) {
    const pageMap = new Map(pages.filter(p => p.docId === docId).map(p => [p.pageIndex, p]));
    return markers.filter(m => m.docId === docId).map(m => {
        const pd = pageMap.get(m.pageIndex);
        const obj = {
            pageIndex: m.pageIndex,
            localX: pd ? +(m.vx - pd.vx).toFixed(2) : m.vx,
            localY: pd ? +(m.vy - pd.vy).toFixed(2) : m.vy,
            number: m.number,
            color: m.color,
            typeCode: m.typeCode,
            typeName: m.typeName,
            typeFullName: m.typeFullName,
            typeAbbr: m.typeAbbr,
            _globalOrder: m._globalOrder,
        };
        for (const f of MARKER_OPTIONAL_FIELDS) {
            const v = m[f];
            if (v !== undefined && v !== null && String(v).length > 0) obj[f] = v;
        }
        // 序列化自定义属性（对象类型，需特殊处理）
        if (m.customAttrs && Object.keys(m.customAttrs).length > 0) {
            obj.customAttrs = { ...m.customAttrs };
        }
        return obj;
    });
}

/**
 * 构建完整的自动保存数据负载
 * 包含自定义类型、各文档的标记数据、IO List 选中状态以及待恢复数据
 * @returns {Object} 自动保存的数据对象
 */
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
    // IO List 选中的类型 ID（null=全选，数组=指定类型）
    const ioListSelected = ioListSelectedIds === null ? null : Array.from(ioListSelectedIds);
    return { v: 1, savedAt: Date.now(), customTypes, docs: docsPayload, ioListSelected };
}

/**
 * 安排自动保存（带防抖）
 * 在指定延迟后将当前标记数据写入 localStorage
 */
function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        try {
            const payload = buildAutosavePayload();
            const count = markers.length;
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
            addLog('自动保存: ' + count + '个标记');
        } catch (e) {
            console.warn('自动保存失败', e);
        }
    }, AUTOSAVE_DEBOUNCE_MS);
}

/**
 * 清除 localStorage 中的自动保存数据
 */
function clearAutosave() {
    try {
        localStorage.removeItem(AUTOSAVE_KEY);
    } catch { /* ignore */ }
}

/**
 * 检查是否存在待恢复的上次会话数据
 * 如果 localStorage 中有未保存的标记数据，则显示恢复提示横幅
 */
function checkPendingRestore() {
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.docs) || data.docs.length === 0) return;
        pendingRestore = data;
        const totalMarkers = data.docs.reduce((s, d) => s + (d.markers?.length || 0), 0);
        addLog('检测到上次未保存的标注记录: ' + totalMarkers + '个标记');
        const banner = document.getElementById('sessionBanner');
        const text = document.getElementById('sessionBannerText');
        text.textContent = `检测到上次未保存的标注记录（${totalMarkers} 个标记）`;
        banner.classList.add('visible');
    } catch {
        clearAutosave();
    }
}

document.getElementById('sessionBannerDismiss').addEventListener('click', () => {
    document.getElementById('sessionBanner').classList.remove('visible');
});