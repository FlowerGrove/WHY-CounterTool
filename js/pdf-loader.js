/**
 * pdf-loader.js - PDF 导入与处理模块
 * 负责 PDF 文件的导入、页面渲染为位图、会话恢复，
 * 以及自动适配视口缩放与平移。
 */

/**
 * 导入 PDF 文件：逐文件逐页渲染为位图，并建立页面数据结构
 * @param {FileList|File[]} files - 用户选择的 PDF 文件列表
 * @returns {Promise<void>}
 */
async function importPDF(files) {
    showToast('正在导入 PDF…', true);
    try {
        const pdfjs = await loadPdfJs();
        const newDocs = [];
        let baseVy = 0;

        for (const file of files) {
            const arrayBuffer = await file.arrayBuffer();
            // 传副本给 PDF.js，它会被 transfer/detach，保留原始的给导出用
            const pdf = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
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
                    vTransform: rv.transform,
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
        addLog('导入成功: ' + newDocs.length + '个文件, ' + pages.length + '页');
        showToast(`成功导入 ${newDocs.length} 个文件，共 ${pages.length} 页`);
    } catch (e) {
        console.error(e);
        hideToast();
        addLog('导入失败');
        alert('PDF 导入失败：' + (e.message || '未知错误'));
    }
}

/**
 * 恢复上次会话的标记数据：根据保存的文档文件名和标记位置，在新导入的 PDF 上重建标记
 * 同时恢复自定义类型、已用编号等状态
 * @param {object} data - 会话数据对象，包含 docs 数组和可选的自定义类型
 */
function restoreMarkers(data) {
    if (!data || !Array.isArray(data.docs)) return;

    addLog('恢复会话: ' + data.docs.length + '个文档');

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

            const marker = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                docId: doc.id,
                pageIndex: md.pageIndex,
                vx: pageData.vx + (md.localX || 0),
                vy: pageData.vy + (md.localY || 0),
                number: typeof md.number === 'number' ? md.number : 0,
                color: md.color || typeMatch.color,
                typeId: typeMatch.id,
                typeCode: typeMatch.code,
                typeName: md.typeName || typeMatch.name,
                typeFullName: md.typeFullName || typeMatch.fullName,
                typeAbbr: md.typeAbbr || typeMatch.abbr,
                _globalOrder: md._globalOrder ?? ++_globalOrderCounter,
            };
            for (const f of MARKER_OPTIONAL_FIELDS) {
                const v = md[f];
                if (v !== undefined && v !== null && String(v).length > 0) {
                    marker[f] = v;
                }
            }
            // 恢复自定义属性（对象类型）
            if (md.customAttrs && typeof md.customAttrs === 'object' && Object.keys(md.customAttrs).length > 0) {
                marker.customAttrs = { ...md.customAttrs };
            }

            markers.push(marker);
        }
    }

    // 重建 usedNumbers，确保后续新增标记编号正确
    // 先收集所有已有的编号
    for (const m of markers) {
        if (typeof m.number === 'number' && m.number > 0) {
            getUsedSet().add(m.number);
        }
    }
    // 为 number: 0 的旧标记分配正确编号
    for (const m of markers) {
        if (typeof m.number === 'number' && m.number === 0) {
            m.number = findNextNumber();
            getUsedSet().add(m.number);
        }
    }
    nextMarkerNumber = findNextNumber();
    syncNumberInput();

    // 更新全局创建顺序计数器，确保后续新建标记的顺序正确
    let maxOrder = 0;
    for (const m of markers) {
        if (typeof m._globalOrder === 'number' && m._globalOrder > maxOrder) {
            maxOrder = m._globalOrder;
        }
    }
    _globalOrderCounter = maxOrder;
}

/**
 * 自动适配视口：根据所有页面的包围盒计算合适的缩放比例和平移量，
 * 使所有页面内容在画布中居中完整显示
 */
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