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

// 可编辑单元格：input 直接渲染，修改后写回 marker 对应字段
function pvEditCell(marker, field, text) {
    const v = (text === null || text === undefined) ? '' : String(text);
    return `<td class="cell-editable" data-mid="${marker.id}" data-field="${field}" title="点击编辑">
        <input type="text" value="${pvEscape(v)}" spellcheck="false" autocomplete="off" />
    </td>`;
}

function pvRow(cells, cls) {
    return `<tr class="${cls || ''}">${cells}</tr>`;
}

// Process Connection 拼接：复用 utils.js 的 buildProcessConnection，保证与 Excel 导出一致
const pvBuildConnection = buildProcessConnection;

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
        <th>P &amp; ID Dwg No.</th><th>Remarks</th><th>List</th><th class="pv-col-locate">定位</th>
    </tr></thead><tbody>`;

    sorted.forEach((m, i) => {
        const listType = isTypeInIOList(m.typeId) ? 'IO' : 'INS';
        const listTag = `<span class="list-tag ${listType.toLowerCase()}">${listType}</span>`;
        const t = getTypeById(m.typeId);
        const typeDesc = m.typeFullName || (t && t.fullName) || m.typeName || t.name || '';
        html += pvRow(
            `<td class="cell-number">${i + 1}</td>` +
            pvCell(formatMarkerLabel(m), 'cell-number') +
            pvEditCell(m, 'location', m.location) + pvCell(typeDesc) + pvCell(pvBuildConnection(m)) +
            pvEditCell(m, 'range', m.range) + pvEditCell(m, 'service', m.service) + pvEditCell(m, 'product', m.product) +
            pvEditCell(m, 'dataSheet', m.dataSheet) + pvEditCell(m, 'pid', m.pid) + pvEditCell(m, 'note', m.note) +
            `<td>${listTag}</td>` +
            `<td class="cell-locate"><button type="button" class="pv-locate-btn" data-mid="${m.id}" title="定位到图纸"><i class="fa-solid fa-location-crosshairs"></i></button></td>`
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
            pvEditCell(m, 'dcsTag', m.dcsTag) +             // DCS Tag Number
            pvCell(formatMarkerLabel(m), 'cell-number') +   // Instrument Tag No.
            pvCell(typeDesc) +                              // Signal Description
            pvEditCell(m, 'location', m.location) +         // Equipment
            pvEditCell(m, 'pid', m.pid) +                   // P & ID Dwg No.
            pvEditCell(m, 'pidRev', m.pidRev) +             // P&ID Revision No.
            pvEditCell(m, 'ioType', m.ioType || defs.ioType) +         // IO Type
            pvEditCell(m, 'signalType', m.signalType || defs.signalType) + // Signal Type
            pvEditCell(m, 'power', m.power || defs.power) +             // Power
            pvEditCell(m, 'zeroStatus', m.zeroStatus) +                 // Zero Status
            pvEditCell(m, 'oneStatus', m.oneStatus) +                   // One Status
            pvEditCell(m, 'alarmLL', m.alarmLL) + pvEditCell(m, 'alarmL', m.alarmL) +
            pvEditCell(m, 'alarmH', m.alarmH) + pvEditCell(m, 'alarmHH', m.alarmHH) +
            pvEditCell(m, 'range0', range0) + pvEditCell(m, 'range100', range100) +
            pvEditCell(m, 'unit', m.unit) + pvEditCell(m, 'rioPanel', m.rioPanel) +
            pvEditCell(m, 'slotNumber', m.slotNumber) + pvEditCell(m, 'channelNumber', m.channelNumber) +
            pvEditCell(m, 'note', m.note)
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
                pvEditCell(m, 'location', m.location) + pvCell(typeDesc) + pvCell(pvBuildConnection(m)) +
                pvEditCell(m, 'range', m.range) + pvEditCell(m, 'service', m.service) + pvEditCell(m, 'product', m.product) +
                pvEditCell(m, 'dataSheet', m.dataSheet) + pvEditCell(m, 'pid', m.pid) + pvEditCell(m, 'note', m.note)
            );
        });
    }
    html += '</tbody>';
    table.innerHTML = html;
}

// ===== 表格单元格编辑：写回 marker 并复用 history/autosave =====
function pvFindMarkerById(id) {
    return markers.find(m => m.id === id);
}

// 提交一次单元格编辑：写回 marker → history → 重绘图纸 → 自动保存
function pvCommitCell(td) {
    const mid = td.dataset.mid;
    const field = td.dataset.field;
    const input = td.querySelector('input');
    if (!mid || !field || !input) return;
    const marker = pvFindMarkerById(mid);
    if (!marker) return;

    const clean = input.value.trim();
    const oldVal = marker[field] !== undefined ? marker[field] : '';
    const oldForCmp = (oldVal === undefined || oldVal === null) ? '' : String(oldVal);
    if (oldForCmp !== clean) {
        marker[field] = clean.length > 0 ? clean : undefined;
        pushHistory({ type: 'bulkUpdate', marker, changes: { [field]: oldForCmp }, after: { [field]: clean } });
        requestRender();
        scheduleAutosave();
    }
    input.value = clean; // 回显规范化后的值（空 → 清空）
}

function pvSetupEditableTables() {
    const tables = document.querySelectorAll('#pvTable-detail, #pvTable-insList, #pvTable-ioList');
    tables.forEach(table => {
        // 失焦 / 回车提交
        table.addEventListener('change', (e) => {
            const td = e.target.closest('td.cell-editable');
            if (td) pvCommitCell(td);
        });
        table.addEventListener('keydown', (e) => {
            const td = e.target.closest('td.cell-editable');
            if (!td) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                pvCommitCell(td);
                // 跳到同一列下一行，方便连续录入
                const field = td.dataset.field;
                const inputs = [...table.querySelectorAll(`td[data-field="${field}"] input`)];
                const idx = inputs.indexOf(e.target);
                if (idx !== -1 && idx + 1 < inputs.length) {
                    inputs[idx + 1].focus();
                    inputs[idx + 1].select();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation(); // 避免触发预览关闭
                const marker = pvFindMarkerById(td.dataset.mid);
                if (marker && td.dataset.field) {
                    const v = marker[td.dataset.field];
                    e.target.value = (v === undefined || v === null) ? '' : String(v);
                }
                e.target.blur();
            }
        });
    });
}

// 定位：关闭预览，视图居中到标记并放大，同时短暂高亮闪烁
function pvLocateMarker(m) {
    closePreview();
    if (zoom < 1.5) zoom = 1.5;
    panX = -m.vx * zoom;
    panY = -m.vy * zoom;
    requestRender();
    flashLocate(m);
}

function pvSetupLocateButtons() {
    document.getElementById('pvTable-detail').addEventListener('click', (e) => {
        const btn = e.target.closest('.pv-locate-btn');
        if (!btn) return;
        const marker = pvFindMarkerById(btn.dataset.mid);
        if (marker) pvLocateMarker(marker);
    });
}

// ===== Tab 切换 =====
const pvSheetRenderers = {
    byFile: pvRenderByFile,
    typeSummary: pvRenderTypeSummary,
    detail: pvRenderDetail,
    ioList: pvRenderIOList,
    insList: pvRenderInsList,
};

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
            // 切换到哪个表就重渲染哪个表，保证跨表编辑后数据一致
            if (pvSheetRenderers[target]) pvSheetRenderers[target]();
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
        `总计 ${markers.length} · IO List ${ioCount} · INS List ${insCount}（单元格可直接点击编辑）`;
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
    pvSetupEditableTables();
    pvSetupLocateButtons();

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
