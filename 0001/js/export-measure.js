// 测量数据导出（Excel + PDF），与仪表标记导出完全独立

// ===== Excel 导出 =====
async function exportMeasureExcel() {
    if (measurements.length === 0) {
        alert('还没有测量数据，请先完成至少一段测量');
        return;
    }
    await runExportTask(
        [exportMeasureExcelBtn, exportMeasurePdfBtn],
        exportMeasureExcelCore,
        '正在生成测量统计表格…',
        '测量 Excel 导出完成',
        '导出 Excel 失败，请检查网络后重试（需加载 ExcelJS）'
    );
}

async function exportMeasureExcelCore() {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = '电气PDF标注·测量';
    wb.created = new Date();

    // 工作表1：测量段汇总
    const ws = wb.addWorksheet('测量汇总', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = [
        { header: '编号', key: 'id', width: 8 },
        { header: '类型', key: 'type', width: 12 },
        { header: '点数', key: 'points', width: 8 },
        { header: '总长', key: 'length', width: 14 },
        { header: '面积', key: 'area', width: 14 },
        { header: '所属文件', key: 'file', width: 32 },
        { header: '页码', key: 'page', width: 8 },
    ];
    styleHeaderRow(ws.getRow(1));

    let totalLenPixels = 0;
    let totalAreaPixels = 0;
    let hasArea = false;

    measurements.forEach(m => {
        const lenFmt = formatLength(m.totalLenPixels);
        const pointCount = m.points.length;
        const typeText = pointCount === 2 ? '线段' : '多边形';
        const areaFmt = (m.areaPixels !== null && m.areaPixels > 0)
            ? formatArea(m.areaPixels)
            : null;
        const fileName = m.docId !== null ? getDocFileName(m.docId) : '—';
        const pageNo = m.pageIndex !== null ? m.pageIndex + 1 : '—';

        const r = ws.addRow({
            id: `M${m.id}`,
            type: typeText,
            points: pointCount,
            length: `${lenFmt.text} ${lenFmt.unit}`,
            area: areaFmt ? `${areaFmt.text} ${areaFmt.unit}` : '—',
            file: fileName,
            page: pageNo,
        });
        r.alignment = { vertical: 'middle' };

        totalLenPixels += m.totalLenPixels;
        if (m.areaPixels !== null && m.areaPixels > 0) {
            totalAreaPixels += m.areaPixels;
            hasArea = true;
        }
    });

    // 合计行
    const totalLenFmt = formatLength(totalLenPixels);
    const totalRow = ws.addRow({
        id: '合计',
        type: `${measurements.length} 段`,
        points: '',
        length: `${totalLenFmt.text} ${totalLenFmt.unit}`,
        area: hasArea ? `${formatArea(totalAreaPixels).text} ${formatArea(totalAreaPixels).unit}` : '—',
        file: '',
        page: '',
    });
    totalRow.font = { bold: true };
    totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F0FE' },
    };
    totalRow.getCell(1).font = { bold: true, color: { argb: 'FF1976D2' } };
    totalRow.getCell(4).font = { bold: true, color: { argb: 'FF1976D2' } };
    totalRow.getCell(5).font = { bold: true, color: { argb: 'FF2E7D32' } };

    // 工作表2：每段明细（每个点到下一点的距离）
    const wsDetail = wb.addWorksheet('分段明细', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    wsDetail.columns = [
        { header: '段编号', key: 'seg', width: 10 },
        { header: '起点', key: 'from', width: 8 },
        { header: '终点', key: 'to', width: 8 },
        { header: '距离', key: 'dist', width: 14 },
        { header: '所属文件', key: 'file', width: 32 },
        { header: '页码', key: 'page', width: 8 },
    ];
    styleHeaderRow(wsDetail.getRow(1));

    measurements.forEach(m => {
        const fileName = m.docId !== null ? getDocFileName(m.docId) : '—';
        const pageNo = m.pageIndex !== null ? m.pageIndex + 1 : '—';
        for (let i = 0; i < m.points.length - 1; i++) {
            const dist = calculateDistance(m.points[i], m.points[i + 1]);
            const f = formatLength(dist);
            wsDetail.addRow({
                seg: `M${m.id}`,
                from: i + 1,
                to: i + 2,
                dist: `${f.text} ${f.unit}`,
                file: fileName,
                page: pageNo,
            });
        }
    });

    // 工作表3：比例尺信息
    const wsInfo = wb.addWorksheet('比例尺信息');
    wsInfo.columns = [
        { header: '项目', key: 'key', width: 24 },
        { header: '值', key: 'val', width: 24 },
    ];
    styleHeaderRow(wsInfo.getRow(1));
    const modeText = measureMode === 'real' ? '实物尺寸 (m)' : '图纸尺寸 (mm)';
    const scaleText = measureMode === 'real' ? `1:${measureScale}` : '1:1';
    const rawScaleText = measureRawScale !== null ? `1:${measureRawScale}` : '—';
    wsInfo.addRow({ key: '测量模式', val: modeText });
    wsInfo.addRow({ key: '校准比例尺', val: scaleText });
    wsInfo.addRow({ key: '原始测量值', val: rawScaleText });
    wsInfo.addRow({ key: '测量段数', val: `${measurements.length} 段` });
    wsInfo.addRow({ key: '导出时间', val: new Date().toLocaleString('zh-CN') });

    const buf = await wb.xlsx.writeBuffer();
    await downloadExcelBuffer(buf, `测量统计_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ===== PDF 导出 =====
async function exportMeasurePdf() {
    if (measurements.length === 0) {
        alert('还没有测量数据，请先完成至少一段测量');
        return;
    }
    if (documents.length === 0) {
        alert('还没有导入PDF文件');
        return;
    }
    await runExportTask(
        [exportMeasureExcelBtn, exportMeasurePdfBtn],
        exportMeasurePdfCore,
        '正在生成测量PDF…',
        '测量 PDF 导出完成',
        '导出 PDF 失败，请检查网络后重试（需加载 PDF-Lib）'
    );
}

async function exportMeasurePdfCore() {
    await loadPdfLib();
    const PDFLib = window.PDFLib;
    const mergedDoc = await PDFLib.PDFDocument.create();
    const font = await mergedDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

    for (const doc of documents) {
        const srcDoc = await PDFLib.PDFDocument.load(doc.arrayBuffer);
        const pageCount = srcDoc.getPageCount();

        for (let i = 0; i < pageCount; i++) {
            const pageIndex = i + 1;
            const pageMeasurements = measurements.filter(m =>
                m.docId === doc.id && m.pageIndex === pageIndex
            );
            const copiedPages = await mergedDoc.copyPages(srcDoc, [i]);
            const copiedPage = copiedPages[0];
            mergedDoc.addPage(copiedPage);
            if (pageMeasurements.length === 0) continue;

            const pageData = doc.pages.find(p => p.pageIndex === pageIndex);
            if (!pageData) continue;

            const size = copiedPage.getSize();
            const renderScale = pageData.width / pageData.origWidth;
            const pageRotation = copiedPage.getRotation().angle;
            // PDF 坐标系下的线宽/字号
            const pdfLineWidth = Math.max(0.5, 2 / renderScale);
            const pdfPointRadius = Math.max(0.5, 4 / renderScale);
            const pdfLabelSize = Math.max(6, 9 / renderScale);
            const pdfSegLabelSize = Math.max(7, 11 / renderScale);

            // 逆变换矩阵（虚拟坐标 → PDF坐标）
            const t = pageData.vTransform;
            const a = t[0], b = t[1], c = t[2], d = t[3], e = t[4], f = t[5];
            const det = a * d - b * c;
            const toPdf = (lx, ly) => ({
                x: (d * (lx - e) - c * (ly - f)) / det,
                y: (-b * (lx - e) + a * (ly - f)) / det,
            });

            for (const m of pageMeasurements) {
                const pts = m.points.map(p => {
                    const localX = p.x - pageData.vx;
                    const localY = p.y - pageData.vy;
                    return toPdf(localX, localY);
                });

                // 绘制折线
                if (pts.length >= 2) {
                    const pathOpts = {
                        color: PDFLib.rgb(0.1, 0.46, 0.82),   // #1976D2
                        thickness: pdfLineWidth,
                    };
                    for (let j = 0; j < pts.length - 1; j++) {
                        copiedPage.drawLine({
                            start: pts[j],
                            end: pts[j + 1],
                            ...pathOpts,
                        });
                    }
                    // 闭合（多边形）
                    if (pts.length >= 3) {
                        copiedPage.drawLine({
                            start: pts[pts.length - 1],
                            end: pts[0],
                            ...pathOpts,
                        });
                    }
                }

                // 多边形内部斜线填充（表示面积）
                if (pts.length >= 3 && settings.measureShowHatch !== false) {
                    const hatchSpacing = Math.max(2, (settings.measureHatchSpacing || 8) / renderScale);
                    const hatchOpacity = settings.measureHatchOpacity != null ? settings.measureHatchOpacity : 0.35;
                    drawPdfHatch(copiedPage, PDFLib, pts, hatchSpacing, hatchOpacity, renderScale);
                }

                // 绘制每个点（白色圆 + 蓝色描边）
                pts.forEach(p => {
                    copiedPage.drawCircle({
                        x: p.x,
                        y: p.y,
                        size: pdfPointRadius,
                        color: PDFLib.rgb(1, 1, 1),
                        borderColor: PDFLib.rgb(0.1, 0.46, 0.82),
                        borderWidth: pdfLineWidth,
                    });
                });

                // 段编号标签（M1/M2/...）放在第一个点上方
                if (pts.length > 0) {
                    const segLabel = `M${m.id}`;
                    const segW = font.widthOfTextAtSize(segLabel, pdfSegLabelSize);
                    const offsetX = 0;
                    const offsetY = pdfPointRadius * 2 + pdfSegLabelSize * 0.7;
                    const labelX = pts[0].x + offsetX - segW / 2;
                    const labelY = pts[0].y + offsetY;

                    // 背景矩形
                    copiedPage.drawRectangle({
                        x: labelX - 2 / renderScale,
                        y: labelY - pdfSegLabelSize * 0.35,
                        width: segW + 4 / renderScale,
                        height: pdfSegLabelSize * 1.3,
                        color: PDFLib.rgb(0.1, 0.46, 0.82),
                        borderWidth: 0,
                    });
                    copiedPage.drawText(segLabel, {
                        x: labelX,
                        y: labelY,
                        size: pdfSegLabelSize,
                        color: PDFLib.rgb(1, 1, 1),
                        font: font,
                        rotate: PDFLib.degrees(pageRotation),
                    });
                }

                // 长度标注：每段中点显示距离
                for (let j = 0; j < pts.length - 1; j++) {
                    const p1 = pts[j], p2 = pts[j + 1];
                    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                    const dist = calculateDistance(m.points[j], m.points[j + 1]);
                    const fmt = formatLength(dist);
                    const text = `${fmt.text} ${fmt.unit}`;
                    const tw = font.widthOfTextAtSize(text, pdfLabelSize);
                    copiedPage.drawRectangle({
                        x: mid.x - tw / 2 - 2 / renderScale,
                        y: mid.y - pdfLabelSize * 0.35,
                        width: tw + 4 / renderScale,
                        height: pdfLabelSize * 1.3,
                        color: PDFLib.rgb(1, 1, 1),
                        opacity: 0.92,
                        borderWidth: 0,
                    });
                    copiedPage.drawText(text, {
                        x: mid.x - tw / 2,
                        y: mid.y,
                        size: pdfLabelSize,
                        color: PDFLib.rgb(0.1, 0.46, 0.82),
                        font: font,
                        rotate: PDFLib.degrees(pageRotation),
                    });
                }

                // 多边形：在质心显示总面积
                if (pts.length >= 3 && m.areaPixels !== null && m.areaPixels > 0) {
                    let cx = 0, cy = 0;
                    pts.forEach(p => { cx += p.x; cy += p.y; });
                    cx /= pts.length; cy /= pts.length;
                    const areaFmt = formatArea(m.areaPixels);
                    const totalText = `M${m.id}  ${areaFmt.text} ${areaFmt.unit}`;
                    const tw = font.widthOfTextAtSize(totalText, pdfLabelSize * 1.2);
                    copiedPage.drawRectangle({
                        x: cx - tw / 2 - 3 / renderScale,
                        y: cy - pdfLabelSize * 0.6,
                        width: tw + 6 / renderScale,
                        height: pdfLabelSize * 1.5,
                        color: PDFLib.rgb(0.1, 0.46, 0.82),
                        borderWidth: 0,
                    });
                    copiedPage.drawText(totalText, {
                        x: cx - tw / 2,
                        y: cy,
                        size: pdfLabelSize * 1.2,
                        color: PDFLib.rgb(1, 1, 1),
                        font: font,
                        rotate: PDFLib.degrees(pageRotation),
                    });
                }
            }
        }
    }

    const pdfBytes = await mergedDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `测量标注_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// PDF 多边形斜线填充：用 clip + 等间距斜线实现
// pdf-lib 没有 clip 高级 API，这里改用「逐条线段裁剪到多边形」的简化方案：
// 对每条 45° 斜线，扫描其与多边形所有边的交点，取在多边形内部的区段绘制
function drawPdfHatch(page, PDFLib, pts, spacing, opacity, renderScale) {
    if (!pts || pts.length < 3 || spacing <= 0) return;

    // 计算包围盒
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return;

    const hatchThickness = Math.max(0.3, 1 / renderScale);
    const color = PDFLib.rgb(0.1, 0.46, 0.82);
    const opacityRatio = Math.max(0, Math.min(1, opacity));

    // 多边形边数组
    const edges = [];
    for (let i = 0; i < pts.length; i++) {
        edges.push({ p1: pts[i], p2: pts[(i + 1) % pts.length] });
    }

    // 点是否在多边形内（射线法）
    const pointInPoly = (x, y) => {
        let inside = false;
        for (const e of edges) {
            const x1 = e.p1.x, y1 = e.p1.y;
            const x2 = e.p2.x, y2 = e.p2.y;
            if (((y1 > y) !== (y2 > y)) &&
                (x < (x2 - x1) * (y - y1) / ((y2 - y1) || 1e-9) + x1)) {
                inside = !inside;
            }
        }
        return inside;
    };

    // 线段与多边形边的交点
    const segSegIntersect = (p1, p2, p3, p4) => {
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-9) return null;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
        return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
    };

    // 45° 斜线扫描：从 (minX + d, minY) 到 (minX + d + h, minY + h)
    for (let d = -h; d <= w; d += spacing) {
        const start = { x: minX + d, y: minY };
        const end = { x: minX + d + h, y: minY + h };

        // 收集该斜线与多边形的所有交点 + 端点（如果在内部）
        const points = [];
        if (pointInPoly(start.x, start.y)) points.push(start);
        for (const e of edges) {
            const ip = segSegIntersect(start, end, e.p1, e.p2);
            if (ip) points.push(ip);
        }
        if (pointInPoly(end.x, end.y)) points.push(end);

        if (points.length < 2) continue;

        // 按斜线方向（x 升序）排序
        points.sort((a, b) => a.x - b.x);

        // 两两配对绘制（入边→出边）
        for (let i = 0; i + 1 < points.length; i += 2) {
            page.drawLine({
                start: points[i],
                end: points[i + 1],
                color: color,
                thickness: hatchThickness,
                opacity: opacityRatio,
            });
        }
    }
}
