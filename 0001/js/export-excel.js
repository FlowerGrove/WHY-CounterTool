function applyColorFill(cell, hex) {
    const rgb = normalizeHexColor(hex);
    cell.value = '';
    cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF' + rgb },
    };
    cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

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
        { header: '颜色', key: 'color', width: 10 },
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
            { header: '颜色', key: 'color', width: 10 },
        ];
        styleHeaderRow(wsByFile.getRow(1));

        const doc = documents[0];
        const titleRow = wsByFile.addRow({
            page: `📄 ${doc.fileName}`,
            type: '',
            desc: '',
            count: `共 ${markers.length} 个标记`,
            color: '',
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
                color: '',
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
                        color: m.color,
                    });
                }
                typeCounts.get(m.typeId).count++;
                typeCounts.get(m.typeId).color = m.color;
                if (m.typeFullName) typeCounts.get(m.typeId).fullName = m.typeFullName;
            }

            for (const [id, tc] of typeCounts) {
                const r = wsByFile.addRow({
                    page: '',
                    type: tc.name,
                    desc: tc.fullName,
                    count: tc.count,
                    color: '',
                });
                applyColorFill(r.getCell(5), tc.color);
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
                        color: m.color,
                    });
                }
                const entry = counts.get(key);
                entry.count++;
                entry.color = m.color;
                if (m.typeFullName) entry.fullName = m.typeFullName;
            }

            const typeRows = [];
            for (const t of markerTypes) {
                const c = counts.get(t.id);
                if (c) typeRows.push({
                    name: t.name,
                    fullName: c.fullName || t.fullName || '',
                    count: c.count,
                    color: c.color || t.color,
                });
            }
            for (const [id, c] of counts) {
                if (!markerTypes.some(t => t.id === id)) {
                    typeRows.push({
                        name: c.name || id,
                        fullName: c.fullName || '',
                        count: c.count,
                        color: c.color,
                    });
                }
            }

            typeRows.forEach((row, idx) => {
                const r = wsByFile.addRow({
                    file: idx === 0 ? fileName : '',
                    type: row.name,
                    desc: row.fullName,
                    count: row.count,
                    color: '',
                });
                applyColorFill(r.getCell(5), row.color);
            });

            const totalRow = wsByFile.addRow({
                file: '',
                type: '小计',
                desc: '',
                count: list.length,
                color: '',
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
        color: '',
    });
    grand.font = { bold: true };

    const wsType = wb.addWorksheet('类型总汇', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    wsType.columns = [
        { header: '类型', key: 'type', width: 10 },
        { header: '说明', key: 'desc', width: 16 },
        { header: '数量', key: 'count', width: 8 },
        { header: '颜色', key: 'color', width: 10 },
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
                color: m.color,
            });
        }
        const entry = typeCounts.get(key);
        entry.count++;
        entry.color = m.color;
        if (m.typeFullName) entry.fullName = m.typeFullName;
    }
    for (const t of markerTypes) {
        const c = typeCounts.get(t.id);
        if (!c) continue;
        const r = wsType.addRow({
            type: t.name,
            desc: c.fullName || t.fullName || '',
            count: c.count,
            color: '',
        });
        applyColorFill(r.getCell(4), c.color || t.color);
    }
    for (const [id, c] of typeCounts) {
        if (markerTypes.some(t => t.id === id)) continue;
        const r = wsType.addRow({
            type: c.name || id,
            desc: c.fullName || '',
            count: c.count,
            color: '',
        });
        applyColorFill(r.getCell(4), c.color);
    }
    const typeTotal = wsType.addRow({ type: '合计', desc: '', count: markers.length, color: '' });
    typeTotal.font = { bold: true };

    const wsDetail = wb.addWorksheet('明细清单', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    wsDetail.columns = [
        { header: '序号', key: 'idx', width: 6 },
        { header: '文件名', key: 'file', width: 36 },
        { header: '类型', key: 'type', width: 10 },
        { header: '说明', key: 'desc', width: 16 },
        { header: '编号', key: 'num', width: 8 },
        { header: '标记标签', key: 'label', width: 12 },
        { header: '页码', key: 'page', width: 6 },
        { header: '颜色', key: 'color', width: 10 },
        { header: 'X(pt)', key: 'x', width: 10 },
        { header: 'Y(pt)', key: 'y', width: 10 },
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
        const pageData = pages.find(p => p.docId === m.docId && p.pageIndex === m.pageIndex);
        const localX = pageData ? +(m.vx - pageData.vx).toFixed(1) : '';
        const localY = pageData ? +(m.vy - pageData.vy).toFixed(1) : '';
        const r = wsDetail.addRow({
            idx: i + 1,
            file: getDocFileName(m.docId),
            type: m.typeName || t.name,
            desc: m.typeFullName || t.fullName || '',
            num: m.number,
            label: formatMarkerLabel(m),
            page: m.pageIndex + 1,
            color: '',
            x: localX,
            y: localY,
        });
        applyColorFill(r.getCell(8), m.color);
    });

    const buf = await wb.xlsx.writeBuffer();
    await downloadExcelBuffer(buf, `仪表统计_${new Date().toISOString().slice(0, 10)}.xlsx`);
}