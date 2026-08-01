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
// extraHeaders: 可选，按列号（1-based）传入列头文本数组；用于表头未写入 col.header 的工作表（如 IO List）
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

// 按当前列宽估算数据行所需行高（wrapText 生效后的最长行数 × 15）
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

// 统一应用表格格式：所有单元格 Arial 字体 + 居中 + 细边框
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

// IO List 统一字体：Arial 10 号
const IO_LIST_FONT = { name: 'Arial', size: 10 };
const IO_LIST_FONT_BOLD = { name: 'Arial', size: 10, bold: true };

// ===== IO List 工作表（第 4 个表）=====

// IO List 模板列头定义（共 24 列）
// col: 列号 (1-based)
// row1: 第一行文字（主标题）
// row2: 第二行文字（子标题），若为空则与 row1 合并
// row1Span: 第一行合并的列数（默认 1），用于分组标题（如 Alarm Setting 跨 4 列）
const IO_LIST_COLUMNS = [
    { col: 1,  row1: 'S/N',                      row2: 'S/N' },
    { col: 2,  row1: 'Revision No.',             row2: 'Revision No.' },
    { col: 3,  row1: 'DCS Tag Number',           row2: 'DCS Tag Number' },
    { col: 4,  row1: 'Instrument Tag No.',       row2: 'Instrument Tag No.' },
    { col: 5,  row1: 'Signal Description',       row2: 'Signal Description' },
    { col: 6,  row1: 'Equipment',                row2: 'Equipment' },
    { col: 7,  row1: 'P & ID Dwg No.',           row2: 'P & ID Dwg No.' },
    { col: 8,  row1: 'P&ID Revision No.',        row2: 'P&ID Revision No.' },
    { col: 9,  row1: 'IO Type',                  row2: 'IO Type' },
    { col: 10, row1: 'Signal Type',              row2: 'Signal Type' },
    { col: 11, row1: 'Power',                   row2: 'Power' },
    { col: 12, row1: 'Zero Stauts',              row2: 'Zero Stauts' },
    { col: 13, row1: 'One Stauts',               row2: 'One Stauts' },
    { col: 14, row1: 'Alarm Setting',            row2: 'LL',  row1Span: 4 },
    { col: 15, row1: '',                         row2: 'L' },
    { col: 16, row1: '',                         row2: 'H' },
    { col: 17, row1: '',                         row2: 'HH' },
    { col: 18, row1: 'Range',                    row2: '0%',  row1Span: 2 },
    { col: 19, row1: '',                         row2: '100%' },
    { col: 20, row1: 'Unit',                     row2: 'Unit' },
    { col: 21, row1: 'RIO Panel No.',            row2: 'RIO Panel No.' },
    { col: 22, row1: 'Slot Number',              row2: 'Slot Number' },
    { col: 23, row1: 'Channel Number',           row2: 'Channel Number' },
    { col: 24, row1: 'Remarks',                  row2: 'Remarks' },
];

const IO_LIST_TOTAL_COLS = IO_LIST_COLUMNS.length;
const IO_LIST_DATA_START_COL = 1;
const IO_LIST_SN_COL = 1;
const IO_LIST_TAG_COL = 4;
const IO_LIST_DESC_COL = 5;
const IO_LIST_REMARKS_COL = 24;

// 写入 IO List 表头：支持分组合并（Alarm Setting 跨 4 列，Range 跨 2 列）
function writeIOListHeader(ws) {
    // 设置列 key
    IO_LIST_COLUMNS.forEach((col) => {
        ws.getColumn(col.col).key = 'c' + col.col;
    });

    const row1 = ws.getRow(1);
    const row2 = ws.getRow(2);

    // 写入 Row 1 和 Row 2 内容
    IO_LIST_COLUMNS.forEach((col) => {
        // Row 1
        if (col.row1) {
            const c1 = row1.getCell(col.col);
            c1.value = col.row1;
            c1.font = IO_LIST_FONT_BOLD;
            c1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
        // Row 2
        if (col.row2) {
            const c2 = row2.getCell(col.col);
            c2.value = col.row2;
            c2.font = IO_LIST_FONT_BOLD;
            c2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
    });

    // 填充背景色（表头统一浅灰色）
    const fillColor = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F4' } };
    for (let c = 1; c <= IO_LIST_TOTAL_COLS; c++) {
        const cell1 = row1.getCell(c);
        const cell2 = row2.getCell(c);
        if (!cell1.fill || !cell1.fill.type) cell1.fill = fillColor;
        if (!cell2.fill || !cell2.fill.type) cell2.fill = fillColor;
    }

    // 行高：每个单元格 20，表头共两行
    row1.height = 20;
    row2.height = 20;

    // 合并逻辑
    // 1. 对于分组合并列（row1Span > 1），Row 1 横向合并，Row 1 和 Row 2 之间不纵向合并
    // 2. 对于普通列（row1Span = 1），Row 1 和 Row 2 纵向合并
    IO_LIST_COLUMNS.forEach((col) => {
        const span = col.row1Span || 1;
        if (span > 1) {
            // 横向合并 Row 1：col.col 到 col.col + span - 1
            try { ws.mergeCells(1, col.col, 1, col.col + span - 1); } catch (e) {}
        } else {
            // 纵向合并 Row 1 和 Row 2
            try { ws.mergeCells(1, col.col, 2, col.col); } catch (e) {}
        }
    });

    // 第 3 行：区段标题（合并 A3:X3，跨所有列）
    const sectionTitle = documents.length === 1
        ? `INSTRUMENT I/O FOR ${documents[0].fileName.replace(/\.pdf$/i, '').toUpperCase()}`
        : 'INSTRUMENT I/O FOR ALL DOCUMENTS';
    const titleCell = ws.getRow(3).getCell(1);
    titleCell.value = sectionTitle;
    titleCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333333' } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(3).height = 24;
    // 合并第 3 行所有列（A3:X3）
    try { ws.mergeCells(3, 1, 3, IO_LIST_TOTAL_COLS); } catch (e) {}
}

// 创建 IO List 工作表（统一入口，原模板加载逻辑已移除）
function addIOList(wb) {
    const ws = wb.addWorksheet('IO List', {
        views: [{ state: 'frozen', ySplit: 2 }],
    });

    // 统一写入表头（分组合并结构）
    writeIOListHeader(ws);

    // 填充标记数据
    populateIOListData(ws, 4, IO_LIST_REMARKS_COL);

    // 给表头行也加边框
    applyIOListHeaderBorders(ws, IO_LIST_TOTAL_COLS);

    // 自适应列宽（与明细表一致）；IO List 表头写入单元格、未走 col.header，这里显式传入
    // 跳过合并的横幅/分组标题，避免标题长文本污染整列宽度
    autoFitColumns(ws, IO_LIST_COLUMNS.map(c => c.row2 || c.row1));
    // S/N 列不受标题行影响，固定窄宽
    ws.getColumn(IO_LIST_SN_COL).width = 6;
    // LL/L/H/HH 列宽与 0%/100% 保持一致
    const alarmRangeWidth = ws.getColumn(18).width || 8;
    for (let c = 14; c <= 19; c++) {
        ws.getColumn(c).width = alarmRangeWidth;
    }
    // 列宽确定后按实际宽度重算数据行行高（数据从第 4 行开始；此前为未知列宽的保守估计）
    for (let r = 4; r <= ws.actualRowCount; r++) {
        ws.getRow(r).height = estimateRowHeight(ws, ws.getRow(r));
    }
    return ws;
}

// 给 IO List 表头行加边框（与数据行保持一致的细边框）
function applyIOListHeaderBorders(ws, colCount) {
    const border = {
        top: { style: 'thin', color: { argb: 'FF808080' } },
        left: { style: 'thin', color: { argb: 'FF808080' } },
        bottom: { style: 'thin', color: { argb: 'FF808080' } },
        right: { style: 'thin', color: { argb: 'FF808080' } },
    };
    // 获取实际有内容的最大行号（表头+标题行）
    const headerEndRow = ws.actualRowCount || 3;
    for (let r = 1; r <= headerEndRow; r++) {
        const row = ws.getRow(r);
        for (let c = 1; c <= colCount; c++) {
            const cell = row.getCell(c);
            cell.border = border;
            // 表头行统一居中 + 自动换行
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
        // 表头行高保持 20
        if (r <= 2) row.height = 20;
    }
}

// 根据仪表代号推断 IO 信号默认值
function getIOListSignalDefaults(typeCode) {
    const code = String(typeCode || '').toUpperCase();
    // 电磁阀 / 电动阀 / 开关阀
    if (/^(SV|SC|MOV|SDV|BDV|SOL|XV)\d*$/.test(code)) {
        return { ioType: 'DO', signalType: '24VDC', power: '24VDC' };
    }
    // 控制阀
    if (/^(PCV|FCV|LCV|TCV|ACV|CV|HV|HCV|GV|BV|NB|DBV|HBV|RV|CKV|BVV|WCV)\d*$/.test(code)) {
        return { ioType: 'AO', signalType: '4~20mA', power: 'Loop Powered' };
    }
    // 开关类
    if (/^(PS|TS|FS|LS|AS|ZS|XS|XY|ZSO|ZSC|ZSH|ZSL)\w*$/.test(code)) {
        return { ioType: 'DI', signalType: 'dry contact', power: '24VDC' };
    }
    // 模拟量仪表（PI, TI, FI, LI, AI, PT, TT, FT, LT, PIT, TIT 等）
    if (/^[PTFLAXQ]([A-Z]*[ITRC]|E|G)\d*$/.test(code)) {
        return { ioType: 'AI', signalType: '4~20mA', power: 'Loop Powered' };
    }
    return { ioType: '', signalType: '', power: '' };
}

// 填充 IO List 标记数据（仅包含勾选导出的类型）
function populateIOListData(ws, startRow, remarksCol) {
    // 过滤：只导出 IO List 勾选的类型
    const filtered = markers.filter(m => isTypeInIOList(m.typeId));
    const sorted = [...filtered].sort((a, b) => {
        const fa = getDocFileName(a.docId);
        const fb = getDocFileName(b.docId);
        if (fa !== fb) return fa.localeCompare(fb, 'zh');
        if (a.typeName !== b.typeName) return (a.typeName || '').localeCompare(b.typeName || '', 'zh');
        return a.number - b.number;
    });

    const border = {
        top: { style: 'thin', color: { argb: 'FF808080' } },
        left: { style: 'thin', color: { argb: 'FF808080' } },
        bottom: { style: 'thin', color: { argb: 'FF808080' } },
        right: { style: 'thin', color: { argb: 'FF808080' } },
    };

    let rowIdx = startRow;
    for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i];
        const t = getTypeById(m.typeId);
        const row = ws.getRow(rowIdx);

        row.getCell(IO_LIST_SN_COL).value = i + 1;                                    // S/N (1)
        row.getCell(3).value = qExcel(m.dcsTag || '');                                        // DCS Tag Number (3)
        row.getCell(IO_LIST_TAG_COL).value = qExcel(formatMarkerLabel(m));                     // Instrument Tag No. (4)
        row.getCell(IO_LIST_DESC_COL).value = qExcel(m.typeFullName || t.fullName || m.typeName || ''); // Signal Description (5)
        row.getCell(6).value = qExcel(m.location || '');                    // Equipment (6)
        row.getCell(7).value = qExcel(m.pid || '');                         // P & ID Dwg No. (7)
        row.getCell(8).value = qExcel(m.pidRev || '');                      // P&ID Revision No. (8)
        // IO Type / Signal Type / Power：优先用用户填写值，空则自动推断
        const defs = getIOListSignalDefaults(m.typeCode);
        row.getCell(9).value = qExcel(m.ioType || defs.ioType);             // IO Type (9)
        row.getCell(10).value = qExcel(m.signalType || defs.signalType);    // Signal Type (10)
        row.getCell(11).value = qExcel(m.power || defs.power);              // Power (11)
        row.getCell(12).value = qExcel(m.zeroStatus || '');                 // Zero Status (12)
        row.getCell(13).value = qExcel(m.oneStatus || '');                  // One Status (13)
        row.getCell(14).value = qExcel(m.alarmLL || '');                    // Alarm LL (14)
        row.getCell(15).value = qExcel(m.alarmL || '');                     // Alarm L (15)
        row.getCell(16).value = qExcel(m.alarmH || '');                     // Alarm H (16)
        row.getCell(17).value = qExcel(m.alarmHH || '');                    // Alarm HH (17)
        // Range 0% / 100%：优先用 range0/range100，空则从 range 拆分（兼容旧数据）
        if (m.range0 || m.range100) {
            row.getCell(18).value = qExcel(m.range0 || '');                 // Range 0% (18)
            row.getCell(19).value = qExcel(m.range100 || '');               // Range 100% (19)
        } else if (m.range) {
            const parts = String(m.range).split(/[~\-–—]/).map(s => s.trim());
            row.getCell(18).value = qExcel(parts[0] || '');
            row.getCell(19).value = qExcel(parts[1] || parts[0] || '');
        } else {
            row.getCell(18).value = '';
            row.getCell(19).value = '';
        }
        row.getCell(20).value = qExcel(m.unit || '');                       // Unit (20)
        row.getCell(21).value = qExcel(m.rioPanel || '');                   // RIO Panel No. (21)
        row.getCell(22).value = qExcel(m.slotNumber || '');                 // Slot Number (22)
        row.getCell(23).value = qExcel(m.channelNumber || '');              // Channel Number (23)
        row.getCell(remarksCol).value = qExcel(m.note || '');                    // Remarks (24)

        for (let c = 1; c <= remarksCol; c++) {
            const cell = row.getCell(c);
            cell.font = IO_LIST_FONT;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = border;
        }

        // 根据内容长度估算行高（列宽未定时按 10 保守估算，autoFit 后会在 addIOList 中重算）
        row.height = estimateRowHeight(ws, row);

        rowIdx++;
    }
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
    wb.creator = 'PDF Annotator';
    wb.created = new Date();

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

    const wsDetail = wb.addWorksheet('Detail List', {
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
        { header: 'List', key: 'list', width: 6 },
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
        // List 标识：IO = 勾选导出到 IO List，INS = 未勾选（仅 INS List）
        const listType = isTypeInIOList(m.typeId) ? 'IO' : 'INS';
        const r = wsDetail.addRow({
            idx: i + 1,
            label: qExcel(formatMarkerLabel(m)),
            location: qExcel(m.location || ''),
            type: qExcel(m.typeFullName || t.fullName || m.typeName || t.name || ''),
            connection: qExcel(buildProcessConnection(m)),
            size: qExcel(m.range || ''),
            service: qExcel(m.service || ''),
            product: qExcel(m.product || ''),
            dataSheet: qExcel(m.dataSheet || ''),
            pid: qExcel(m.pid || ''),
            note: qExcel(m.note || ''),
            list: listType,
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

    // Sheet 4: IO List
    addIOList(wb);

    // Sheet 5: INS List（结构与明细清单一致，仅未勾选导出到 IO List 的标记）
    const insMarkers = sorted.filter(m => !isTypeInIOList(m.typeId));
    if (insMarkers.length > 0) {
        const wsIns = wb.addWorksheet('INS List', {
            views: [{ state: 'frozen', ySplit: 1 }],
        });
        wsIns.columns = [
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
        styleHeaderRow(wsIns.getRow(1));

        insMarkers.forEach((m, i) => {
            const t = getTypeById(m.typeId);
            wsIns.addRow({
                idx: i + 1,
                label: qExcel(formatMarkerLabel(m)),
                location: qExcel(m.location || ''),
                type: qExcel(m.typeFullName || t.fullName || m.typeName || t.name || ''),
                connection: qExcel(buildProcessConnection(m)),
                size: qExcel(m.range || ''),
                service: qExcel(m.service || ''),
                product: qExcel(m.product || ''),
                dataSheet: qExcel(m.dataSheet || ''),
                pid: qExcel(m.pid || ''),
                note: qExcel(m.note || ''),
            });
        });

        autoFitColumns(wsIns);
        applyTableFormat(wsIns);
    }

    const buf = await wb.xlsx.writeBuffer();
    await downloadExcelBuffer(buf, `Instruments_${new Date().toISOString().slice(0, 10)}.xlsx`);
}