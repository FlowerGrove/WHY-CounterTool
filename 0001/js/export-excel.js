function styleHeaderRow(row) {
    row.font = { bold: true, color: { argb: 'FF333333' } };
    row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F3F4' },
    };
    row.alignment = { vertical: 'middle' };
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
        const r = wsDetail.addRow({
            idx: i + 1,
            label: formatMarkerLabel(m),
            location: '',
            type: m.typeFullName || t.fullName || m.typeName || t.name || '',
            connection: '',
            size: '',
            service: '',
            product: '',
            dataSheet: '',
            pid: '',
            note: m.note || '',
        });
    });

    const buf = await wb.xlsx.writeBuffer();
    await downloadExcelBuffer(buf, `仪表统计_${new Date().toISOString().slice(0, 10)}.xlsx`);
}