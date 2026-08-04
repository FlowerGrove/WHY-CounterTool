/**
 * preview.js - 预览窗口模块
 *
 * 功能概述：
 * 直接读取主页内存中的 markers/documents/markerTypes 数据，渲染为多工作表预览表格。
 * 不依赖 localStorage 中转，数据永远是当前最新状态。
 * 支持 Summary 汇总、Detail List 详细列表，
 * 以及单元格编辑、批量编辑等功能。
 *
 * @module preview
 */

'use strict';

// ===== 批量编辑状态 =====
let _pvBatchSelected = new Set();    // 当前选中的 marker ID 集合
let _pvBatchCurrentSheet = 'detail'; // 当前激活的工作表名称

// ===== 工具：HTML 转义 + 单元格构造 =====

/**
 * HTML 转义：将特殊字符替换为 HTML 实体，防止 XSS 攻击
 * @param {*} s - 待转义的字符串
 * @returns {string} 转义后的安全字符串
 */
function pvEscape(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 构造普通的表格单元格 HTML
 * @param {*} text - 单元格文本内容
 * @param {string} [cls] - 可选的 CSS 类名
 * @returns {string} 单元格 HTML 字符串
 */
function pvCell(text, cls) {
    const c = cls ? ` class="${cls}"` : '';
    if (text === null || text === undefined || String(text).length === 0) {
        return `<td${c} class="cell-empty"></td>`;
    }
    return `<td${c}>${pvEscape(text)}</td>`;
}

/**
 * 构造可编辑单元格：内含 input，修改后通过事件委托写回 marker 对应字段
 * @param {Object} marker - 关联的标记对象
 * @param {string} field - 绑定的字段名
 * @param {*} text - 当前值
 * @param {boolean} [isCustomAttr] - 是否为自定义属性字段
 * @returns {string} 可编辑单元格 HTML 字符串
 */
function pvEditCell(marker, field, text, isCustomAttr) {
    const v = (text === null || text === undefined) ? '' : String(text);
    const attrFlag = isCustomAttr ? ' data-is-custom-attr="1"' : '';
    return `<td class="cell-editable" data-mid="${marker.id}" data-field="${field}"${attrFlag} title="点击编辑">
        <input type="text" value="${pvEscape(v)}" spellcheck="false" autocomplete="off" />
    </td>`;
}

/**
 * 构造表格行 HTML
 * @param {string} cells - 行内单元格 HTML 拼接
 * @param {string} [cls] - 可选的 CSS 类名
 * @returns {string} 表格行 HTML 字符串
 */
function pvRow(cells, cls) {
    return `<tr class="${cls || ''}">${cells}</tr>`;
}

// Process Connection 拼接：复用 utils.js 的 buildProcessConnection，保证与 Excel 导出一致
const pvBuildConnection = buildProcessConnection;

// ===== 按类型分组动态标签页 =====
/** @type {string} 上次渲染时的类型 ID 列表（逗号分隔），用于检测类型变化 */
let _pvLastTypeIds = '';

/**
 * 获取 markers 中出现的所有唯一仪表类型，按首次出现顺序排列
 * @returns {Array<{typeId: string, typeName: string, typeAbbr: string}>}
 */
function pvGetUniqueTypes() {
    const seen = new Set();
    const types = [];
    for (const m of markers) {
        if (!seen.has(m.typeId)) {
            seen.add(m.typeId);
            types.push({ typeId: m.typeId, typeName: m.typeName, typeAbbr: m.typeAbbr || m.typeName });
        }
    }
    return types;
}

/**
 * 检测类型列表是否发生变化（有新类型出现或旧类型消失）
 * @returns {boolean}
 */
function pvTypeIdsChanged() {
    const current = pvGetUniqueTypes().map(t => t.typeId).sort().join(',');
    if (current !== _pvLastTypeIds) {
        console.log('[PREVIEW] 类型列表变化: ' + (_pvLastTypeIds || '(空)') + ' → ' + current);
        _pvLastTypeIds = current;
        return true;
    }
    return false;
}

/**
 * 构建动态类型标签页按钮，插入到 nav 中 detail/summary 之后
 */
function pvRenderTypeTabs() {
    const nav = document.querySelector('.preview-tabs');
    if (!nav) return;
    const types = pvGetUniqueTypes();
    console.log('[PREVIEW] 渲染类型标签: ' + types.length + '种类型');

    // 移除旧动态标签
    nav.querySelectorAll('.preview-tab--type').forEach(t => t.remove());

    for (const t of types) {
        const btn = document.createElement('button');
        btn.className = 'preview-tab preview-tab--type';
        btn.dataset.sheet = 'type_' + t.typeId;
        btn.textContent = t.typeName;
        if (btn.dataset.sheet === _pvBatchCurrentSheet) {
            btn.classList.add('active');
        }
        nav.appendChild(btn);
    }
}

/**
 * 构建动态类型对应的 sheet 面板，插入到 preview-body 中
 */
function pvRenderTypeSheets() {
    const body = document.querySelector('.preview-body');
    if (!body) return;
    const types = pvGetUniqueTypes();

    // 移除旧类型面板
    body.querySelectorAll('.preview-sheet--type').forEach(s => s.remove());

    for (const t of types) {
        const section = document.createElement('section');
        section.className = 'preview-sheet preview-sheet--type';
        section.id = 'pvSheet-type_' + t.typeId;
        section.hidden = ('type_' + t.typeId) !== _pvBatchCurrentSheet;
        section.innerHTML = '<div class="preview-scroll"><table class="preview-table" id="pvTable-type_' + t.typeId + '"></table></div>';
        body.appendChild(section);
    }
}

/**
 * 渲染某个类型的过滤明细表（列与 Detail List 一致，不含复选框和 + 列）
 * @param {string} typeId - 类型 ID
 */
function pvRenderTypeDetail(typeId) {
    const table = document.getElementById('pvTable-type_' + typeId);
    if (!table) return;
    const sorted = pvSortedMarkers().filter(m => m.typeId === typeId);
    console.log('[PREVIEW] 渲染类型表: ' + typeId + ' (' + sorted.length + '行)');
    const cols = getSheetColumnsWithCustom('detailList');
    let html = '<thead><tr>' + cols.map(c => `<th>${pvEscape(c.header)}</th>`).join('') + '</tr></thead><tbody>';
    sorted.forEach((m, i) => {
        const cells = cols.map(c => pvRenderCellByCol(c, m, i)).join('');
        html += pvRow(cells);
    });
    html += '</tbody>';
    table.innerHTML = html;
}

/**
 * 对 markers 进行排序：按创建顺序（_globalOrder）
 * @returns {Object[]} 排序后的 markers 数组副本
 */
function pvSortedMarkers() {
    return [...markers].sort((a, b) => {
        return (a._globalOrder || 0) - (b._globalOrder || 0);
    });
}

/**
 * 渲染 Sheet 3: Detail List — 配置驱动的详细列表（含自定义列和绑定列）
 * 输出到 pvTable-detail 表格元素
 */
function pvRenderDetail() {
    const table = document.getElementById('pvTable-detail');
    const sorted = pvSortedMarkers();
    const cols = getSheetColumnsWithCustom('detailList');
    const boundCols = getBoundColumnDefs();
    let html = `<thead><tr><th class="pv-check-col"><input type="checkbox" class="pv-check-all" data-sheet="detail" title="全选/取消" /></th>${cols.map(c => `<th>${pvEscape(c.header)}</th>`).join('')}<th class="th-add-col"><button type="button" class="pv-add-col-btn" id="pvAddColBtn" title="添加绑定列">+</button></th></tr></thead><tbody>`;
    sorted.forEach((m, i) => {
        const checked = _pvBatchSelected.has(m.id) ? ' checked' : '';
        const cells = cols.map(c => pvRenderCellByCol(c, m, i)).join('') + '<td class="td-add-col"></td>';
        html += pvRow(`<td class="pv-check-col"><input type="checkbox" class="pv-check-row" data-mid="${m.id}"${checked} /></td>` + cells, _pvBatchSelected.has(m.id) ? 'pv-row-selected' : '');
    });
    html += '</tbody>';
    table.innerHTML = html;
}

/**
 * 根据 ID 查找 marker 对象
 * @param {string} id - marker ID
 * @returns {Object|undefined} 匹配的 marker 对象，未找到则返回 undefined
 */
function pvFindMarkerById(id) {
    return markers.find(m => m.id === id);
}

/**
 * 提交一次单元格编辑：写回 marker → 记录历史 → 重绘图纸 → 自动保存
 * @param {HTMLElement} td - 被编辑的 td 元素
 */
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
        addLog('编辑' + (isCustomAttr ? '自定义属性' : '单元格') + ': ' + field + ' → "' + clean + '"');
        // 同步刷新 Inspector（若当前打开的是同一标记，先保存未保存修改再刷新）
        if (typeof inspectorTarget !== 'undefined' && inspectorTarget === marker && typeof renderInspector === 'function') {
            if (typeof inspectorDirty !== 'undefined' && inspectorDirty && typeof saveInspector === 'function') {
                saveInspector();
            }
            renderInspector();
        }
    }
    input.value = clean;
}

/**
 * 设置可编辑表格的事件委托：在 preview-body 上监听 change/keydown 事件
 * 支持失焦/回车提交、Tab 键跳转、Escape 取消编辑
 */
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

/**
 * 更新批量编辑工具栏状态：显示/隐藏、选中计数、字段下拉填充
 */
function pvUpdateBatchBar() {
    const bar = document.getElementById('pvBatchBar');
    const countEl = document.getElementById('pvBatchCount');
    const applyBtn = document.getElementById('pvBatchApply');
    if (!bar || !countEl || !applyBtn) return;

    const count = _pvBatchSelected.size;
    if (count === 0) {
        bar.hidden = true;
        return;
    }

    bar.hidden = false;
    countEl.textContent = `已选 ${count} 项`;
    applyBtn.disabled = true;

    // 填充字段下拉
    pvPopulateBatchFields(_pvBatchCurrentSheet);
}

/**
 * 根据当前工作表填充批量编辑字段下拉选项
 * @param {string} sheetName - 当前工作表名称
 */
function pvPopulateBatchFields(sheetName) {
    const fieldSelect = document.getElementById('pvBatchField');
    const valueInput = document.getElementById('pvBatchValue');
    const applyBtn = document.getElementById('pvBatchApply');
    if (!fieldSelect) return;

    let editableCols;
    // Detail List
    const cols = getSheetColumnsWithCustom('detailList');
    editableCols = cols.filter(c => c.editable && c.field);

    let html = '<option value="">选择字段…</option>';
    for (const c of editableCols) {
        html += `<option value="${pvEscape(c.field)}">${pvEscape(c.header || c.field)}</option>`;
    }
    fieldSelect.innerHTML = html;

    // 字段或值变化时更新应用按钮状态
    const checkApply = () => {
        applyBtn.disabled = !(fieldSelect.value && _pvBatchSelected.size > 0);
    };
    fieldSelect.onchange = checkApply;
    if (valueInput) {
        valueInput.oninput = checkApply;
    }
    checkApply();
}

/**
 * 执行批量修改：将选中行的指定字段统一设置为新值
 * 写回 marker → 记录历史 → 重绘图纸 → 自动保存 → 刷新表格
 */
function pvApplyBatch() {
    const fieldSelect = document.getElementById('pvBatchField');
    const valueInput = document.getElementById('pvBatchValue');
    if (!fieldSelect || !valueInput) return;

    const field = fieldSelect.value;
    const newValue = valueInput.value.trim();
    if (!field || _pvBatchSelected.size === 0) return;

    // 判断是否为自定义属性字段
    const isCustomAttr = field.startsWith('ca_');
    const changes = [];

    for (const mid of _pvBatchSelected) {
        const marker = pvFindMarkerById(mid);
        if (!marker) continue;

        let oldVal;
        if (isCustomAttr) {
            oldVal = getCustomAttrValue(marker, field);
        } else {
            oldVal = marker[field] !== undefined ? marker[field] : '';
        }
        const oldForCmp = (oldVal === undefined || oldVal === null) ? '' : String(oldVal);

        if (oldForCmp === newValue) continue;

        if (isCustomAttr) {
            setCustomAttrValue(marker, field, newValue.length > 0 ? newValue : '');
        } else {
            marker[field] = newValue.length > 0 ? newValue : undefined;
        }
        changes.push({ marker, field, old: oldForCmp, after: newValue });
    }

    if (changes.length > 0) {
        pushHistory({
            type: 'bulkUpdate',
            markers: changes.map(c => c.marker),
            perMarkerChanges: changes.map(c => ({ [c.field]: c.old })),
            perMarkerAfter: changes.map(c => ({ [c.field]: c.after })),
        });
        requestRender();
        scheduleAutosave();
        addLog('批量修改' + (isCustomAttr ? '自定义属性' : '') + ': ' + changes.length + '行 ' + field + ' → "' + newValue + '"');
        // 重新渲染当前表格
        pvRerenderCurrentSheet();
        // 同步刷新 Inspector（若当前打开的是被批量编辑的标记，先保存未保存修改再刷新）
        if (typeof inspectorTarget !== 'undefined' && inspectorTarget && _pvBatchSelected.has(inspectorTarget.id) && typeof renderInspector === 'function') {
            if (typeof inspectorDirty !== 'undefined' && inspectorDirty && typeof saveInspector === 'function') {
                saveInspector();
            }
            renderInspector();
        }
    }

    // 清空值输入框，保留选中状态
    valueInput.value = '';
    const applyBtn = document.getElementById('pvBatchApply');
    if (applyBtn) applyBtn.disabled = true;
}

/**
 * 取消批量选择：清空选中集合并重新渲染当前工作表
 */
function pvCancelBatch() {
    addLog('取消批量选择');
    _pvBatchSelected.clear();
    pvRerenderCurrentSheet();
    const bar = document.getElementById('pvBatchBar');
    if (bar) bar.hidden = true;
}

/**
 * 重新渲染当前激活的工作表
 */
function pvRerenderCurrentSheet() {
    console.log('[PREVIEW] 重新渲染工作表: ' + _pvBatchCurrentSheet);
    if (_pvBatchCurrentSheet.startsWith('type_')) {
        const typeId = _pvBatchCurrentSheet.slice(5);
        pvRenderTypeDetail(typeId);
        return;
    }
    const renderer = pvSheetRenderers[_pvBatchCurrentSheet];
    if (renderer) renderer();
}

/**
 * 设置批量编辑复选框的事件委托：全选/取消、单行选择
 */
function pvSetupBatchCheckboxes() {
    const body = document.querySelector('.preview-body');
    if (!body || body._batchDelegated) return;
    body._batchDelegated = true;

    body.addEventListener('change', (e) => {
        // 全选/取消
        const checkAll = e.target.closest('.pv-check-all');
        if (checkAll) {
            const markersInSheet = markers;

            if (checkAll.checked) {
                for (const m of markersInSheet) _pvBatchSelected.add(m.id);
            } else {
                for (const m of markersInSheet) _pvBatchSelected.delete(m.id);
            }
            pvRerenderCurrentSheet();
            pvUpdateBatchBar();
            return;
        }

        // 单行选择
        const checkRow = e.target.closest('.pv-check-row');
        if (checkRow) {
            const mid = checkRow.dataset.mid;
            if (!mid) return;
            if (checkRow.checked) {
                _pvBatchSelected.add(mid);
            } else {
                _pvBatchSelected.delete(mid);
            }
            pvRerenderCurrentSheet();
            pvUpdateBatchBar();
        }
    });
}

/**
 * 根据列定义生成单元格 HTML（配置驱动）
 * @param {Object} col - 列定义对象
 * @param {Object} marker - 标记对象
 * @param {number} index - 行索引
 * @returns {string} 单元格 HTML 字符串
 */
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
    // 可编辑字段
    if (col.editable) {
        return pvEditCell(marker, col.field, col.getter(marker, index), col.isCustomAttr);
    }
    // 普通字段
    return pvCell(col.getter(marker, index));
}

/**
 * 定位到图纸上的标记位置：关闭预览 → 居中放大 → 闪烁高亮
 * @param {Object} m - marker 对象
 */
function pvLocateMarker(m) {
    addLog('定位标记到图纸');
    closePreview();
    if (zoom < 1.5) zoom = 1.5;
    panX = -m.vx * zoom;
    panY = -m.vy * zoom;
    requestRender();
    flashLocate(m);
}

/**
 * 在 preview-body 上设置定位按钮的点击事件委托（覆盖所有表格）
 */
function pvSetupLocateButtons() {
    const body = document.querySelector('.preview-body');
    if (!body || body._locateDelegated) return;
    body._locateDelegated = true;
    body.addEventListener('click', (e) => {
        const btn = e.target.closest('.pv-locate-btn');
        if (!btn) return;
        const marker = pvFindMarkerById(btn.dataset.mid);
        if (marker) pvLocateMarker(marker);
    });
}

/**
 * 渲染 Summary：按文件/页分组汇总
 */
function pvRenderSummary() {
    // 按文件汇总
    const fileEl = document.getElementById('pvSummaryFile');
    if (fileEl) {
        let html = '<h3 class="preview-summary__title">By File</h3>';
        const isSingleMultiPageDoc = documents.length === 1 && documents[0] && documents[0].pageCount > 1;

        if (isSingleMultiPageDoc) {
            html += '<table class="preview-table"><thead><tr><th>Page</th><th>Type</th><th>Description</th><th>Count</th></tr></thead><tbody>';
            const doc = documents[0];
            html += pvRow(
                `<td class="row-title">${pvEscape(doc.fileName)}</td><td></td><td></td><td class="cell-number">${markers.length} markers</td>`,
                'row-title'
            );

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
            }
        } else {
            html += '<table class="preview-table"><thead><tr><th>File</th><th>Type</th><th>Description</th><th>Count</th></tr></thead><tbody>';
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
            }
        }
        html += pvRow(
            `<td class="row-grand">Grand Total</td><td></td><td></td><td class="cell-number row-grand">${markers.length}</td>`,
            'row-grand'
        );
        html += '</tbody></table>';
        fileEl.innerHTML = html;
    }
}

/**
 * 工作表渲染器映射表：sheet 名称 → 渲染函数
 */
const pvSheetRenderers = {
    summary: pvRenderSummary,
    detail: pvRenderDetail,
};

/**
 * 设置 Tab 切换的事件委托（含自定义表格编辑/删除按钮）
 */
function pvSetupTabs() {
    const nav = document.querySelector('.preview-tabs');
    if (!nav) return;

    nav.addEventListener('click', (e) => {
        // 标签切换
        const tab = e.target.closest('.preview-tab');
        if (!tab) return;
        const sheetName = tab.dataset.sheet;
        if (sheetName) {
            pvSwitchToTab(sheetName);
        }
    });
}

/**
 * 切换到指定工作表标签
 * @param {string} sheetName - 工作表名称（如 'detail', 'summary' 等）
 */
function pvSwitchToTab(sheetName) {
    addLog('切换预览标签: ' + sheetName);
    if (_pvBatchCurrentSheet !== sheetName) {
        _pvBatchSelected.clear();
        pvUpdateBatchBar();
    }
    _pvBatchCurrentSheet = sheetName;

    document.querySelectorAll('.preview-tab.active, [data-sheet].active').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.preview-sheet').forEach(p => p.hidden = true);

    const tab = document.querySelector(`[data-sheet="${sheetName}"]`);
    if (tab) tab.classList.add('active');
    const panel = document.getElementById('pvSheet-' + sheetName);
    if (panel) panel.hidden = false;

    pvRerenderCurrentSheet();
}

/**
 * 渲染所有工作表（内置）
 */
function renderAllTables() {
    for (const key of Object.keys(pvSheetRenderers)) {
        pvSheetRenderers[key]();
    }
}

/**
 * 渲染预览窗口主内容：所有工作表、元信息、底部统计
 */
function renderPreview() {
    addLog('渲染预览: ' + markers.length + '个标记');
    if (markers.length === 0) {
        document.getElementById('pvEmpty').hidden = false;
        document.querySelectorAll('.preview-sheet').forEach(p => p.hidden = true);
        document.getElementById('pvMeta').textContent = '';
        document.getElementById('pvFooter').textContent = '';
        // 清空类型标签
        const nav = document.querySelector('.preview-tabs');
        if (nav) nav.querySelectorAll('.preview-tab--type').forEach(t => t.remove());
        const body = document.querySelector('.preview-body');
        if (body) body.querySelectorAll('.preview-sheet--type').forEach(s => s.remove());
        _pvLastTypeIds = '';
        return;
    }
    document.getElementById('pvEmpty').hidden = true;

    pvRenderSummary();
    pvRenderDetail();

    // 渲染类型标签页和面板
    pvRenderTypeTabs();
    pvRenderTypeSheets();
    pvTypeIdsChanged(); // 初始化 _pvLastTypeIds，避免后续重复重建

    // 渲染当前工作表内容（含类型表）
    pvRerenderCurrentSheet();

    // 顶部元信息
    const docCount = documents.length;
    document.getElementById('pvMeta').textContent =
        `${docCount} 个文件 · ${markers.length} 个标记`;

    // 底部信息
    document.getElementById('pvFooter').textContent =
        `总计 ${markers.length}（单元格可直接点击编辑）`;
}

/**
 * 打开预览窗口：渲染所有表格并显示预览浮层
 */
function openPreview() {
    addLog('打开预览窗口');
    // 关闭 Inspector 避免遮挡预览窗口
    if (typeof closeInspector === 'function') closeInspector();
    renderPreview();
    document.getElementById('previewOverlay').hidden = false;
}

/**
 * 关闭预览窗口：隐藏浮层并清空批量选择状态
 */
function closePreview() {
    addLog('关闭预览窗口');
    document.getElementById('previewOverlay').hidden = true;
    _pvBatchSelected.clear();
    const bar = document.getElementById('pvBatchBar');
    if (bar) bar.hidden = true;
    // 关闭可能打开的绑定对话框
    const bindBackdrop = document.getElementById('cfBindBackdrop');
    const manageBackdrop = document.getElementById('cfBindManageBackdrop');
    if (bindBackdrop) bindBackdrop.hidden = true;
    if (manageBackdrop) manageBackdrop.hidden = true;
    // 清除选中状态
    if (typeof selectedMarker !== 'undefined') selectedMarker = null;
    if (typeof inspectorTarget !== 'undefined') inspectorTarget = null;
    requestRender();
}

/**
 * 设置列绑定功能：+ 按钮 → 绑定对话框 → 管理对话框
 * 使用事件委托在 preview-body 上监听 + 按钮点击
 */
function pvSetupColumnBinding() {
    const body = document.querySelector('.preview-body');
    if (!body || body._colBindingDelegated) return;
    body._colBindingDelegated = true;

    // + 按钮点击 → 打开绑定对话框
    body.addEventListener('click', (e) => {
        const btn = e.target.closest('#pvAddColBtn');
        if (!btn) return;
        pvOpenBindDialog();
    });

    // ===== 绑定对话框事件 =====
    const bindBackdrop = document.getElementById('cfBindBackdrop');
    const bindName = document.getElementById('cfBindName');
    const bindField = document.getElementById('cfBindField');
    const bindConfirm = document.getElementById('cfBindConfirm');
    const bindCancel = document.getElementById('cfBindCancel');
    const bindClose = document.getElementById('cfBindClose');

    if (bindClose) bindClose.addEventListener('click', pvCloseBindDialog);
    if (bindCancel) bindCancel.addEventListener('click', pvCloseBindDialog);
    if (bindBackdrop) bindBackdrop.addEventListener('click', (e) => {
        if (e.target === bindBackdrop) pvCloseBindDialog();
    });

    // 绑定对话框内 Enter 键提交
    if (bindName) bindName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (bindConfirm) bindConfirm.click();
        }
    });
    if (bindField) bindField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (bindConfirm) bindConfirm.click();
        }
    });

    if (bindConfirm) bindConfirm.addEventListener('click', () => {
        const name = bindName ? bindName.value.trim() : '';
        const field = bindField ? bindField.value : '';
        if (!name) { showToast('请输入列名'); return; }
        if (!field) { showToast('请选择绑定属性'); return; }
        // 重名校验
        const existing = getColumnBindings();
        if (existing.some(b => b.name === name)) {
            showToast('列名已存在');
            return;
        }
        addColumnBinding(name, field);
        addLog('添加列绑定: ' + name + ' → ' + field);
        pvCloseBindDialog();
        pvRerenderCurrentSheet();
        showToast('已添加列「' + name + '」');
    });

    // ===== 管理对话框事件 =====
    const manageBtn = document.getElementById('pvManageColsBtn');
    const manageBackdrop = document.getElementById('cfBindManageBackdrop');
    const manageClose = document.getElementById('cfBindManageClose');

    if (manageBtn) manageBtn.addEventListener('click', pvOpenManageDialog);
    if (manageClose) manageClose.addEventListener('click', pvCloseManageDialog);
    if (manageBackdrop) manageBackdrop.addEventListener('click', (e) => {
        if (e.target === manageBackdrop) pvCloseManageDialog();
    });

    // 管理列表内的事件委托
    const manageList = document.getElementById('cfBindManageList');
    if (manageList) {
        manageList.addEventListener('click', (e) => {
            const delBtn = e.target.closest('.cf-manage-item-del');
            if (delBtn) {
                const id = delBtn.dataset.bindingId;
                if (id) {
                    const bindings = getColumnBindings();
                    const b = bindings.find(x => x.id === id);
                    removeColumnBinding(id);
                    addLog('删除列绑定: ' + (b ? b.name : id));
                    pvRerenderCurrentSheet();
                    pvRenderManageList();
                    showToast('已删除绑定列');
                }
                return;
            }
            const renameBtn = e.target.closest('.cf-manage-item-desc--editable');
            if (renameBtn) {
                const id = renameBtn.dataset.bindingId;
                const bindings = getColumnBindings();
                const b = bindings.find(x => x.id === id);
                if (!b) return;
                pvRenameBinding(id, b.name);
            }
        });
    }
}

/**
 * 填充绑定对话框的字段下拉选项
 */
function pvPopulateBindFields() {
    const select = document.getElementById('cfBindField');
    if (!select) return;
    const fields = getAllBindableFields();
    let html = '<option value="">选择属性…</option>';
    for (const f of fields) {
        html += `<option value="${pvEscape(f.key)}">${pvEscape(f.label)}</option>`;
    }
    select.innerHTML = html;
}

/**
 * 打开列绑定对话框
 */
function pvOpenBindDialog() {
    addLog('打开列绑定对话框');
    pvPopulateBindFields();
    const backdrop = document.getElementById('cfBindBackdrop');
    const nameInput = document.getElementById('cfBindName');
    if (backdrop) backdrop.hidden = false;
    if (nameInput) { nameInput.value = ''; setTimeout(() => nameInput.focus(), 100); }
    const fieldSelect = document.getElementById('cfBindField');
    if (fieldSelect) fieldSelect.value = '';
}

/**
 * 关闭列绑定对话框
 */
function pvCloseBindDialog() {
    addLog('关闭列绑定对话框');
    const backdrop = document.getElementById('cfBindBackdrop');
    if (backdrop) backdrop.hidden = true;
}

/**
 * 渲染管理对话框中的绑定列表
 */
function pvRenderManageList() {
    const list = document.getElementById('cfBindManageList');
    if (!list) return;
    const bindings = getColumnBindings();
    if (bindings.length === 0) {
        list.innerHTML = '<div class="cf-manage-empty">暂无绑定列，点击表格头部的 + 按钮添加</div>';
        return;
    }
    let html = '';
    for (const b of bindings) {
        let fieldLabel = b.bindField || '未绑定';
        const builtin = ALL_MARKER_ATTRIBUTES.find(a => a.key === b.bindField);
        if (builtin) {
            fieldLabel = builtin.label + ' (内置)';
        } else {
            const defs = getCustomAttrDefs();
            const ca = defs.find(d => d.key === b.bindField);
            if (ca) fieldLabel = ca.label + ' (自定义)';
        }
        html += '<div class="cf-manage-item">';
        html += '<span class="cf-manage-item-label">' + pvEscape(b.name) + '</span>';
        html += '<span class="cf-manage-item-desc cf-manage-item-desc--editable" data-binding-id="' + b.id + '" title="点击重命名">' + pvEscape(fieldLabel) + '</span>';
        html += '<button class="cf-manage-item-del" data-binding-id="' + b.id + '" title="删除绑定"><i class="fa-solid fa-trash"></i></button>';
        html += '</div>';
    }
    list.innerHTML = html;
}

/**
 * 打开管理对话框
 */
function pvOpenManageDialog() {
    addLog('打开列绑定管理');
    pvRenderManageList();
    const backdrop = document.getElementById('cfBindManageBackdrop');
    if (backdrop) backdrop.hidden = false;
}

/**
 * 关闭管理对话框
 */
function pvCloseManageDialog() {
    addLog('关闭列绑定管理');
    const backdrop = document.getElementById('cfBindManageBackdrop');
    if (backdrop) backdrop.hidden = true;
}

/**
 * 重命名绑定列
 * @param {string} id - 绑定 id
 * @param {string} currentName - 当前列名
 */
async function pvRenameBinding(id, currentName) {
    const newName = await showPromptDialog('重命名列', currentName, '新列名');
    if (newName === null || newName.trim() === '') return;
    const trimmed = newName.trim();
    if (trimmed === currentName) return;
    const bindings = getColumnBindings();
    if (bindings.some(b => b.id !== id && b.name === trimmed)) {
        showToast('列名已存在');
        return;
    }
    updateColumnBinding(id, { name: trimmed });
    pvRerenderCurrentSheet();
    pvRenderManageList();
    showToast('已重命名为「' + trimmed + '」');
    addLog('重命名绑定列: ' + currentName + ' → ' + trimmed);
}

/**
 * 刷新预览（供 Inspector 保存后调用）
 */
function pvRefreshPreview() {
    const overlay = document.getElementById('previewOverlay');
    if (!overlay || overlay.hidden) return;
    addLog('刷新预览');
    // 标记全部删除时显示空状态
    if (markers.length === 0) {
        renderPreview();
        return;
    }
    // 类型列表变化时重建标签页和面板
    if (pvTypeIdsChanged()) {
        pvRenderTypeTabs();
        pvRenderTypeSheets();
        // 如果当前标签对应的类型已不存在，回退到 detail
        if (_pvBatchCurrentSheet.startsWith('type_')) {
            const typeId = _pvBatchCurrentSheet.slice(5);
            if (!markers.some(m => m.typeId === typeId)) {
                _pvBatchCurrentSheet = 'detail';
                pvSwitchToTab('detail');
            }
        }
    }
    pvRerenderCurrentSheet();
}

/**
 * 初始化：DOMContentLoaded 时绑定所有事件和渲染器
 */
document.addEventListener('DOMContentLoaded', () => {
    pvSetupTabs();
    pvSetupEditableTables();
    pvSetupLocateButtons();
    pvSetupBatchCheckboxes();
    pvSetupColumnBinding();

    document.getElementById('previewBtn').addEventListener('click', openPreview);
    document.getElementById('previewCloseBtn').addEventListener('click', closePreview);

    // 批量编辑工具栏按钮
    const batchApply = document.getElementById('pvBatchApply');
    const batchCancel = document.getElementById('pvBatchCancel');
    if (batchApply) batchApply.addEventListener('click', pvApplyBatch);
    if (batchCancel) batchCancel.addEventListener('click', pvCancelBatch);

    const previewOverlay = document.getElementById('previewOverlay');
    previewOverlay.addEventListener('click', (e) => {
        if (e.target === previewOverlay) closePreview();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // 优先关闭绑定/管理对话框
            const bindBackdrop = document.getElementById('cfBindBackdrop');
            const manageBackdrop = document.getElementById('cfBindManageBackdrop');
            if (manageBackdrop && !manageBackdrop.hidden) {
                pvCloseManageDialog();
                return;
            }
            if (bindBackdrop && !bindBackdrop.hidden) {
                pvCloseBindDialog();
                return;
            }
            if (previewOverlay && !previewOverlay.hidden) {
                closePreview();
            }
        }
    });
});
