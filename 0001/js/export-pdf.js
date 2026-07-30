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
                const circleText = m.typeAbbr || getTypeById(m.typeId).abbr;
                const tn = getMarkerTagNumber(m);

                // 圆圈内字母+编号字号（跟随 pdfFontSize 缩放）
                let abbrSize, tagSize = 0;
                if (tn) {
                    abbrSize = pdfFontSize * 0.62;
                    tagSize = pdfFontSize * 0.48;
                } else {
                    abbrSize = circleText.length > 5 ? pdfFontSize * 0.68 : (circleText.length > 4 ? pdfFontSize * 0.78 : pdfFontSize);
                }
                const abbrWidth = font.widthOfTextAtSize(circleText, abbrSize);
                const tagWidth = tn ? font.widthOfTextAtSize(tn, tagSize) : 0;

                copiedPage.drawCircle({
                    x: pdfX,
                    y: pdfY,
                    size: pdfRadius,
                    color: PDFLib.rgb(1, 1, 1),
                    borderColor: PDFLib.rgb(rgb.r, rgb.g, rgb.b),
                    borderWidth: Math.max(0.5, 2 / renderScale),
                });

                // 旋转向量辅助：PDF 坐标系 y 向上，逆时针为正
                const rotRad = pageRotation * Math.PI / 180;
                const rotCos = Math.cos(rotRad);
                const rotSin = Math.sin(rotRad);
                function rotVec(x, y) {
                    return { x: x * rotCos - y * rotSin, y: x * rotSin + y * rotCos };
                }
                // 由中心点反推 drawText 左下角坐标（视觉中心补偿 VISUAL_CENTER_OFFSET）
                function posAtCenter(cx, cy, w, sz) {
                    const off = rotVec(-w / 2, -VISUAL_CENTER_OFFSET * sz);
                    return { x: cx + off.x, y: cy + off.y };
                }

                // 圆圈内：字母中心偏移（局部 y+ 为上）；有编号时字母上移、编号在下
                const abbrLocalY = tn ? pdfRadius * 0.28 : 0;
                const abbrOff = rotVec(0, abbrLocalY);
                const abbrPos = posAtCenter(pdfX + abbrOff.x, pdfY + abbrOff.y, abbrWidth, abbrSize);
                copiedPage.drawText(circleText, {
                    x: abbrPos.x,
                    y: abbrPos.y,
                    size: abbrSize,
                    color: PDFLib.rgb(rgb.r, rgb.g, rgb.b),
                    font: font,
                    rotate: PDFLib.degrees(pageRotation),
                });

                // 圆圈内：编号（在字母下方，跟随缩放）
                if (tn) {
                    const tagOff = rotVec(0, -pdfRadius * 0.38);
                    const tagPos = posAtCenter(pdfX + tagOff.x, pdfY + tagOff.y, tagWidth, tagSize);
                    copiedPage.drawText(tn, {
                        x: tagPos.x,
                        y: tagPos.y,
                        size: tagSize,
                        color: PDFLib.rgb(rgb.r, rgb.g, rgb.b),
                        font: font,
                        rotate: PDFLib.degrees(pageRotation),
                    });
                }

                // 圆圈下方：尺寸编号（固定字号 9pt，不跟随 markerFontSize 缩放）
                const sizeNote = m.sizeNote ? String(m.sizeNote) : '';
                if (sizeNote) {
                    const fixedNoteSize = 9;
                    const noteTextWidth = font.widthOfTextAtSize(sizeNote, fixedNoteSize);
                    const noteOff = rotVec(0, -(pdfRadius + fixedNoteSize * 0.8));
                    const notePos = posAtCenter(pdfX + noteOff.x, pdfY + noteOff.y, noteTextWidth, fixedNoteSize);
                    copiedPage.drawText(sizeNote, {
                        x: notePos.x,
                        y: notePos.y,
                        size: fixedNoteSize,
                        color: PDFLib.rgb(0.33, 0.33, 0.33),
                        font: font,
                        rotate: PDFLib.degrees(pageRotation),
                    });
                }

                // 圆圈左上角：通用备注（固定字号 9pt，不跟随 markerFontSize 缩放）
                const note = m.note ? String(m.note) : '';
                if (note) {
                    const fixedNoteSize = 9;
                    const noteTextWidth = font.widthOfTextAtSize(note, fixedNoteSize);
                    // PDF 坐标系 y 向上：左上角对应局部 x 负、y 正
                    const noteOff = rotVec(-pdfRadius * 0.72, pdfRadius * 0.72);
                    // 左上角右对齐：文字右端贴近圆圈左上角
                    const notePos = posAtCenter(pdfX + noteOff.x - noteTextWidth / 2, pdfY + noteOff.y, noteTextWidth, fixedNoteSize);
                    copiedPage.drawText(note, {
                        x: notePos.x,
                        y: notePos.y,
                        size: fixedNoteSize,
                        color: PDFLib.rgb(0.2, 0.2, 0.2),
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
    a.download = '电气标注_' + new Date().toISOString().slice(0, 10) + '.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}