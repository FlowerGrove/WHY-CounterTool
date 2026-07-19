async function importPDF(files) {
    showToast('正在导入 PDF…', true);
    try {
        const pdfjs = await loadPdfJs();
        const newDocs = [];
        let baseVy = 0;

        for (const file of files) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            const docId = nextDocId++;

            const doc = {
                id: docId,
                fileName: file.name,
                pageCount: pdf.numPages,
                arrayBuffer,
                pages: [],
            };
            documents.push(doc);
            newDocs.push(doc);

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1 });
                const origWidth = viewport.width;
                const origHeight = viewport.height;
                const renderScale = computeRenderScale(origWidth, origHeight);
                const rv = page.getViewport({ scale: renderScale });

                const offCanvas = document.createElement('canvas');
                offCanvas.width = rv.width;
                offCanvas.height = rv.height;
                const offCtx = offCanvas.getContext('2d');

                await page.render({
                    canvasContext: offCtx,
                    viewport: rv,
                }).promise;

                const img = await createImageBitmap(offCanvas);

                const pageData = {
                    docId,
                    pageIndex: i,
                    vx: 0,
                    vy: baseVy,
                    width: rv.width,
                    height: rv.height,
                    origWidth,
                    origHeight,
                    img,
                };

                pages.push(pageData);
                doc.pages.push(pageData);

                baseVy += rv.height + PAGE_GAP + PAGE_CAPTION_H;
            }

            baseVy += DOC_GAP;
        }

        if (pendingRestore) {
            restoreMarkers(pendingRestore);
            pendingRestore = null;
            document.getElementById('sessionBanner').classList.remove('visible');
        }

        fitToContent();
        updateUI();
        requestRender();
        hideToast();
        showToast(`成功导入 ${newDocs.length} 个文件，共 ${pages.length} 页`);
    } catch (e) {
        console.error(e);
        hideToast();
        alert('PDF 导入失败：' + (e.message || '未知错误'));
    }
}

function restoreMarkers(data) {
    if (!data || !Array.isArray(data.docs)) return;

    if (Array.isArray(data.customTypes)) {
        for (const ct of data.customTypes) {
            if (!ct || !ct.name) continue;
            if (markerTypes.some(t => t.name === ct.name)) continue;
            const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            markerTypes.push({
                id,
                name: ct.name,
                fullName: ct.fullName || ct.name,
                color: ct.color || '#37474f',
                abbr: ct.abbr || '?',
                code: ct.code || '?',
            });
        }
        renderTypeChips();
    }

    for (const docData of data.docs) {
        if (!docData || !docData.fileName || !Array.isArray(docData.markers)) continue;

        const doc = documents.find(d => d.fileName === docData.fileName);
        if (!doc) continue;

        for (const md of docData.markers) {
            if (!md || typeof md.pageIndex !== 'number') continue;

            const pageData = pages.find(p => p.docId === doc.id && p.pageIndex === md.pageIndex);
            if (!pageData) continue;

            const typeMatch = markerTypes.find(t => t.code === md.typeCode) || markerTypes[0];

            const num = typeof md.number === 'number' ? md.number : findNextNumberForType(typeMatch.id);
            if (num > MAX_MARKER_NUMBER || isNumberUsed(num, typeMatch.id)) continue;

            const marker = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                docId: doc.id,
                pageIndex: md.pageIndex,
                vx: pageData.vx + (md.localX || 0),
                vy: pageData.vy + (md.localY || 0),
                number: num,
                color: md.color || typeMatch.color,
                typeId: typeMatch.id,
                typeCode: typeMatch.code,
                typeName: typeMatch.name,
                typeFullName: md.typeFullName || typeMatch.fullName,
                typeAbbr: typeMatch.abbr,
            };

            reserveNumber(num, typeMatch.id);
            markers.push(marker);
        }
    }

    nextMarkerNumber = findNextNumberForType(currentTypeId);
    syncNumberInput();
}

function fitToContent() {
    if (pages.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pages) {
        minX = Math.min(minX, p.vx);
        minY = Math.min(minY, p.vy);
        maxX = Math.max(maxX, p.vx + p.width);
        maxY = Math.max(maxY, p.vy + p.height + PAGE_CAPTION_H);
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 60;

    const scaleX = (canvas.width - padding * 2) / contentW;
    const scaleY = (canvas.height - padding * 2) / contentH;
    zoom = Math.min(scaleX, scaleY, 2);

    panX = -(minX + contentW / 2) * zoom;
    panY = -(minY + contentH / 2) * zoom;
}