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
function pvEditCell(marker, field, text, isCustomAttr) {
    const v = (text === null || text === undefined) ? '' : String(text);
    const attrFlag = isCustomAttr ? ' data-is-custom-attr="1"' : '';
    return `<td class="cell-editable" data-mid="${marker.id}" data-field="${field}"${attrFlag} title="点击编辑">
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

// ===== Sheet 3: Detail List（配置驱动 + 自定义列） =====
function pvRenderDetail() {
    const table = document.getElementById('pvTable-detail');
    const sorted = pvSortedMarkers();
    const cols = getSheetColumnsWithCustom('detailList');
    let html = `<thead><tr>${cols.map(c => `<th>${pvEscape(c.header)}</th>`).join('')}<th class="th-add-col"><button class="pv-add-col-btn" data-sheet="detailList" title="添加自定义列">+</button></th></tr></thead><tbody>`;
    sorted.forEach((m, i) => {
        html += pvRow(cols.map(c => pvRenderCellByCol(c, m, i)).join('') + '<td class="td-add-col"></td>');
    });
    html += '</tbody>';
    table.innerHTML = html;
}

// ===== Sheet 4: IO List（配置驱动 + 自定义列） =====
function pvRenderIOList() {
    const table = document.getElementById('pvTable-ioList');
    const filtered = markers.filter(m => isTypeInIOList(m.typeId));
    const sorted = [...filtered].sort((a, b) => {
        const fa = getDocFileName(a.docId);
        const fb = getDocFileName(b.docId);
        if (fa !== fb) return fa.localeCompare(fb, 'zh');
        if (a.typeName !== b.typeName) return (a.typeName || '').localeCompare(b.typeName || '', 'zh');
        return (a.number || 0) - (b.number || 0);
    });
    const cols = getSheetColumnsWithCustom('ioList');

    let html = pvBuildIOListHeader(cols) + '<tbody>';
    sorted.forEach((m, i) => {
        html += pvRow(cols.map(c => {
            if (c.editable) return pvEditCell(m, c.field, c.getter(m, i));
            if (c.type === 'sn') return `<td class="cell-number">${i + 1}</td>`;
            if (c.type === 'tagNo') return pvCell(c.getter(m, i), 'cell-number');
            return pvCell(c.getter(m, i));
        }).join('') + '<td class="td-add-col"></td>');
    });
    if (sorted.length === 0) {
        html = `<thead><tr><th colspan="${cols.length + 1}">IO List</th></tr></thead><tbody><tr><td colspan="${cols.length + 1}" class="cell-empty" style="padding:24px;">无 IO List 标记（请在左侧勾选需要导出的类型）</td></tr></tbody>`;
    }
    html += '</tbody>';
    table.innerHTML = html;
}

// ===== Sheet 5: INS List（配置驱动 + 自定义列） =====
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
    const cols = getSheetColumnsWithCustom('insList');

    let html = `<thead><tr>${cols.map(c => `<th>${pvEscape(c.header)}</th>`).join('')}<th class="th-add-col"><button class="pv-add-col-btn" data-sheet="insList" title="添加自定义列">+</button></th></tr></thead><tbody>`;
    if (sorted.length === 0) {
        html += `<tr><td colspan="${cols.length + 1}" class="cell-empty" style="padding:24px;">无 INS List 标记（所有类型均已勾选导出到 IO List）</td></tr>`;
    } else {
        sorted.forEach((m, i) => {
            html += pvRow(cols.map(c => {
                if (c.editable) return pvEditCell(m, c.field, c.getter(m, i));
                if (c.type === 'sn') return `<td class="cell-number">${i + 1}</td>`;
                if (c.type === 'tagNo') return pvCell(c.getter(m, i), 'cell-number');
                return pvCell(c.getter(m, i));
            }).join('') + '<td class="td-add-col"></td>');
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
    const isCustomAttr = td.dataset.isCustomAttr === '1';
    const input = td.querySelector('input');
    if (!mid || !field || !input) return;
    const marker = pvFindMarkerById(mid);
    if (!marker) return;

    const clean = input.value.trim();
    let oldVal;
    if (isCustomAttr) {
        oldVal = getCustomAttrValue(marker, field);
    } else {
        oldVal = marker[field] !== undefined ? marker[field] : '';
    }
    const oldForCmp = (oldVal === undefined || oldVal === null) ? '' : String(oldVal);
    if (oldForCmp !== clean) {
        if (isCustomAttr) {
            setCustomAttrValue(marker, field, clean.length > 0 ? clean : '');
        } else {
            marker[field] = clean.length > 0 ? clean : undefined;
        }
        pushHistory({ type: 'bulkUpdate', marker, changes: { [field]: oldForCmp }, after: { [field]: clean } });
        requestRender();
        scheduleAutosave();
    }
    input.value = clean;
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

// ===== 配置驱动列渲染：根据列定义生成单元格 HTML =====
function pvRenderCellByCol(col, marker, index) {
    // 特殊类型
    if (col.type === 'sn') {
        return `<td class="cell-number">${index + 1}</td>`;
    }
    if (col.type === 'tagNo') {
        return pvCell(col.getter(marker, index), 'cell-number');
    }
    if (col.type === 'locate') {
        return `<td class="cell-locate"><button type="button" class="pv-locate-btn" data-mid="${marker.id}" title="定位到图纸"><i class="fa-solid fa-location-crosshairs"></i></button></td>`;
    }
    if (col.type === 'listTag') {
        const listType = isTypeInIOList(marker.typeId) ? 'IO' : 'INS';
        return `<td><span class="list-tag ${listType.toLowerCase()}">${listType}</span></td>`;
    }
    // 可编辑字段
    if (col.editable) {
        return pvEditCell(marker, col.field, col.getter(marker, index), col.isCustomAttr);
    }
    // 普通字段
    return pvCell(col.getter(marker, index));
}

// 生成 IO List 双行表头 HTML（支持 colSpan 分组合并）
function pvBuildIOListHeader(cols) {
    let row1 = '', row2 = '';
    let i = 0;
    while (i < cols.length) {
        const col = cols[i];
        const span = col.colSpan || 1;
        if (span > 1) {
            row1 += `<th colspan="${span}">${pvEscape(col.header || '')}</th>`;
            for (let j = 0; j < span; j++) {
                row2 += `<th>${pvEscape(cols[i + j].header2 || '')}</th>`;
            }
            i += span;
        } else {
            row1 += `<th rowspan="2">${pvEscape(col.header || '')}</th>`;
            i++;
        }
    }
    row1 += `<th rowspan="2" class="th-add-col"><button class="pv-add-col-btn" data-sheet="ioList" title="添加自定义列">+</button></th>`;
    return `<thead><tr>${row1}</tr><tr>${row2}</tr></thead>`;
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

// ===== 自定义列 + 按钮（事件委托） =====
function pvSetupAddColButtons() {
    // 使用事件委托，绑在 preview-body 上，避免每次重渲染后重新绑定
    const body = document.querySelector('.preview-body');
    if (!body || body._cfDelegated) return;
    body._cfDelegated = true;
    body.addEventListener('click', (e) => {
        const btn = e.target.closest('.pv-add-col-btn');
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();
        openCustomFieldDialog(btn.dataset.sheet);
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
    pvSetupAddColButtons();

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
