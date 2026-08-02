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
        html += pvRow(cols.map(c => pvRenderCellByCol(c, m, i)).join('') + '<td class="td-add-col"></td>');
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
            html += pvRow(cols.map(c => pvRenderCellByCol(c, m, i)).join('') + '<td class="td-add-col"></td>');
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
    // 使用事件委托在 preview-body 上，覆盖所有表格（包括动态创建的自定义表格）
    const body = document.querySelector('.preview-body');
    if (!body || body._editableDelegated) return;
    body._editableDelegated = true;

    // 失焦 / 回车提交
    body.addEventListener('change', (e) => {
        const td = e.target.closest('td.cell-editable');
        if (td) pvCommitCell(td);
    });

    body.addEventListener('keydown', (e) => {
        const td = e.target.closest('td.cell-editable');
        if (!td) return;
        const table = td.closest('table');
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
                const isCustomAttr = td.dataset.isCustomAttr === '1';
                let v;
                if (isCustomAttr) {
                    v = getCustomAttrValue(marker, td.dataset.field);
                } else {
                    v = marker[td.dataset.field];
                }
                e.target.value = (v === undefined || v === null) ? '' : String(v);
            }
            e.target.blur();
        }
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
    const nav = document.querySelector('.preview-tabs');
    if (!nav) return;

    nav.addEventListener('click', (e) => {
        // 自定义表格编辑按钮
        const editBtn = e.target.closest('.custom-tab-edit');
        if (editBtn) {
            e.stopPropagation();
            const tableId = editBtn.dataset.table;
            if (tableId) editCustomTable(tableId);
            return;
        }

        // 自定义表格删除按钮
        const delBtn = e.target.closest('.custom-tab-del');
        if (delBtn) {
            e.stopPropagation();
            const tableId = delBtn.dataset.table;
            if (tableId && confirm('确定删除此自定义表格？')) {
                removeCustomTable(tableId);
                renderCustomTabs();
                renderCustomSheets();
                // 切回 INS List
                pvSwitchToTab('insList');
                renderAllTables();
            }
            return;
        }

        // 标签切换
        const tab = e.target.closest('.preview-tab');
        if (!tab) return;

        const sheetName = tab.dataset.sheet;
        const tableId = tab.dataset.table;

        document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.preview-sheet').forEach(p => p.hidden = true);

        if (sheetName) {
            const panel = document.getElementById('pvSheet-' + sheetName);
            if (panel) panel.hidden = false;
        } else if (tableId) {
            const panel = document.getElementById('pvSheet-' + tableId);
            if (panel) panel.hidden = false;
        }

        renderAllTables();
    });
}

function pvSwitchToTab(sheetName) {
    document.querySelectorAll('.preview-tab, [data-sheet].active').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.preview-sheet').forEach(p => p.hidden = true);

    const tab = document.querySelector(`[data-sheet="${sheetName}"]`);
    if (tab) tab.classList.add('active');
    const panel = document.getElementById('pvSheet-' + sheetName);
    if (panel) panel.hidden = false;
}

function pvSwitchToCustomTable(tableId) {
    document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.preview-sheet').forEach(p => p.hidden = true);

    const tab = document.querySelector(`.preview-tab[data-table="${tableId}"]`);
    if (tab) tab.classList.add('active');
    const panel = document.getElementById('pvSheet-' + tableId);
    if (panel) panel.hidden = false;
}

function renderAllTables() {
    for (const key of Object.keys(pvSheetRenderers)) {
        pvSheetRenderers[key]();
    }
    renderAllCustomTables();
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

    renderCustomTabs();
    renderCustomSheets();
    pvRenderByFile();
    pvRenderTypeSummary();
    pvRenderDetail();
    pvRenderIOList();
    pvRenderInsList();
    renderAllCustomTables();
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

function openDataFlow() {
    const overlay = document.getElementById('dataFlowOverlay');
    if (!overlay) return;
    overlay.hidden = false;
    // 延迟一帧确保 canvas 容器已显示并有尺寸
    requestAnimationFrame(() => pvRenderDataFlow());
}

function closeDataFlow() {
    const overlay = document.getElementById('dataFlowOverlay');
    if (overlay) overlay.hidden = true;
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    pvSetupTabs();
    pvSetupEditableTables();
    pvSetupLocateButtons();
    pvSetupNewTableDropdown();

    document.getElementById('previewBtn').addEventListener('click', openPreview);
    document.getElementById('previewCloseBtn').addEventListener('click', closePreview);

    const previewOverlay = document.getElementById('previewOverlay');
    previewOverlay.addEventListener('click', (e) => {
        if (e.target === previewOverlay) closePreview();
    });

    // 数据流独立浮层
    const dfBtn = document.getElementById('dataFlowBtn');
    const dfOverlay = document.getElementById('dataFlowOverlay');
    const dfClose = document.getElementById('dataFlowCloseBtn');
    if (dfBtn) dfBtn.addEventListener('click', openDataFlow);
    if (dfClose) dfClose.addEventListener('click', closeDataFlow);
    if (dfOverlay) {
        dfOverlay.addEventListener('click', (e) => {
            if (e.target === dfOverlay) closeDataFlow();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (dfOverlay && !dfOverlay.hidden) {
                closeDataFlow();
            } else if (previewOverlay && !previewOverlay.hidden) {
                closePreview();
            }
        }
    });
});

// ===== 动态标签页和表格区域渲染 =====
function renderCustomTabs() {
    const container = document.getElementById('customTabsContainer');
    if (!container) return;
    const tables = getCustomTables();
    let html = '';
    for (const table of tables) {
        html += `<button class="preview-tab preview-tab--custom" data-table="${pvEscape(table.id)}">
            ${pvEscape(table.name)}
            <span class="custom-tab-edit" data-table="${pvEscape(table.id)}" title="编辑表格">✎</span>
            <span class="custom-tab-del" data-table="${pvEscape(table.id)}" title="删除表格">&times;</span>
        </button>`;
    }
    container.innerHTML = html;
}

function renderCustomSheets() {
    const container = document.getElementById('customSheetsContainer');
    if (!container) return;
    const tables = getCustomTables();
    let html = '';
    for (const table of tables) {
        html += `<section class="preview-sheet" id="pvSheet-${table.id}" hidden>
            <div class="preview-scroll">
                <table class="preview-table" id="pvTable-${table.id}"></table>
            </div>
        </section>`;
    }
    container.innerHTML = html;
}

// ===== 新建/编辑自定义表格下拉面板：字段列表渲染 =====
function renderNewTableFieldList() {
    const list = document.getElementById('newTableFieldList');
    if (!list) return;
    const bindOptions = getAllBindableFields();
    let html = '';
    _newTableFields.forEach((f, idx) => {
        const optionsHtml = bindOptions.map(opt => {
            const sel = opt.key === f.bindField ? ' selected' : '';
            return `<option value="${pvEscape(opt.key)}"${sel}>${pvEscape(opt.label)}</option>`;
        }).join('');
        html += `<div class="ins-field-row" data-idx="${idx}">
            <input type="text" class="ins-field-row__label" value="${pvEscape(f.label || '')}" placeholder="字段名" spellcheck="false" />
            <select class="ins-field-row__bind">
                <option value="">-- 不绑定 --</option>
                ${optionsHtml}
            </select>
            <button type="button" class="ins-field-row__del" data-idx="${idx}" title="删除字段">&times;</button>
        </div>`;
    });
    list.innerHTML = html;
}

function addFieldToNewTable() {
    const idx = _newTableFields.length + 1;
    _newTableFields.push({ label: '字段' + idx, bindField: '' });
    renderNewTableFieldList();
}

// ===== 自定义表格渲染 =====
function renderCustomTable(tableId) {
    const tableEl = document.getElementById('pvTable-' + tableId);
    if (!tableEl) return;
    const ct = getCustomTables().find(t => t.id === tableId);
    if (!ct) return;

    const sorted = pvSortedMarkers();
    const cols = ct.columns.map(c => {
        // 判断是否为自定义属性字段（ca_ 开头）
        const isCustomAttrField = c.bindField && c.bindField.startsWith('ca_');
        return {
            key: c.key,
            header: c.label,
            field: c.bindField || '',
            editable: !!c.bindField,
            isCustomAttr: isCustomAttrField,
            getter: (m) => {
                if (!c.bindField) return '';
                if (isCustomAttrField) {
                    return getCustomAttrValue(m, c.bindField);
                }
                const v = m[c.bindField];
                return (v === undefined || v === null) ? '' : String(v);
            },
        };
    });

    let html = `<thead><tr>
        <th>S/N</th>
        <th>Tag No.</th>
        ${cols.map(c => `<th>${pvEscape(c.header)}</th>`).join('')}
    </tr></thead><tbody>`;

    if (sorted.length === 0) {
        html += `<tr><td colspan="${cols.length + 2}" class="cell-empty" style="padding:24px;">暂无标记数据</td></tr>`;
    } else {
        sorted.forEach((m, i) => {
            html += '<tr>';
            html += `<td class="cell-number">${i + 1}</td>`;
            html += pvCell(formatMarkerLabel(m), 'cell-number');
            for (const col of cols) {
                if (col.editable) {
                    html += pvEditCell(m, col.field, col.getter(m), col.isCustomAttr);
                } else {
                    html += pvCell(col.getter(m));
                }
            }
            html += '</tr>';
        });
    }

    html += '</tbody>';
    tableEl.innerHTML = html;
}

function renderAllCustomTables() {
    const tables = getCustomTables();
    for (const table of tables) {
        renderCustomTable(table.id);
    }
}

// ===== DataFlow 命名空间 =====
// Canvas 无限画布网状图：展示仪表属性 ↔ 数据表引用关系
// 数据流方向：属性节点（左列）→ 表节点（右列），箭头指示流向
// 交互：鼠标拖拽平移 / 滚轮缩放 / 悬停高亮 / 点击选中聚焦
// 检查能力：填充率指示 / 孤立属性检测 / 表数据完整度 / 空引用警告
const DataFlow = (() => {
    // ═══════════════════════════════════════════
    //  内部状态
    // ═══════════════════════════════════════════
    let _c = null, _ctx = null;
    let _nodes = [], _edges = [];
    let _panX = 0, _panY = 0, _zoom = 1;
    let _dragging = false, _dragSX = 0, _dragSY = 0, _dragPX = 0, _dragPY = 0;
    let _hovered = null, _selected = null;
    let _init = false;
    let _searchTerm = '';
    let _stats = { totalProps: 0, orphaned: 0, totalEdges: 0, lowFillTables: 0, healthScore: 0 };

    // ═══════════════════════════════════════════
    //  布局常量
    // ═══════════════════════════════════════════
    const NW = 170, NH = 38, R = 8;
    const COL_GAP = 280, ROW_GAP = 14;
    const LEFT_X = 60, TOP_Y = 50;

    // ═══════════════════════════════════════════
    //  颜色体系
    // ═══════════════════════════════════════════
    // 属性分类颜色 — 标识(蓝) / 规格(青) / IO List(紫) / 自定义(琥珀) / 孤立(红)
    const CAT_CLR = {
        '标识':    { fill: '#e8f0fe', stroke: '#1a73e8', text: '#1557b0' },
        '规格':    { fill: '#e0f2f1', stroke: '#00897b', text: '#00695c' },
        'IO List': { fill: '#f3e5f5', stroke: '#8e24aa', text: '#6a1b9a' },
        '自定义':  { fill: '#fff8e1', stroke: '#ff8f00', text: '#e65100' },
        'orphan':  { fill: '#ffebee', stroke: '#d32f2f', text: '#c62828' },
    };

    // 表节点颜色 — 内置表(绿) / 自定义表(橙)
    const TBL_CLR = {
        builtin: { fill: '#e8f5e9', stroke: '#2e7d32', text: '#1b5e20' },
        custom:  { fill: '#fff3e0', stroke: '#e65100', text: '#bf360c' },
    };

    // 边线颜色 — 内置表边(蓝灰) / 自定义表边(暖橙) / 高亮(蓝)
    const EDGE_CLR = {
        builtin: { line: '#90caf9', arrow: '#64b5f6' },
        custom:  { line: '#ffcc80', arrow: '#ffb74d' },
        hi:      { line: '#1a73e8', arrow: '#1565c0' },
    };

    // 画布背景 / 网格 / 填充率 / 透明度
    const BG = '#fafbfc';
    const GRID = '#e8eaed';
    const HEADER = '#888';
    const FILL_CLR = { high: '#4caf50', mid: '#ff9800', low: '#f44336', none: '#bbb' };
    const ALPHA = { dim: 0.12, normal: 0.55, hi: 1 };

    // ═══════════════════════════════════════════
    //  工具函数
    // ═══════════════════════════════════════════
    function _getCat(field) {
        const a = ALL_MARKER_ATTRIBUTES.find(x => x.key === field);
        if (a) return a.group;
        return field.startsWith('ca_') ? '自定义' : '自定义';
    }

    function _readFieldVal(m, field) {
        if (field === 'tagNumber') return formatMarkerLabel(m);
        if (field === 'sizeNote') return m.sizeNote || m.size || '';
        if (field === 'typeName') {
            const t = getTypeById(m.typeId);
            return m.typeFullName || (t && t.fullName) || m.typeName || '';
        }
        if (field.startsWith('ca_')) return getCustomAttrValue(m, field);
        const v = m[field];
        return (v === undefined || v === null) ? '' : String(v);
    }

    function _isFilled(val) {
        return val !== undefined && val !== null && String(val).trim() !== '';
    }

    // ═══════════════════════════════════════════
    //  填充率计算
    // ═══════════════════════════════════════════
    function _calcFillRates(attrMap) {
        const rates = new Map();
        const total = markers.length;
        if (total === 0) return rates;
        for (const [field] of attrMap) {
            let filled = 0;
            for (const m of markers) {
                if (_isFilled(_readFieldVal(m, field))) filled++;
            }
            rates.set(field, { total, filled, pct: Math.round(filled / total * 100) });
        }
        return rates;
    }

    // 计算表节点数据完整度：该表引用的字段中有多少百分比有数据
    function _calcTableFill(node, attrNodes) {
        const refFields = _edges.filter(e => e.to.id === node.id).map(e => e.from.field);
        if (refFields.length === 0) return { pct: 100, refCount: 0, emptyCount: 0 };
        let emptyCount = 0;
        for (const f of refFields) {
            const an = attrNodes.find(n => n.field === f);
            if (an) {
                const fr = an.fillRate || { pct: 0 };
                if (fr.pct === 0) emptyCount++;
            }
        }
        return { pct: Math.round((refFields.length - emptyCount) / refFields.length * 100), refCount: refFields.length, emptyCount };
    }

    // ═══════════════════════════════════════════
    //  图构建
    // ═══════════════════════════════════════════
    function _buildGraph() {
        _nodes = []; _edges = [];
        const attrMap = new Map();

        function reg(field, label, tableKey) {
            if (!field) return;
            if (!attrMap.has(field)) attrMap.set(field, { label: label || field, tables: new Set() });
            attrMap.get(field).tables.add(tableKey);
        }

        const builtinDefs = [
            { key: 'detailList', name: 'Detail List', sheet: 'detailList' },
            { key: 'ioList',     name: 'IO List',     sheet: 'ioList' },
            { key: 'insList',    name: 'INS List',    sheet: 'insList' },
        ];

        for (const bt of builtinDefs) {
            const cols = getSheetColumnsWithCustom(bt.sheet);
            for (const c of cols) {
                if (c.type === 'sn' || c.type === 'locate' || c.type === 'listTag') continue;
                if (c.type === 'tagNo') { reg('tagNumber', 'Tag No.', bt.key); continue; }
                if (c.type === 'connection') { reg('sizeNote', 'Process Connection', bt.key); continue; }
                if (c.type === 'type') { reg('typeName', 'Instrument Type', bt.key); continue; }
                if (c.editable && c.field) reg(c.field, c.header || c.field, bt.key);
                if (c.isCustomAttr) {
                    const d = getCustomAttrDefs().find(x => x.key === c.field);
                    reg(c.field, d ? d.label : c.field, bt.key);
                }
                if (c.isCustom && c.field) reg(c.field, c.header, bt.key);
            }
        }

        const customTables = getCustomTables();
        for (const ct of customTables) {
            for (const c of ct.columns) {
                if (!c.bindField) continue;
                let label = c.label;
                if (c.bindField.startsWith('ca_')) {
                    const d = getCustomAttrDefs().find(x => x.key === c.bindField);
                    if (d) label = d.label;
                }
                reg(c.bindField, label, ct.id);
            }
        }

        const fillRates = _calcFillRates(attrMap);

        // 属性节点（左列）
        const attrEntries = [...attrMap.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, 'zh'));
        let ay = TOP_Y;
        const attrNodes = [];
        for (const [field, info] of attrEntries) {
            const fr = fillRates.get(field) || { total: markers.length, filled: 0, pct: 0 };
            const isOrphaned = fr.filled > 0 && info.tables.size === 0;
            attrNodes.push({
                id: 'a_' + field, type: 'attr', label: info.label, field,
                category: _getCat(field),
                x: LEFT_X, y: ay, w: NW, h: NH, refs: info.tables,
                fillRate: fr, isOrphaned,
            });
            ay += NH + ROW_GAP;
        }

        // 表节点（右列）
        let ty = TOP_Y;
        const tableNodes = [];
        for (const bt of builtinDefs) {
            tableNodes.push({
                id: 't_' + bt.key, type: 'table', label: bt.name, tableKey: bt.key,
                isBuiltin: true, x: LEFT_X + NW + COL_GAP, y: ty, w: NW, h: NH,
            });
            ty += NH + ROW_GAP;
        }
        for (const ct of customTables) {
            tableNodes.push({
                id: 't_' + ct.id, type: 'table', label: ct.name, tableKey: ct.id,
                isBuiltin: false, x: LEFT_X + NW + COL_GAP, y: ty, w: NW, h: NH,
            });
            ty += NH + ROW_GAP;
        }

        _nodes = [...attrNodes, ...tableNodes];

        // 边（属性 → 表），同时计算每条边的数据填充率
        const tmap = new Map(tableNodes.map(tn => [tn.tableKey, tn]));
        for (const an of attrNodes) {
            for (const tk of an.refs) {
                const tn = tmap.get(tk);
                if (tn) {
                    const fr = an.fillRate || { total: 0, filled: 0, pct: 0 };
                    _edges.push({
                        from: an, to: tn, field: an.field, isBuiltin: tn.isBuiltin,
                        fillPct: fr.pct,
                        fillFilled: fr.filled,
                        fillTotal: fr.total,
                    });
                }
            }
        }

        // 计算表填充率
        for (const tn of tableNodes) {
            tn.tableFill = _calcTableFill(tn, attrNodes);
        }

        // 健康评分：所有属性字段的加权填充率
        let totalPossible = 0, totalFilled = 0;
        for (const an of attrNodes) {
            const fr = an.fillRate || { total: 0, filled: 0 };
            totalPossible += fr.total * an.refs.size;
            totalFilled += fr.filled * an.refs.size;
        }
        const healthScore = totalPossible > 0 ? Math.round(totalFilled / totalPossible * 100) : 100;

        // 统计
        _stats = {
            totalProps: attrNodes.length,
            orphaned: attrNodes.filter(n => n.isOrphaned).length,
            totalEdges: _edges.length,
            lowFillTables: tableNodes.filter(n => n.tableFill && n.tableFill.pct < 50).length,
            healthScore,
        };
        _updateStats();
        _buildLegend();
    }

    // ═══════════════════════════════════════════
    //  UI 更新
    // ═══════════════════════════════════════════
    function _updateStats() {
        const el = document.getElementById('dataFlowStats');
        if (!el) return;
        const s = _stats;
        let scoreCls = 'dataflow-stats__score--ok';
        if (s.healthScore < 50) scoreCls = 'dataflow-stats__score--bad';
        else if (s.healthScore < 80) scoreCls = 'dataflow-stats__score--warn';
        let html = `<span class="dataflow-stats__score ${scoreCls}">健康度 ${s.healthScore}%</span>`;
        html += ` · 属性 ${s.totalProps} · 连线 ${s.totalEdges}`;
        if (s.orphaned > 0) html += ` · <span class="dataflow-stats__warn">孤立 ${s.orphaned}</span>`;
        if (s.lowFillTables > 0) html += ` · <span class="dataflow-stats__warn">低填充表 ${s.lowFillTables}</span>`;
        el.innerHTML = html;
    }

    function _buildLegend() {
        const el = document.getElementById('dataFlowLegend');
        if (!el) return;
        const hasCustom = getCustomTables().length > 0;
        let h = '<button class="dataflow-legend__toggle" id="dataFlowLegendToggle" title="折叠/展开图例"><i class="fa-solid fa-chevron-down"></i></button>';
        h += '<div class="dataflow-legend__inner">';
        h += '<div class="dataflow-legend__title">图例</div>';
        h += '<div class="dataflow-legend__group">属性分类</div>';
        for (const [cat, clr] of Object.entries(CAT_CLR)) {
            if (cat === 'orphan') continue;
            h += `<div class="dataflow-legend__item"><span class="dataflow-legend__swatch" style="background:${clr.fill};border:1.5px solid ${clr.stroke}"></span><span>${cat}</span></div>`;
        }
        h += `<div class="dataflow-legend__item"><span class="dataflow-legend__swatch dataflow-legend__swatch--orphan"></span><span>孤立（有数据无引用）</span></div>`;

        h += '<div class="dataflow-legend__group">数据表</div>';
        h += `<div class="dataflow-legend__item"><span class="dataflow-legend__swatch" style="background:${TBL_CLR.builtin.fill};border:1.5px solid ${TBL_CLR.builtin.stroke}"></span><span>内置表</span></div>`;
        if (hasCustom) h += `<div class="dataflow-legend__item"><span class="dataflow-legend__swatch" style="background:${TBL_CLR.custom.fill};border:1.5px solid ${TBL_CLR.custom.stroke}"></span><span>自定义表</span></div>`;

        h += '<div class="dataflow-legend__group">填充率</div>';
        h += `<div class="dataflow-legend__item"><span class="dataflow-legend__dot" style="background:${FILL_CLR.high}"></span><span>≥80% 完整</span></div>`;
        h += `<div class="dataflow-legend__item"><span class="dataflow-legend__dot" style="background:${FILL_CLR.mid}"></span><span>50–79% 部分</span></div>`;
        h += `<div class="dataflow-legend__item"><span class="dataflow-legend__dot" style="background:${FILL_CLR.low}"></span><span>&lt;50% 缺失</span></div>`;
        h += `<div class="dataflow-legend__item"><span class="dataflow-legend__dot" style="background:${FILL_CLR.none}"></span><span>0% 无数据</span></div>`;

        h += '<div class="dataflow-legend__group">连线颜色</div>';
        h += `<div class="dataflow-legend__item"><span class="dataflow-legend__line" style="background:${FILL_CLR.high}"></span><span>数据流转正常</span></div>`;
        h += `<div class="dataflow-legend__item"><span class="dataflow-legend__line" style="background:${FILL_CLR.mid}"></span><span>数据部分缺失</span></div>`;
        h += `<div class="dataflow-legend__item"><span class="dataflow-legend__line" style="background:${FILL_CLR.low}"></span><span>数据严重缺失</span></div>`;
        h += `<div class="dataflow-legend__item"><span class="dataflow-legend__line" style="background:${FILL_CLR.none}"></span><span>无数据流转</span></div>`;

        h += '<div class="dataflow-legend__group">交互</div>';
        h += `<div class="dataflow-legend__item"><span style="font-size:12px;margin-left:2px;">🖱</span><span>拖拽平移 / 滚轮缩放</span></div>`;
        h += `<div class="dataflow-legend__item"><span style="font-size:12px;margin-left:2px;">👆</span><span>点击节点选中聚焦</span></div>`;
        h += '</div>';

        el.innerHTML = h;

        // 绑定折叠按钮
        const toggleBtn = document.getElementById('dataFlowLegendToggle');
        if (toggleBtn && !toggleBtn._dfLegBound) {
            toggleBtn._dfLegBound = true;
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                el.classList.toggle('dataflow-legend--collapsed');
            });
        }
    }

    function _updateSelectPanel() {
        const panel = document.getElementById('dataFlowSelectPanel');
        if (!panel) return;
        if (!_selected) { panel.hidden = true; return; }
        panel.hidden = false;

        const n = _selected;
        let html = `<div class="df-select-panel__title">${pvEscape(n.label)}</div>`;
        html += '<div class="df-select-panel__sep"></div>';

        if (n.type === 'attr') {
            if (n.isOrphaned) html += '<div class="df-select-panel__warn">⚠ 孤立属性：有数据但未被任何表引用</div>';
            html += `<div class="df-select-panel__row"><span>分类</span><span>${pvEscape(n.category)}</span></div>`;
            const fr = n.fillRate || { total: 0, filled: 0, pct: 0 };
            html += `<div class="df-select-panel__row"><span>填充率</span><span>${fr.filled}/${fr.total} (${fr.pct}%)</span></div>`;
            const refNames = [];
            if (n.refs && n.refs.size > 0) {
                for (const tk of n.refs) {
                    const tn = _nodes.find(x => x.tableKey === tk);
                    refNames.push(tn ? tn.label : tk);
                }
            }
            html += `<div class="df-select-panel__row"><span>引用表</span><span>${refNames.length > 0 ? refNames.join(', ') : '无'}</span></div>`;
        } else {
            html += `<div class="df-select-panel__row"><span>类型</span><span>${n.isBuiltin ? '内置表' : '自定义表'}</span></div>`;
            const refCount = _edges.filter(e => e.to.id === n.id).length;
            html += `<div class="df-select-panel__row"><span>引用属性</span><span>${refCount} 个</span></div>`;
            if (n.tableFill) {
                const tf = n.tableFill;
                html += `<div class="df-select-panel__row"><span>数据完整度</span><span>${tf.pct}%</span></div>`;
                if (tf.emptyCount > 0) {
                    html += `<div class="df-select-panel__warn">⚠ ${tf.emptyCount} 个引用字段无数据</div>`;
                }
            }
        }
        html += `<button class="df-select-panel__clear" id="dataFlowClearSelect">取消选中</button>`;
        panel.innerHTML = html;

        // 绑定取消选中按钮
        const clearBtn = panel.querySelector('#dataFlowClearSelect');
        if (clearBtn) clearBtn.addEventListener('click', _clearSelection);
    }

    // ═══════════════════════════════════════════
    //  Canvas 初始化和事件
    // ═══════════════════════════════════════════
    function _setupCanvas() {
        if (!_c) return;
        _c.addEventListener('mousedown', (e) => {
            _dragging = true;
            _dragSX = e.clientX; _dragSY = e.clientY;
            _dragPX = _panX; _dragPY = _panY;
            _c.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (_dragging) {
                _panX = _dragPX + (e.clientX - _dragSX);
                _panY = _dragPY + (e.clientY - _dragSY);
                _draw();
            } else {
                _checkHover(e);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (_dragging) {
                _dragging = false;
                // 如果拖拽距离极小，视为点击
                const dx = e.clientX - _dragSX, dy = e.clientY - _dragSY;
                if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && _hovered) {
                    _selectNode(_hovered);
                }
                _c.style.cursor = _hovered ? 'pointer' : 'grab';
            }
        });

        _c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = _c.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            const old = _zoom;
            _zoom = Math.max(0.25, Math.min(3, _zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
            const r = _zoom / old;
            _panX = mx - r * (mx - _panX);
            _panY = my - r * (my - _panY);
            _draw();
        }, { passive: false });

        window.addEventListener('resize', () => { _resize(); _draw(); });

        // 双击空白处取消选中
        _c.addEventListener('dblclick', (e) => {
            if (!_hovered) _clearSelection();
        });

        // 搜索输入
        const searchInput = document.getElementById('dataFlowSearch');
        if (searchInput && !searchInput._dfBound) {
            searchInput._dfBound = true;
            searchInput.addEventListener('input', () => {
                _searchTerm = searchInput.value.trim();
                _selected = null;
                _updateSelectPanel();
                _draw();
            });
            // 搜索框 Escape 不清空搜索，仅失焦
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    _searchTerm = '';
                    _draw();
                    searchInput.blur();
                }
            });
        }
    }

    function _resize() {
        if (!_c) return;
        const rect = _c.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const dpr = window.devicePixelRatio || 1;
        _c.width = rect.width * dpr;
        _c.height = rect.height * dpr;
        _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function _centerContent() {
        if (_nodes.length === 0) return;
        if (!_c || _c.width === 0) return;
        const vw = _c.width / (window.devicePixelRatio || 1);
        const vh = _c.height / (window.devicePixelRatio || 1);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of _nodes) {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x + n.w > maxX) maxX = n.x + n.w;
            if (n.y + n.h > maxY) maxY = n.y + n.h;
        }
        const cw = maxX - minX, ch = maxY - minY;
        _panX = (vw - cw * _zoom) / 2 - minX * _zoom;
        _panY = (vh - ch * _zoom) / 2 - minY * _zoom;
    }

    // ═══════════════════════════════════════════
    //  选中/取消选中
    // ═══════════════════════════════════════════
    function _selectNode(node) {
        if (_selected && _selected.id === node.id) {
            _clearSelection();
            return;
        }
        _selected = node;
        _updateSelectPanel();
        _draw();
    }

    function _clearSelection() {
        _selected = null;
        _updateSelectPanel();
        _draw();
    }

    function _matchesSearch(node) {
        if (!_searchTerm) return true;
        const t = _searchTerm.toLowerCase();
        return (node.label || '').toLowerCase().includes(t) ||
               (node.field || '').toLowerCase().includes(t) ||
               (node.category || '').toLowerCase().includes(t);
    }

    function _isConnected(n1, n2) {
        return _edges.some(e =>
            (e.from.id === n1.id && e.to.id === n2.id) ||
            (e.from.id === n2.id && e.to.id === n1.id)
        );
    }

    function _isRelated(node) {
        if (!_selected) return true;
        if (node.id === _selected.id) return true;
        return _isConnected(node, _selected);
    }

    // ═══════════════════════════════════════════
    //  绘制
    // ═══════════════════════════════════════════
    function _draw() {
        if (!_c || _c.width === 0) return;
        const ctx = _ctx;
        const w = _c.width / (window.devicePixelRatio || 1);
        const h = _c.height / (window.devicePixelRatio || 1);

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);

        // 网格
        ctx.strokeStyle = GRID; ctx.lineWidth = 0.5;
        const gs = 40 * _zoom;
        const sx = _panX % gs, sy = _panY % gs;
        for (let x = sx; x < w; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = sy; y < h; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

        ctx.save();
        ctx.translate(_panX, _panY);
        ctx.scale(_zoom, _zoom);

        // 列标题
        ctx.fillStyle = HEADER; ctx.font = 'bold 12px Arial, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('仪表属性', LEFT_X + NW / 2, TOP_Y - 16);
        ctx.fillText('数据表', LEFT_X + NW + COL_GAP + NW / 2, TOP_Y - 16);

        // 先画边，再画节点（节点在上层）
        for (const edge of _edges) _drawEdge(ctx, edge);
        for (const node of _nodes) _drawNode(ctx, node);

        ctx.restore();
    }

    function _drawEdge(ctx, edge) {
        const fx = edge.from.x + edge.from.w, fy = edge.from.y + edge.from.h / 2;
        const tx = edge.to.x, ty = edge.to.y + edge.to.h / 2;

        // 确定高亮状态
        const isHovered = _hovered && (_hovered.id === edge.from.id || _hovered.id === edge.to.id);
        const isSelected = _selected && (_selected.id === edge.from.id || _selected.id === edge.to.id);
        const hi = isHovered || isSelected;

        // 搜索过滤：非匹配边变暗
        const searchMatch = !_searchTerm || _matchesSearch(edge.from) || _matchesSearch(edge.to);

        // 选中模式下，非关联边变暗
        const related = _selected ? _isRelated(edge.from) && _isRelated(edge.to) : true;
        let alpha = searchMatch ? (hi ? ALPHA.hi : (related ? ALPHA.normal : ALPHA.dim)) : ALPHA.dim;

        // 连线颜色按数据填充率分级
        const fillPct = edge.fillPct || 0;
        let lineColor, arrowColor;
        if (fillPct >= 80) {
            lineColor = '#81c784'; arrowColor = '#4caf50';
        } else if (fillPct >= 50) {
            lineColor = '#ffb74d'; arrowColor = '#ff9800';
        } else if (fillPct > 0) {
            lineColor = '#ef9a9a'; arrowColor = '#f44336';
        } else {
            lineColor = '#d0d0d0'; arrowColor = '#b0b0b0';
        }

        // 悬停/选中时覆盖为蓝色
        if (hi) {
            lineColor = EDGE_CLR.hi.line;
            arrowColor = EDGE_CLR.hi.arrow;
        }

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = hi ? 2.5 : (fillPct >= 80 ? 2 : 1.5);

        // Bezier 曲线
        const cx = (fx + tx) / 2;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.bezierCurveTo(cx, fy, cx, ty, tx, ty);
        ctx.stroke();

        // 箭头（属性 → 表方向）
        if (related && searchMatch) {
            _drawArrow(ctx, cx, ty, tx, ty, arrowColor, hi ? 6 : 4, alpha);
        }

        // 边缘标签：填充计数（仅悬停/选中时显示，或始终显示小字）
        if (hi || fillPct < 80) {
            const midX = (fx + tx) / 2, midY = (fy + ty) / 2;
            ctx.fillStyle = fillPct >= 80 ? '#666' : (fillPct > 0 ? '#555' : '#bbb');
            ctx.font = `${hi ? 'bold ' : ''}9px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = `${edge.fillFilled || 0}/${edge.fillTotal || 0}`;
            // 标签背景
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillRect(midX - tw / 2 - 3, midY - 7, tw + 6, 14);
            ctx.fillStyle = fillPct >= 80 ? '#388e3c' : (fillPct > 0 ? '#e65100' : '#999');
            ctx.fillText(label, midX, midY);
        }

        ctx.globalAlpha = 1;
    }

    function _drawArrow(ctx, cx, cy, tx, ty, color, size, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.translate(tx, ty);
        // 箭头方向：从 Bezier 终点切线方向指向表节点
        const angle = Math.atan2(ty - cy, tx - cx);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-size, -size * 0.6);
        ctx.lineTo(-size, size * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function _drawNode(ctx, node) {
        const { x, y, w, h } = node;
        const isHovered = node === _hovered;
        const isSelected = node === _selected;
        const hi = isHovered || isSelected;
        const related = _selected ? _isRelated(node) : true;
        const searchMatch = !_searchTerm || _matchesSearch(node);

        let fill, stroke, textColor;

        if (node.type === 'attr') {
            const cat = node.isOrphaned ? 'orphan' : (node.category || '自定义');
            const clr = CAT_CLR[cat] || CAT_CLR['自定义'];
            fill = clr.fill; stroke = clr.stroke; textColor = clr.text;
        } else {
            const clr = node.isBuiltin ? TBL_CLR.builtin : TBL_CLR.custom;
            fill = clr.fill; stroke = clr.stroke; textColor = clr.text;
        }

        // 搜索过滤：不匹配的节点大幅变暗
        const alpha = searchMatch ? (related ? 1 : 0.2) : 0.08;
        ctx.globalAlpha = alpha;

        // 阴影（悬停/选中时）
        if (hi) {
            ctx.shadowColor = 'rgba(0,0,0,0.18)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 3;
        }

        // 填充率指示条（属性节点左侧 4px）
        if (node.type === 'attr' && node.fillRate) {
            const fr = node.fillRate;
            let frColor = FILL_CLR.none;
            if (fr.pct >= 80) frColor = FILL_CLR.high;
            else if (fr.pct >= 50) frColor = FILL_CLR.mid;
            else if (fr.pct > 0) frColor = FILL_CLR.low;
            ctx.fillStyle = frColor;
            ctx.fillRect(x, y, 4, h);
        }

        // 表节点填充率徽章（右上角小圆点 + 百分比）
        if (node.type === 'table' && node.tableFill && node.tableFill.refCount > 0) {
            const tf = node.tableFill;
            let badgeColor = FILL_CLR.high;
            if (tf.pct < 50) badgeColor = FILL_CLR.low;
            else if (tf.pct < 80) badgeColor = FILL_CLR.mid;

            // 小圆点
            ctx.fillStyle = badgeColor;
            ctx.beginPath();
            ctx.arc(x + w - 6, y + 6, 5, 0, Math.PI * 2);
            ctx.fill();

            // 百分比文字
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 8px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tf.pct + '', x + w - 6, y + 6);
        }

        // 空引用警告图标（表节点引用了字段但所有字段都无数据）
        if (node.type === 'table' && node.tableFill && node.tableFill.pct === 0 && node.tableFill.refCount > 0) {
            ctx.fillStyle = '#d32f2f';
            ctx.font = 'bold 11px Arial, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText('⚠', x + w - 22, y + 1);
        }

        // 圆角矩形
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = hi ? 2.5 : 1.5;
        if (node.isOrphaned) ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x + R, y);
        ctx.lineTo(x + w - R, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + R);
        ctx.lineTo(x + w, y + h - R);
        ctx.quadraticCurveTo(x + w, y + h, x + w - R, y + h);
        ctx.lineTo(x + R, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - R);
        ctx.lineTo(x, y + R);
        ctx.quadraticCurveTo(x, y, x + R, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // 选中边框高亮
        if (isSelected && !isHovered) {
            ctx.strokeStyle = '#1a73e8';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([3, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 文本
        let label = node.isOrphaned ? '\u26A0 ' + node.label : node.label;
        ctx.fillStyle = textColor;
        ctx.font = (hi ? 'bold ' : '') + '12px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        while (ctx.measureText(label).width > w - 28 && label.length > 4) label = label.slice(0, -1);
        if (label.length < (node.isOrphaned ? node.label.length + 2 : node.label.length)) label += '\u2026';
        ctx.fillText(label, x + w / 2 + 2, y + h / 2);

        // 属性节点右侧引用计数
        if (node.type === 'attr' && node.refs) {
            const cnt = node.refs.size;
            ctx.fillStyle = node.isOrphaned ? '#d32f2f' : stroke;
            ctx.font = 'bold 10px Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(String(cnt), x + w + 8, y + h / 2);
        }

        ctx.globalAlpha = 1;
    }

    function _drawEmpty() {
        _resize();
        if (!_c || _c.width === 0) return;
        const ctx = _ctx;
        const w = _c.width / (window.devicePixelRatio || 1);
        const h = _c.height / (window.devicePixelRatio || 1);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#bbb'; ctx.font = '14px Arial, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('暂无标记数据，导入 PDF 并标注后即可查看数据流向', w / 2, h / 2 + 6);
        ctx.font = '36px Arial, sans-serif'; ctx.fillStyle = '#d0d4d9';
        ctx.fillText('---', w / 2, h / 2 - 30);
    }

    // ═══════════════════════════════════════════
    //  悬停检测
    // ═══════════════════════════════════════════
    function _checkHover(e) {
        if (!_c || _dragging) return;
        const rect = _c.getBoundingClientRect();
        const mx = (e.clientX - rect.left - _panX) / _zoom;
        const my = (e.clientY - rect.top - _panY) / _zoom;

        let found = null;
        for (const node of _nodes) {
            if (mx >= node.x && mx <= node.x + node.w && my >= node.y && my <= node.y + node.h) {
                found = node; break;
            }
        }
        if (found !== _hovered) {
            _hovered = found;
            _c.style.cursor = found ? 'pointer' : 'grab';
            if (found) { _showTooltip(found, e); } else { _hideTooltip(); }
            _draw();
        } else if (found) {
            _showTooltip(found, e);
        }
    }

    // ═══════════════════════════════════════════
    //  提示框
    // ═══════════════════════════════════════════
    function _showTooltip(node, e) {
        const tip = document.getElementById('dataFlowTooltip');
        if (!tip) return;
        let html = '';
        if (node.type === 'attr') {
            html += `<div class="dataflow-tooltip__label">${pvEscape(node.label)}</div>`;
            html += '<div class="dataflow-tooltip__sep"></div>';
            if (node.isOrphaned) html += '<div class="dataflow-tooltip__warn">⚠ 孤立属性：有数据但未被任何表引用</div>';
            html += `<div class="dataflow-tooltip__row"><span>分类</span><span>${pvEscape(node.category)}</span></div>`;
            const fr = node.fillRate || { total: 0, filled: 0, pct: 0 };
            html += `<div class="dataflow-tooltip__row"><span>填充率</span><span>${fr.filled}/${fr.total} (${fr.pct}%)</span></div>`;
            const refNames = [];
            if (node.refs && node.refs.size > 0) {
                for (const tk of node.refs) {
                    const tn = _nodes.find(x => x.tableKey === tk);
                    refNames.push(tn ? tn.label : tk);
                }
            }
            html += `<div class="dataflow-tooltip__row"><span>引用表</span><span>${refNames.length > 0 ? refNames.join(', ') : '无'}</span></div>`;
        } else {
            html += `<div class="dataflow-tooltip__label">${pvEscape(node.label)}</div>`;
            html += '<div class="dataflow-tooltip__sep"></div>';
            html += `<div class="dataflow-tooltip__row"><span>类型</span><span>${node.isBuiltin ? '内置表' : '自定义表'}</span></div>`;
            const refCount = _edges.filter(e => e.to.id === node.id).length;
            html += `<div class="dataflow-tooltip__row"><span>引用属性</span><span>${refCount} 个</span></div>`;
            if (node.tableFill) {
                const tf = node.tableFill;
                html += `<div class="dataflow-tooltip__row"><span>数据完整度</span><span>${tf.pct}%</span></div>`;
                if (tf.emptyCount > 0) html += `<div class="dataflow-tooltip__warn">⚠ ${tf.emptyCount} 个引用字段无数据</div>`;
            }
        }

        tip.innerHTML = html;
        tip.hidden = false;

        const body = document.querySelector('.dataflow-body');
        if (!body) return;
        const br = body.getBoundingClientRect();
        const tw = tip.offsetWidth || 200;
        const th = tip.offsetHeight || 100;
        let left = e.clientX - br.left + 16;
        let top = e.clientY - br.top + 12;
        if (left + tw > br.width - 4) left = e.clientX - br.left - tw - 8;
        if (top + th > br.height - 4) top = e.clientY - br.top - th - 8;
        if (left < 4) left = 4;
        if (top < 4) top = 4;
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
    }

    function _hideTooltip() {
        const tip = document.getElementById('dataFlowTooltip');
        if (tip) tip.hidden = true;
    }

    // ═══════════════════════════════════════════
    //  公开 API
    // ═══════════════════════════════════════════
    return {
        render() {
            _c = document.getElementById('dataFlowCanvas');
            if (!_c) return;
            _ctx = _c.getContext('2d');
            _selected = null;
            _searchTerm = '';
            const si = document.getElementById('dataFlowSearch');
            if (si) si.value = '';
            _updateSelectPanel();

            if (markers.length === 0) {
                _nodes = []; _edges = [];
                _stats = { totalProps: 0, orphaned: 0, totalEdges: 0, lowFillTables: 0, healthScore: 0 };
                _updateStats(); _buildLegend();
                _drawEmpty();
                return;
            }

            _buildGraph();
            if (!_init) { _setupCanvas(); _init = true; }
            requestAnimationFrame(() => {
                _resize();
                _centerContent();
                _draw();
            });
        },

        open() {
            const overlay = document.getElementById('dataFlowOverlay');
            if (!overlay) return;
            overlay.hidden = false;
            requestAnimationFrame(() => this.render());
        },

        close() {
            const overlay = document.getElementById('dataFlowOverlay');
            if (overlay) overlay.hidden = true;
            _selected = null;
            _searchTerm = '';
            const si = document.getElementById('dataFlowSearch');
            if (si) si.value = '';
            _updateSelectPanel();
        },

        get selected() { return _selected; },
    };
})();

// 兼容旧函数名
function pvRenderDataFlow() { DataFlow.render(); }
function openDataFlow() { DataFlow.open(); }
function closeDataFlow() { DataFlow.close(); }

// ===== 新建自定义表格下拉面板 =====
let _newTableFields = []; // 临时字段列表（未保存）
let _editingTableId = null; // 编辑模式下的表格 ID（null = 新建模式）

function pvSetupNewTableDropdown() {
    const addBtn = document.getElementById('newTableBtn');
    const dropdown = document.getElementById('newTableDropdown');
    const closeBtn = document.getElementById('newTableDropdownClose');
    const addFieldBtn = document.getElementById('newTableAddFieldBtn');
    const cancelBtn = document.getElementById('newTableCancelBtn');
    const createBtn = document.getElementById('newTableCreateBtn');

    if (!addBtn || !dropdown) return;

    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.hidden) {
            openNewTableDropdown();
        } else {
            closeNewTableDropdown();
        }
    });

    closeBtn.addEventListener('click', closeNewTableDropdown);
    cancelBtn.addEventListener('click', closeNewTableDropdown);

    addFieldBtn.addEventListener('click', () => {
        addFieldToNewTable();
    });

    createBtn.addEventListener('click', () => {
        createOrSaveTable();
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.hidden && !dropdown.contains(e.target) && e.target !== addBtn) {
            closeNewTableDropdown();
        }
    });

    // 字段列表事件委托
    const list = document.getElementById('newTableFieldList');
    list.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.ins-field-row__del');
        if (delBtn) {
            const idx = parseInt(delBtn.dataset.idx);
            if (!isNaN(idx) && idx >= 0 && idx < _newTableFields.length) {
                _newTableFields.splice(idx, 1);
                renderNewTableFieldList();
            }
        }
    });

    list.addEventListener('change', (e) => {
        const row = e.target.closest('.ins-field-row');
        if (!row) return;
        const idx = parseInt(row.dataset.idx);
        if (isNaN(idx) || idx < 0 || idx >= _newTableFields.length) return;

        const labelInput = row.querySelector('.ins-field-row__label');
        const bindSelect = row.querySelector('.ins-field-row__bind');
        if (labelInput) _newTableFields[idx].label = labelInput.value.trim();
        if (bindSelect) _newTableFields[idx].bindField = bindSelect.value;
    });
}

function openNewTableDropdown() {
    const dropdown = document.getElementById('newTableDropdown');
    if (!dropdown) return;
    _editingTableId = null;
    // 重置表单
    _newTableFields = [{ label: '字段1', bindField: '' }];
    document.getElementById('newTableName').value = '表' + (getCustomTables().length + 1);
    document.querySelector('#newTableDropdown .ins-field-dropdown__header span').textContent = '新建自定义表格';
    document.getElementById('newTableCreateBtn').textContent = '创建表格';
    renderNewTableFieldList();
    dropdown.hidden = false;
}

function editCustomTable(tableId) {
    const ct = getCustomTables().find(t => t.id === tableId);
    if (!ct) return;
    const dropdown = document.getElementById('newTableDropdown');
    if (!dropdown) return;
    _editingTableId = tableId;
    _newTableFields = ct.columns.map(c => ({ label: c.label, bindField: c.bindField || '' }));
    if (_newTableFields.length === 0) _newTableFields = [{ label: '字段1', bindField: '' }];
    document.getElementById('newTableName').value = ct.name;
    document.querySelector('#newTableDropdown .ins-field-dropdown__header span').textContent = '编辑自定义表格';
    document.getElementById('newTableCreateBtn').textContent = '保存修改';
    renderNewTableFieldList();
    dropdown.hidden = false;
}

function closeNewTableDropdown() {
    const dropdown = document.getElementById('newTableDropdown');
    if (!dropdown) return;
    dropdown.hidden = true;
    _newTableFields = [];
    _editingTableId = null;
}

function createOrSaveTable() {
    const nameInput = document.getElementById('newTableName');
    const tableName = nameInput ? nameInput.value.trim() : '';
    if (!tableName) return;

    // 过滤空字段名
    const columns = _newTableFields
        .filter(f => f.label.trim())
        .map(f => ({
            key: 'col_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            label: f.label.trim(),
            bindField: f.bindField || '',
        }));

    if (columns.length === 0) return;

    if (_editingTableId) {
        // 编辑模式：更新已有表格
        const tables = getCustomTables();
        const ct = tables.find(t => t.id === _editingTableId);
        if (ct) {
            ct.name = tableName;
            ct.columns = columns;
            saveCustomTables(tables);
        }
        closeNewTableDropdown();
        renderCustomTabs();
        renderCustomSheets();
        pvSwitchToCustomTable(_editingTableId);
    } else {
        // 新建模式
        const tableId = addCustomTable(tableName, columns);
        closeNewTableDropdown();
        renderCustomTabs();
        renderCustomSheets();
        pvSwitchToCustomTable(tableId);
    }
    renderAllTables();
}
