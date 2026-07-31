'use strict';

// 预览窗口：直接读取主页内存中的 markers/documents/markerTypes，渲染为表格
// 不依赖 localStorage 中转，数据永远是当前最新状态

// ===== 工具：HTML 转义 + 单元格构造 =====
function pvEscape(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function pvCell(text, cls) {
    const c = cls ? ` class="${cls}"` : '';
    if (text === null || text === undefined || String(text).length === 0) {
        return `<td${c} class="cell-empty"></td>`;
    }
    return `<td${c}>${pvEscape(text)}</td>`;
}

function pvRow(cells, cls) {
    return `<tr class="${cls || ''}">${cells}</tr>`;
}

// Process Connection 拼接（与 export-excel.js 一致）
function pvBuildConnection(m) {
    if (!m.sizeNote) return '';
    const s = formatSizeNote(m.sizeNote);
    const res = window.INSTRUMENT_RESOURCES;
    if (res && res.hasConnectionKeyword(s)) return s;
    if (res) {
        const t = getTypeById(m.typeId);
        const abbr = m.typeAbbr || (t && t.abbr) || '';
        return s + ' ' + res.getConnectionSuffix(abbr);
    }
    return s;
}

// ===== Sheet 1: By File =====
function pvRenderByFile() {
    const table = document.getElementById('pvTable-byFile');
    const isSingleMultiPageDoc =
        documents.length === 1 && documents[0] && documents[0].pageCount > 1;

    let html = '';
    if (isSingleMultiPageDoc) {
        html = `<thead><tr><th>Page</th><th>Type</th><th>Description</th><th>Count</th></tr></thead><tbody>`;
        const doc = documents[0];
        html += pvRow(
            `<td class="row-title">📄 ${pvEscape(doc.fileName)}</td><td></td><td></td><td class="cell-number">${markers.length} markers</td>`,
            'row-title'
        );
        html += pvRow('<td colspan="4"></td>');

        const byPage = new Map();
        for (const m of markers) {
            if (!byPage.has(m.pageIndex)) byPage.set(m.pageIndex, []);
            byPage.get(m.pageIndex).push(m);
        }
        for (const pageIndex of [...byPage.keys()].sort((a, b) => a - b)) {
            const pageMarkers = byPage.get(pageIndex);
            html += pvRow(
                `<td class="row-title">Page ${pageIndex}</td><td></td><td></td><td class="cell-number">${pageMarkers.length}</td>`,
                'row-title'
            );
            const typeCounts = new Map();
            for (const m of pageMarkers) {
                if (!typeCounts.has(m.typeId)) {
                    typeCounts.set(m.typeId, { count: 0, name: m.typeName, fullName: m.typeFullName || '' });
                }
                typeCounts.get(m.typeId).count++;
                if (m.typeFullName) typeCounts.get(m.typeId).fullName = m.typeFullName;
            }
            for (const [, tc] of typeCounts) {
                html += pvRow(`<td></td>${pvCell(tc.name)}${pvCell(tc.fullName)}<td class="cell-number">${tc.count}</td>`);
            }
            html += pvRow('<td colspan="4"></td>');
        }
    } else {
        html = `<thead><tr><th>File</th><th>Type</th><th>Description</th><th>Count</th></tr></thead><tbody>`;
        const byDoc = new Map();
        for (const m of markers) {
            if (!byDoc.has(m.docId)) byDoc.set(m.docId, []);
            byDoc.get(m.docId).push(m);
        }
        const docOrder = documents.map(d => d.id).filter(id => byDoc.has(id));
        for (const id of byDoc.keys()) {
            if (!docOrder.includes(id)) docOrder.push(id);
        }
        for (const docId of docOrder) {
            const list = byDoc.get(docId);
            const fileName = getDocFileName(docId);
            const counts = new Map();
            for (const m of list) {
                const key = m.typeId || 'other';
                if (!counts.has(key)) {
                    counts.set(key, { count: 0, name: m.typeName, fullName: m.typeFullName || '' });
                }
                const entry = counts.get(key);
                entry.count++;
                if (m.typeFullName) entry.fullName = m.typeFullName;
            }
            const typeRows = [];
            for (const t of markerTypes) {
                const c = counts.get(t.id);
                if (c) typeRows.push({ name: t.name, fullName: c.fullName || t.fullName || '', count: c.count });
            }
            for (const [id, c] of counts) {
                if (!markerTypes.some(t => t.id === id)) {
                    typeRows.push({ name: c.name || id, fullName: c.fullName || '', count: c.count });
                }
            }
            typeRows.forEach((r, idx) => {
                html += pvRow(
                    (idx === 0 ? `<td class="row-title">${pvEscape(fileName)}</td>` : '<td></td>') +
                    pvCell(r.name) + pvCell(r.fullName) + `<td class="cell-number">${r.count}</td>`
                );
            });
            html += pvRow(
                `<td></td><td class="row-subtotal">Subtotal</td><td></td><td class="cell-number row-subtotal">${list.length}</td>`,
                'row-subtotal'
            );
            html += pvRow('<td colspan="4"></td>');
        }
    }
    html += pvRow(
        `<td class="row-grand">Grand Total</td><td></td><td></td><td class="cell-number row-grand">${markers.length}</td>`,
        'row-grand'
    );
    html += '</tbody>';
    table.innerHTML = html;
}

// ===== Sheet 2: Type Summary =====
function pvRenderTypeSummary() {
    const table = document.getElementById('pvTable-typeSummary');
    const typeCounts = new Map();
    for (const m of markers) {
        const key = m.typeId || 'other';
        if (!typeCounts.has(key)) {
            typeCounts.set(key, { count: 0, name: m.typeName, fullName: m.typeFullName || '' });
        }
        const entry = typeCounts.get(key);
        entry.count++;
        if (m.typeFullName) entry.fullName = m.typeFullName;
    }

    let html = `<thead><tr><th>Type</th><th>Description</th><th>Count</th></tr></thead><tbody>`;
    for (const t of markerTypes) {
        const c = typeCounts.get(t.id);
        if (!c) continue;
        html += pvRow(
            pvCell(c.name || t.name) + pvCell(c.fullName || t.fullName || '') + `<td class="cell-number">${c.count}</td>`
        );
    }
    for (const [id, c] of typeCounts) {
        if (markerTypes.some(t => t.id === id)) continue;
        html += pvRow(pvCell(c.name || id) + pvCell(c.fullName || '') + `<td class="cell-number">${c.count}</td>`);
    }
    html += pvRow(
        `<td class="row-grand">Total</td><td></td><td class="cell-number row-grand">${markers.length}</td>`,
        'row-grand'
    );
    html += '</tbody>';
    table.innerHTML = html;
}

// 标记排序：文件名 → 类型名 → 编号
function pvSortedMarkers() {
    return [...markers].sort((a, b) => {
        const fa = getDocFileName(a.docId);
        const fb = getDocFileName(b.docId);
        if (fa !== fb) return fa.localeCompare(fb, 'zh');
        if (a.typeName !== b.typeName) return (a.typeName || '').localeCompare(b.typeName || '', 'zh');
        return (a.number || 0) - (b.number || 0);
    });
}

// ===== Sheet 3: Detail List =====
function pvRenderDetail() {
    const table = document.getElementById('pvTable-detail');
    const sorted = pvSortedMarkers();
    let html = `<thead><tr>
        <th>S/N</th><th>Tag No.</th><th>Location</th><th>Instrument Type</th>
        <th>Process Connection</th><th>Size / Calibration Range</th>
        <th>Service</th><th>Product</th><th>Data Sheet No.</th>
        <th>P &amp; ID Dwg No.</th><th>Remarks</th><th>List</th>
    </tr></thead><tbody>`;

    sorted.forEach((m, i) => {
        const listType = isTypeInIOList(m.typeId) ? 'IO' : 'INS';
        const listTag = `<span class="list-tag ${listType.toLowerCase()}">${listType}</span>`;
        const t = getTypeById(m.typeId);
        const typeDesc = m.typeFullName || (t && t.fullName) || m.typeName || t.name || '';
        html += pvRow(
            `<td class="cell-number">${i + 1}</td>` +
            pvCell(formatMarkerLabel(m), 'cell-number') +
            pvCell(m.location) + pvCell(typeDesc) + pvCell(pvBuildConnection(m)) +
            pvCell(m.range) + pvCell(m.service) + pvCell(m.product) +
            pvCell(m.dataSheet) + pvCell(m.pid) + pvCell(m.note) +
            `<td>${listTag}</td>`
        );
    });
    html += '</tbody>';
    table.innerHTML = html;
}

// ===== Sheet 4: IO List =====
function pvRenderIOList() {
    const tbody = document.getElementById('pvIoListBody');
    const filtered = markers.filter(m => isTypeInIOList(m.typeId));
    const sorted = [...filtered].sort((a, b) => {
        const fa = getDocFileName(a.docId);
        const fb = getDocFileName(b.docId);
        if (fa !== fb) return fa.localeCompare(fb, 'zh');
        if (a.typeName !== b.typeName) return (a.typeName || '').localeCompare(b.typeName || '', 'zh');
        return (a.number || 0) - (b.number || 0);
    });

    let html = '';
    sorted.forEach((m, i) => {
        const defs = getIOListSignalDefaults(m.typeCode);
        const t = getTypeById(m.typeId);
        const typeDesc = m.typeFullName || (t && t.fullName) || m.typeName || '';

        let range0 = '', range100 = '';
        if (m.range0 || m.range100) {
            range0 = m.range0 || '';
            range100 = m.range100 || '';
        } else if (m.range) {
            const parts = String(m.range).split(/[~\-–—]/).map(s => s.trim());
            range0 = parts[0] || '';
            range100 = parts[1] || parts[0] || '';
        }

        html += pvRow(
            `<td class="cell-number">${i + 1}</td>` +
            pvCell('') +                                    // Revision No.
            pvCell(m.dcsTag) +                              // DCS Tag Number
            pvCell(formatMarkerLabel(m), 'cell-number') +   // Instrument Tag No.
            pvCell(typeDesc) +                              // Signal Description
            pvCell(m.location) +                            // Equipment
            pvCell(m.pid) +                                 // P & ID Dwg No.
            pvCell(m.pidRev) +                              // P&ID Revision No.
            pvCell(m.ioType || defs.ioType) +               // IO Type
            pvCell(m.signalType || defs.signalType) +       // Signal Type
            pvCell(m.power || defs.power) +                 // Power
            pvCell(m.zeroStatus) +                          // Zero Status
            pvCell(m.oneStatus) +                           // One Status
            pvCell(m.alarmLL) + pvCell(m.alarmL) + pvCell(m.alarmH) + pvCell(m.alarmHH) +
            pvCell(range0) + pvCell(range100) +
            pvCell(m.unit) + pvCell(m.rioPanel) +
            pvCell(m.slotNumber) + pvCell(m.channelNumber) +
            pvCell(m.note)
        );
    });

    if (sorted.length === 0) {
        html = `<tr><td colspan="24" class="cell-empty" style="padding:24px;">无 IO List 标记（请在左侧勾选需要导出的类型）</td></tr>`;
    }
    tbody.innerHTML = html;
}

// ===== Sheet 5: INS List =====
function pvRenderInsList() {
    const table = document.getElementById('pvTable-insList');
    const insMarkers = markers.filter(m => !isTypeInIOList(m.typeId));
    const sorted = [...insMarkers].sort((a, b) => {
        const fa = getDocFileName(a.docId);
        const fb = getDocFileName(b.docId);
        if (fa !== fb) return fa.localeCompare(fb, 'zh');
        if (a.typeName !== b.typeName) return (a.typeName || '').localeCompare(b.typeName || '', 'zh');
        return (a.number || 0) - (b.number || 0);
    });

    let html = `<thead><tr>
        <th>S/N</th><th>Tag No.</th><th>Location</th><th>Instrument Type</th>
        <th>Process Connection</th><th>Size / Calibration Range</th>
        <th>Service</th><th>Product</th><th>Data Sheet No.</th>
        <th>P &amp; ID Dwg No.</th><th>Remarks</th>
    </tr></thead><tbody>`;

    if (sorted.length === 0) {
        html += `<tr><td colspan="11" class="cell-empty" style="padding:24px;">无 INS List 标记（所有类型均已勾选导出到 IO List）</td></tr>`;
    } else {
        sorted.forEach((m, i) => {
            const t = getTypeById(m.typeId);
            const typeDesc = m.typeFullName || (t && t.fullName) || m.typeName || '';
            html += pvRow(
                `<td class="cell-number">${i + 1}</td>` +
                pvCell(formatMarkerLabel(m), 'cell-number') +
                pvCell(m.location) + pvCell(typeDesc) + pvCell(pvBuildConnection(m)) +
                pvCell(m.range) + pvCell(m.service) + pvCell(m.product) +
                pvCell(m.dataSheet) + pvCell(m.pid) + pvCell(m.note)
            );
        });
    }
    html += '</tbody>';
    table.innerHTML = html;
}

// ===== Tab 切换 =====
function pvSetupTabs() {
    const tabs = document.querySelectorAll('.preview-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.sheet;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.preview-sheet').forEach(p => p.hidden = true);
            const panel = document.getElementById('pvSheet-' + target);
            if (panel) panel.hidden = false;
        });
    });
}

// ===== 主入口：渲染所有表格 =====
function renderPreview() {
    if (markers.length === 0) {
        document.getElementById('pvEmpty').hidden = false;
        document.querySelectorAll('.preview-sheet').forEach(p => p.hidden = true);
        document.getElementById('pvMeta').textContent = '';
        document.getElementById('pvFooter').textContent = '';
        return;
    }
    document.getElementById('pvEmpty').hidden = true;

    pvRenderByFile();
    pvRenderTypeSummary();
    pvRenderDetail();
    pvRenderIOList();
    pvRenderInsList();

    // 顶部元信息
    const docCount = documents.length;
    document.getElementById('pvMeta').textContent =
        `${docCount} 个文件 · ${markers.length} 个标记`;

    // 底部信息
    const ioCount = markers.filter(m => isTypeInIOList(m.typeId)).length;
    const insCount = markers.length - ioCount;
    document.getElementById('pvFooter').textContent =
        `总计 ${markers.length} · IO List ${ioCount} · INS List ${insCount}`;
}

// ===== 打开/关闭预览窗口 =====
function openPreview() {
    renderPreview();
    document.getElementById('previewOverlay').hidden = false;
}

function closePreview() {
    document.getElementById('previewOverlay').hidden = true;
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    pvSetupTabs();

    document.getElementById('previewBtn').addEventListener('click', openPreview);
    document.getElementById('previewCloseBtn').addEventListener('click', closePreview);

    const overlay = document.getElementById('previewOverlay');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePreview();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && !overlay.hidden) {
            closePreview();
        }
    });
});
