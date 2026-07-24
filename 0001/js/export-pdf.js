async function exportMarkedPDF() {
    if (markers.length === 0) {
        alert('还没有标记，请先在图纸上点击标注');
        return;
    }
    if (documents.length === 0) {
        alert('还没有导入PDF文件');
        return;
    }
    await runExportTask(
        [exportPdfFromStatsBtn, exportBtn],
        exportMarkedPDFCore,
        '正在生成标注PDF…',
        'PDF 导出完成',
        '导出 PDF 失败，请检查网络后重试（需加载 PDF-Lib）'
    );
}

async function exportMarkedPDFCore() {
    await loadPdfLib();
    const PDFLib = window.PDFLib;
    const mergedDoc = await PDFLib.PDFDocument.create();
    const font = await mergedDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

    const VISUAL_CENTER_OFFSET = 0.38;
    const radius = markerRadius;
    const fontSize = markerFontSize;

    for (const doc of documents) {
        const srcDoc = await PDFLib.PDFDocument.load(doc.arrayBuffer);
        const pageCount = srcDoc.getPageCount();

        for (let i = 0; i < pageCount; i++) {
            const pageIndex = i + 1;
            const pageMarkers = markers.filter(function(m) { return m.docId === doc.id && m.pageIndex === pageIndex; });
            const copiedPages = await mergedDoc.copyPages(srcDoc, [i]);
            const copiedPage = copiedPages[0];
            mergedDoc.addPage(copiedPage);
            if (pageMarkers.length === 0) continue;

            const pageData = doc.pages.find(function(p) { return p.pageIndex === pageIndex; });
            if (!pageData) continue;

            const size = copiedPage.getSize();
            const pdfWidth = size.width;
            const pdfHeight = size.height;
            const renderScale = pageData.width / pageData.origWidth;
            const pdfRadius = radius / renderScale;
            const pdfFontSize = fontSize / renderScale;
            // 获取页面旋转角度，用于抵消文字随页面旋转
            const pageRotation = copiedPage.getRotation().angle;

            for (let j = 0; j < pageMarkers.length; j++) {
                const m = pageMarkers[j];
                const localX = m.vx - pageData.vx;
                const localY = m.vy - pageData.vy;
                
                // 用 viewport 变换矩阵逆向转换坐标，正确处理页面旋转
                const t = pageData.vTransform;
                const a = t[0], b = t[1], c = t[2], d = t[3], e = t[4], f = t[5];
                const det = a * d - b * c;
                const pdfX = (d * (localX - e) - c * (localY - f)) / det;
                const pdfY = (-b * (localX - e) + a * (localY - f)) / det;

                const rgb = hexToRgb(m.color);
                const text = formatMarkerLabel(m);
                const drawSize = text.length > 5 ? pdfFontSize * 0.68 : (text.length > 4 ? pdfFontSize * 0.78 : pdfFontSize);
                const textWidth = font.widthOfTextAtSize(text, drawSize);

                copiedPage.drawCircle({
                    x: pdfX,
                    y: pdfY,
                    size: pdfRadius,
                    color: PDFLib.rgb(1, 1, 1),
                    borderColor: PDFLib.rgb(rgb.r, rgb.g, rgb.b),
                    borderWidth: Math.max(0.5, 2 / renderScale),
                });

                // 根据页面旋转角度计算文字左下角坐标，使文字几何中心落在圆心
                // pdf-lib 的 rotationPoint 不改变文字原点，需直接计算各角度下的 x, y
                let textX, textY;
                switch (pageRotation) {
                    case 90:
                        textX = pdfX + drawSize / 2;
                        textY = pdfY - textWidth / 2;
                        break;
                    case 180:
                        textX = pdfX + textWidth / 2;
                        textY = pdfY + drawSize / 2;
                        break;
                    case 270:
                        textX = pdfX - drawSize / 2;
                        textY = pdfY + textWidth / 2;
                        break;
                    default:
                        textX = pdfX - textWidth / 2;
                        textY = pdfY - VISUAL_CENTER_OFFSET * drawSize;
                }

                copiedPage.drawText(text, {
                    x: textX,
                    y: textY,
                    size: drawSize,
                    color: PDFLib.rgb(rgb.r, rgb.g, rgb.b),
                    font: font,
                    rotate: PDFLib.degrees(pageRotation),
                });
            }
        }
    }

    const pdfBytes = await mergedDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '电气标注_' + new Date().toISOString().slice(0, 10) + '.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}