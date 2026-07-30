function styleHeaderRow(row) {
    row.font = { bold: true, color: { argb: 'FF333333' } };
    row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F3F4' },
    };
    row.alignment = { vertical: 'middle' };
}

// 估算文本显示宽度（ExcelJS 列宽单位近似等于默认字体下字符宽度）
// 中文/全角字符按 2 计算，英文/数字按 1 计算
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

// 自动调整工作表所有列宽：基于表头和单元格内容估算
function autoFitColumns(ws) {
    ws.columns.forEach(col => {
        let maxLen = 0;
        if (col.header) maxLen = measureTextWidth(String(col.header));
        col.eachCell({ includeEmpty: false }, cell => {
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
        col.width = Math.min(Math.max(maxLen + 2, 6), 60);
    });
}

// 统一应用表格格式：所有单元格居中 + 细边框
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
        }
    });
}

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

async function exportExcel() {
    if (markers.length === 0) {
        alert('还没有标记，请先在图纸上点击标注');
        return;
    }
    await runExportTask(
        [exportExcelBtn, exportExcelBottomBtn],
        exportExcelCore,
        '正在生成统计表格…',
        'Excel 导出完成',
        '导出 Excel 失败，请检查网络后重试（需加载 ExcelJS）'
    );
}

async function exportBoth() {
    if (markers.length === 0) {
        alert('还没有标记，请先在图纸上点击标注');
        return;
    }
    if (documents.length === 0) {
        alert('还没有导入PDF文件');
        return;
    }
    showToast('正在同步导出…', true);
    try {
        await exportExcelCore();
        await exportMarkedPDFCore();
        hideToast();
        showToast('✅ Excel 和 PDF 导出完成');
    } catch (e) {
        hideToast();
        alert('导出失败：' + (e.message || '未知错误'));
    }
}

async function exportExcelCore() {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = '电气PDF标注';
    wb.created = new Date();

    const wsByFile = wb.addWorksheet('按文件汇总', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    wsByFile.columns = [
        { header: '文件名', key: 'file', width: 36 },
        { header: '类型', key: 'type', width: 10 },
        { header: '说明', key: 'desc', width: 16 },
        { header: '数量', key: 'count', width: 8 },
    ];
    styleHeaderRow(wsByFile.getRow(1));

    const isSingleMultiPageDoc =
        documents.length === 1 &&
        documents[0] &&
        documents[0].pageCount > 1;

    if (isSingleMultiPageDoc) {
        wsByFile.columns = [
            { header: '页码', key: 'page', width: 10 },
            { header: '类型', key: 'type', width: 12 },
            { header: '说明', key: 'desc', width: 16 },
            { header: '数量', key: 'count', width: 8 },
        ];
        styleHeaderRow(wsByFile.getRow(1));

        const doc = documents[0];
        const titleRow = wsByFile.addRow({
            page: `📄 ${doc.fileName}`,
            type: '',
            desc: '',
            count: `共 ${markers.length} 个标记`,
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
                page: `第 ${pageIndex} 页`,
                type: '',
                desc: '',
                count: `${pageMarkers.length} 个`,
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
                type: '小计',
                desc: '',
                count: list.length,
            });
            totalRow.font = { bold: true };
            totalRow.getCell(2).font = { bold: true, color: { argb: 'FF555555' } };

            wsByFile.addRow({});
        }
    }

    const grand = wsByFile.addRow({
        file: '全部合计',
        type: '',
        desc: '',
        count: markers.length,
    });
    grand.font = { bold: true };

    const wsType = wb.addWorksheet('类型总汇', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    wsType.columns = [
        { header: '类型', key: 'type', width: 10 },
        { header: '说明', key: 'desc', width: 16 },
        { header: '数量', key: 'count', width: 8 },
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
    const typeTotal = wsType.addRow({ type: '合计', desc: '', count: markers.length });
    typeTotal.font = { bold: true };

    const wsDetail = wb.addWorksheet('明细清单', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    wsDetail.columns = [
        { header: 'S/N', key: 'idx', width: 6 },
        { header: 'Tag No.', key: 'label', width: 18 },
        { header: 'Location', key: 'location', width: 20 },
        { header: 'Instrument Type', key: 'type', width: 24 },
        { header: 'Process Connection', key: 'connection', width: 20 },
        { header: 'Size / Calibration Range', key: 'size', width: 24 },
        { header: 'Service', key: 'service', width: 16 },
        { header: 'Product', key: 'product', width: 16 },
        { header: 'Data Sheet No.', key: 'dataSheet', width: 20 },
        { header: 'P & ID Dwg No.', key: 'pid', width: 20 },
        { header: 'Remarks', key: 'note', width: 20 },
    ];
    styleHeaderRow(wsDetail.getRow(1));

    const sorted = [...markers].sort((a, b) => {
        const fa = getDocFileName(a.docId);
        const fb = getDocFileName(b.docId);
        if (fa !== fb) return fa.localeCompare(fb, 'zh');
        if (a.typeName !== b.typeName) return (a.typeName || '').localeCompare(b.typeName || '', 'zh');
        return a.number - b.number;
    });

    sorted.forEach((m, i) => {
        const t = getTypeById(m.typeId);
        // Process Connection 拼接规则（统一走资源库 INSTRUMENT_RESOURCES）：
        // - sizeNote 已含 ANSI/NPT/FLANGED/THREADED/SW 等关键字 → 原样输出
        // - 其他 → 按仪表代号从 SIZE_CONNECTIONS 查找后缀，找不到用默认 ANSI 150# RF
        let connection = '';
        if (m.sizeNote) {
            const s = String(m.sizeNote);
            const res = window.INSTRUMENT_RESOURCES;
            if (res && res.hasConnectionKeyword(s)) {
                connection = s;
            } else if (res) {
                const abbr = m.typeAbbr || t.abbr || '';
                connection = s + ' ' + res.getConnectionSuffix(abbr);
            } else {
                connection = s;
            }
        }
        const r = wsDetail.addRow({
            idx: i + 1,
            label: formatMarkerLabel(m),
            location: '',
            type: m.typeFullName || t.fullName || m.typeName || t.name || '',
            connection: connection,
            size: '',
            service: '',
            product: '',
            dataSheet: '',
            pid: '',
            note: m.note || '',
        });
    });

    // 自动适应列宽（覆盖初始预设宽度，按实际内容估算）
    autoFitColumns(wsByFile);
    autoFitColumns(wsType);
    autoFitColumns(wsDetail);

    // 统一格式：全部居中 + 细边框
    applyTableFormat(wsByFile);
    applyTableFormat(wsType);
    applyTableFormat(wsDetail);

    const buf = await wb.xlsx.writeBuffer();
    await downloadExcelBuffer(buf, `仪表统计_${new Date().toISOString().slice(0, 10)}.xlsx`);
}