/**
 * export-excel.js - Excel导出功能，生成仪表统计表格
 * 支持导出 By File、Type Summary、Detail List 和自定义表格
 */

/**
 * 设置表头行样式：加粗深色字体 + 浅灰背景 + 垂直居中
 * @param {ExcelJS.Row} row - 表头行对象
 */
function styleHeaderRow(row) {
    row.font = { bold: true, color: { argb: 'FF333333' } };
    row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F3F4' },
    };
    row.alignment = { vertical: 'middle' };
}

// Excel 输出统一转英文双引号/单引号（与自定义类型 normalizeQuotes 规则一致）
// 传入任意值，返回已转换的字符串；null/undefined → 空串
const qExcel = (s) => normalizeQuotes(s == null ? '' : String(s));

/**
 * 估算文本显示宽度（ExcelJS 列宽单位近似等于默认字体下字符宽度）
 * 中文/全角字符按 2 计算，英文/数字按 1 计算
 * @param {string} text - 待估算的文本
 * @returns {number} 估算宽度
 */
function measureTextWidth(text) {
    if (!text) return 0;
    let w = 0;
    for (const ch of String(text)) {
        // 简易判断：CJK 区段或全角符号按 2 字符宽
        const code = ch.codePointAt(0);
        const isCJK = (
            (code >= 0x1100 && code <= 0x115F) ||
            (code >= 0x2E80 && code <= 0xA4CF) ||
            (code >= 0xAC00 && code <= 0xD7A3) ||
            (code >= 0xF900 && code <= 0xFAFF) ||
            (code >= 0xFE30 && code <= 0xFE4F) ||
            (code >= 0xFF00 && code <= 0xFF60) ||
            (code >= 0xFFE0 && code <= 0xFFE6) ||
            (code >= 0x20000 && code <= 0x2FFFD) ||
            (code >= 0x30000 && code <= 0x3FFFD)
        );
        w += isCJK ? 2 : 1;
    }
    return w;
}

/**
 * 自动调整工作表所有列宽：基于表头和单元格内容估算
 * @param {ExcelJS.Worksheet} ws - 工作表对象
 * @param {string[]} [extraHeaders] - 可选，按列号（1-based）传入列头文本数组；用于表头未写入 col.header 的工作表
 */
function autoFitColumns(ws, extraHeaders = null) {
    ws.columns.forEach(col => {
        let maxLen = 0;
        const hdr = (extraHeaders && extraHeaders[col.number - 1]) || col.header;
        if (hdr) maxLen = measureTextWidth(String(hdr));
        col.eachCell({ includeEmpty: false }, cell => {
            // 跳过合并单元格（横幅标题/分组合并），避免长标题文本污染整列宽度
            if (cell.isMerged) return;
            if (cell.value === null || cell.value === undefined) return;
            let txt;
            if (typeof cell.value === 'object') {
                // 处理富文本/超链接对象
                txt = cell.value.text || cell.value.hyperlink || cell.value.result || '';
            } else {
                txt = String(cell.value);
            }
            // 多行文本按最长行计算
            const lines = String(txt).split(/\r?\n/);
            for (const ln of lines) {
                const w = measureTextWidth(ln);
                if (w > maxLen) maxLen = w;
            }
        });
        let w = Math.min(Math.max(maxLen + 2, 6), 50);
        // ExcelJS 会把宽度恰为 9（内置默认列宽）的列视为默认列并在序列化时省略，
        // 导致该列宽度丢失，此处避开 9 确保列宽一定写入文件
        if (w === 9) w = 10;
        col.width = w;
    });
}

/**
 * 按当前列宽估算数据行所需行高（wrapText 生效后的最长行数 × 15）
 * @param {ExcelJS.Worksheet} ws - 工作表对象
 * @param {ExcelJS.Row} row - 数据行对象
 * @returns {number} 估算行高
 */
function estimateRowHeight(ws, row) {
    let maxLines = 1;
    for (let c = 1; c <= ws.columnCount; c++) {
        const val = row.getCell(c).value;
        if (val === null || val === undefined) continue;
        const text = String(typeof val === 'object' ? (val.text || val.result || '') : val);
        const colWidth = ws.getColumn(c).width || 10;
        // 估算每行可容纳字符数（中文按 2 计，列宽单位约等于字符数）
        const charPerLine = Math.max(2, Math.floor(colWidth / 1.1));
        let lines = 0;
        for (const ln of text.split(/\r?\n/)) {
            lines += Math.max(1, Math.ceil(measureTextWidth(ln) / charPerLine));
        }
        if (lines > maxLines) maxLines = lines;
    }
    return Math.max(22, maxLines * 15);
}

/**
 * 统一应用表格格式：所有单元格 Arial 字体 + 居中 + 细边框
 * @param {ExcelJS.Worksheet} ws - 工作表对象
 */
function applyTableFormat(ws) {
    const border = {
        top: { style: 'thin', color: { argb: 'FF808080' } },
        left: { style: 'thin', color: { argb: 'FF808080' } },
        bottom: { style: 'thin', color: { argb: 'FF808080' } },
        right: { style: 'thin', color: { argb: 'FF808080' } },
    };
    const colCount = ws.columns.length;
    ws.eachRow({ includeEmpty: true }, row => {
        for (let i = 1; i <= colCount; i++) {
            const cell = row.getCell(i);
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = border;
            // 强制 Arial 字体，保留原有 bold/color/size 属性
            const f = cell.font || {};
            cell.font = { ...f, name: 'Arial', size: f.size || 10 };
        }
    });
}

/**
 * 下载 Excel 文件到本地
 * @param {ArrayBuffer} buffer - Excel 二进制数据
 * @param {string} filename - 下载文件名
 * @returns {Promise<void>}
 */
async function downloadExcelBuffer(buffer, filename) {
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 导出 Excel 文件入口
 * 检查标记是否就绪，然后调用核心导出逻辑
 * @returns {Promise<void>}
 */
async function exportExcel() {
    if (markers.length === 0) {
        alert('还没有标记，请先在图纸上点击标注');
        return;
    }
    addLog('开始导出Excel统计表格...');
    await runExportTask(
        [exportExcelBottomBtn],
        exportExcelCore,
        '正在生成统计表格…',
        'Excel 导出完成',
        '导出 Excel 失败，请检查网络后重试（需加载 ExcelJS）'
    );
}

/**
 * 同时导出 Excel 和 PDF（标注版）
 * 检查标记和文档是否就绪，然后依次执行导出
 * @returns {Promise<void>}
 */
async function exportBoth() {
    if (markers.length === 0) {
        alert('还没有标记，请先在图纸上点击标注');
        return;
    }
    if (documents.length === 0) {
        alert('还没有导入PDF文件');
        return;
    }
    addLog('开始同步导出Excel和PDF...');
    await runExportTask(
        [exportBothBtn, exportExcelBottomBtn, exportBtn],
        async () => {
            await exportExcelCore();
            await exportMarkedPDFCore();
        },
        '正在同步导出…',
        'Excel 和 PDF 导出完成',
        '导出失败，请检查网络后重试'
    );
}

/**
 * Excel 导出核心逻辑：创建 By File、Type Summary、Detail List 和自定义表格
 * 根据标记数据生成完整的工作簿
 * @returns {Promise<void>}
 */
async function exportExcelCore() {
    const ExcelJS = await loadExcelJS();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'PDF Annotator';
    wb.created = new Date();

    // Sheet 1: By File - 按文件/页面统计各类型标记数量
    addLog('导出Excel: By File');
    const wsByFile = wb.addWorksheet('By File', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    wsByFile.columns = [
        { header: 'File', key: 'file', width: 36 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Description', key: 'desc', width: 16 },
        { header: 'Count', key: 'count', width: 8 },
    ];
    styleHeaderRow(wsByFile.getRow(1));

    const isSingleMultiPageDoc =
        documents.length === 1 &&
        documents[0] &&
        documents[0].pageCount > 1;

    if (isSingleMultiPageDoc) {
        wsByFile.columns = [
            { header: 'Page', key: 'page', width: 10 },
            { header: 'Type', key: 'type', width: 12 },
            { header: 'Description', key: 'desc', width: 16 },
            { header: 'Count', key: 'count', width: 8 },
        ];
        styleHeaderRow(wsByFile.getRow(1));

        const doc = documents[0];
        const titleRow = wsByFile.addRow({
            page: `📄 ${doc.fileName}`,
            type: '',
            desc: '',
            count: `${markers.length} markers`,
        });
        titleRow.font = { bold: true, size: 12 };
        titleRow.getCell(4).font = { bold: true, color: { argb: 'FF1A73E8' } };

        wsByFile.addRow({});

        const byPage = new Map();
        for (const m of markers) {
            if (!byPage.has(m.pageIndex)) byPage.set(m.pageIndex, []);
            byPage.get(m.pageIndex).push(m);
        }

        const sortedPages = [...byPage.keys()].sort((a, b) => a - b);

        for (const pageIndex of sortedPages) {
            const pageMarkers = byPage.get(pageIndex);

            const pageHeader = wsByFile.addRow({
                page: `Page ${pageIndex}`,
                type: '',
                desc: '',
                count: `${pageMarkers.length}`,
            });
            pageHeader.font = { bold: true };
            pageHeader.getCell(1).font = { bold: true, color: { argb: 'FF1A73E8' } };

            const typeCounts = new Map();
            for (const m of pageMarkers) {
                if (!typeCounts.has(m.typeId)) {
                    typeCounts.set(m.typeId, {
                        count: 0,
                        name: m.typeName,
                        fullName: m.typeFullName || '',
                    });
                }
                typeCounts.get(m.typeId).count++;
                if (m.typeFullName) typeCounts.get(m.typeId).fullName = m.typeFullName;
            }

            for (const [id, tc] of typeCounts) {
                wsByFile.addRow({
                    page: '',
                    type: tc.name,
                    desc: tc.fullName,
                    count: tc.count,
                });
            }

            wsByFile.addRow({});
        }
    } else {
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
                    counts.set(key, {
                        count: 0,
                        name: m.typeName,
                        fullName: m.typeFullName || '',
                    });
                }
                const entry = counts.get(key);
                entry.count++;
                if (m.typeFullName) entry.fullName = m.typeFullName;
            }

            const typeRows = [];
            for (const t of markerTypes) {
                const c = counts.get(t.id);
                if (c) typeRows.push({
                    name: t.name,
                    fullName: c.fullName || t.fullName || '',
                    count: c.count,
                });
            }
            for (const [id, c] of counts) {
                if (!markerTypes.some(t => t.id === id)) {
                    typeRows.push({
                        name: c.name || id,
                        fullName: c.fullName || '',
                        count: c.count,
                    });
                }
            }

            typeRows.forEach((row, idx) => {
                wsByFile.addRow({
                    file: idx === 0 ? fileName : '',
                    type: row.name,
                    desc: row.fullName,
                    count: row.count,
                });
            });

            const totalRow = wsByFile.addRow({
                file: '',
                type: 'Subtotal',
                desc: '',
                count: list.length,
            });
            totalRow.font = { bold: true };
            totalRow.getCell(2).font = { bold: true, color: { argb: 'FF555555' } };

            wsByFile.addRow({});
        }
    }

    const grand = wsByFile.addRow({
        file: 'Grand Total',
        type: '',
        desc: '',
        count: markers.length,
    });
    grand.font = { bold: true };

    // Sheet 2: Type Summary - 按类型统计
    addLog('导出Excel: Type Summary');
    const wsType = wb.addWorksheet('Type Summary', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    wsType.columns = [
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Description', key: 'desc', width: 16 },
        { header: 'Count', key: 'count', width: 8 },
    ];
    styleHeaderRow(wsType.getRow(1));

    const typeCounts = new Map();
    for (const m of markers) {
        const key = m.typeId;
        if (!typeCounts.has(key)) {
            typeCounts.set(key, {
                count: 0,
                name: m.typeName,
                fullName: m.typeFullName || '',
            });
        }
        const entry = typeCounts.get(key);
        entry.count++;
        if (m.typeFullName) entry.fullName = m.typeFullName;
    }
    for (const t of markerTypes) {
        const c = typeCounts.get(t.id);
        if (!c) continue;
        wsType.addRow({
            type: t.name,
            desc: c.fullName || t.fullName || '',
            count: c.count,
        });
    }
    for (const [id, c] of typeCounts) {
        if (markerTypes.some(t => t.id === id)) continue;
        wsType.addRow({
            type: c.name || id,
            desc: c.fullName || '',
            count: c.count,
        });
    }
    const typeTotal = wsType.addRow({ type: 'Total', desc: '', count: markers.length });
    typeTotal.font = { bold: true };

    // Sheet 3: Detail List - 明细清单
    addLog('导出Excel: Detail List');
    const detailCols = getSheetColumnsWithCustom('detailList').filter(c => c.type !== 'locate');
    const wsDetail = wb.addWorksheet('Detail List', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    // 动态设置列 key 和宽度
    detailCols.forEach((col, idx) => {
        wsDetail.getColumn(idx + 1).key = col.key;
        wsDetail.getColumn(idx + 1).width = col.width || 10;
    });
    // 设置表头
    const detailHdrRow = wsDetail.getRow(1);
    detailCols.forEach((col, idx) => {
        detailHdrRow.getCell(idx + 1).value = col.header;
    });
    styleHeaderRow(detailHdrRow);

    const sorted = [...markers].sort((a, b) => (a._globalOrder || 0) - (b._globalOrder || 0));

    sorted.forEach((m, i) => {
        const row = wsDetail.addRow();
        detailCols.forEach((col, colIdx) => {
            row.getCell(colIdx + 1).value = qExcel(col.getter(m, i));
        });
    });

    // 自动适应列宽（覆盖初始预设宽度，按实际内容估算）
    autoFitColumns(wsByFile);
    autoFitColumns(wsType);
    autoFitColumns(wsDetail, detailCols.map(c => c.header));

    // 统一格式：全部居中 + 细边框
    applyTableFormat(wsByFile);
    applyTableFormat(wsType);
    applyTableFormat(wsDetail);

    // 自定义表格（用户创建的）
    addLog('导出Excel: 自定义表格');
    addCustomTableSheets(wb, sorted);

    const buf = await wb.xlsx.writeBuffer();
    await downloadExcelBuffer(buf, `Instruments_${new Date().toISOString().slice(0, 10)}.xlsx`);
    addLog('Excel导出完成，共导出 ' + markers.length + ' 个标记');
}

// ===== 自定义表格导出 =====

/**
 * 导出用户创建的自定义表格工作表
 * 每个自定义表格包含 S/N、Tag No. 和用户定义的自定义字段
 * @param {ExcelJS.Workbook} wb - 工作簿对象
 * @param {Array} sorted - 已排序的标记数组
 */
function addCustomTableSheets(wb, sorted) {
    const tables = getCustomTables();
    if (!tables || tables.length === 0) return;

    for (const table of tables) {
        const ws = wb.addWorksheet(table.name, {
            views: [{ state: 'frozen', ySplit: 1 }],
        });

        // 列定义：S/N + Tag No. + 自定义字段
        const colDefs = [
            { header: 'S/N', width: 6 },
            { header: 'Tag No.', width: 18 },
            ...table.columns.map(c => ({ header: c.label, width: 16, bindField: c.bindField })),
        ];

        // 设置列
        colDefs.forEach((col, idx) => {
            ws.getColumn(idx + 1).key = col.header;
            ws.getColumn(idx + 1).width = col.width || 10;
        });

        // 表头
        const hdrRow = ws.getRow(1);
        colDefs.forEach((col, idx) => {
            hdrRow.getCell(idx + 1).value = col.header;
        });
        styleHeaderRow(hdrRow);

        // 数据行
        sorted.forEach((m, i) => {
            const row = ws.addRow();
            row.getCell(1).value = i + 1;
            row.getCell(2).value = qExcel(formatMarkerLabel(m));
            table.columns.forEach((col, colIdx) => {
                const cellIdx = colIdx + 3;
                if (col.bindField) {
                    let v;
                    if (col.bindField.startsWith('ca_')) {
                        v = getCustomAttrValue(m, col.bindField);
                    } else {
                        v = m[col.bindField];
                    }
                    row.getCell(cellIdx).value = qExcel(v === undefined || v === null ? '' : String(v));
                } else {
                    row.getCell(cellIdx).value = '';
                }
            });
        });

        autoFitColumns(ws, colDefs.map(c => c.header));
        applyTableFormat(ws);
    }
}