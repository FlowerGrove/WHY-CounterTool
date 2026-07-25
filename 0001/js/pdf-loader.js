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

                // 解析矢量端点（用于测量时的端点捕捉）
                const endpoints = await extractEndpoints(pdfjs, page, rv.transform, baseVy);

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
                    endpoints,
                    snapGrid: buildSnapGrid(endpoints),
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

// ===== PDF 矢量端点提取（用于 CAD 式端点捕捉）=====

function matMul(m1, m2) {
    return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
}

function applyMat(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// 解析 operator list，提取所有路径端点，转换为虚拟坐标
async function extractEndpoints(pdfjs, page, vTransform, pageVy) {
    try {
        const OPS = pdfjs.OPS;
        const opList = await page.getOperatorList();
        const fnArray = opList.fnArray;
        const argsArray = opList.argsArray;

        let ctm = [1, 0, 0, 1, 0, 0];
        const stack = [];
        const rawPts = [];
        const t = vTransform; // [a,b,c,d,e,f] 映射 用户空间 -> 渲染像素

        const pushPt = (x, y) => {
            const u = applyMat(ctm, x, y);
            const px = t[0] * u[0] + t[2] * u[1] + t[4];
            const py = t[1] * u[0] + t[3] * u[1] + t[5];
            rawPts.push({ x: px, y: pageVy + py });
        };

        for (let k = 0; k < fnArray.length; k++) {
            const fn = fnArray[k];
            const args = argsArray[k];
            if (fn === OPS.transform) {
                ctm = matMul(ctm, args);
            } else if (fn === OPS.save) {
                stack.push(ctm.slice());
            } else if (fn === OPS.restore) {
                if (stack.length) ctm = stack.pop();
            } else if (fn === OPS.moveTo || fn === OPS.lineTo) {
                pushPt(args[0], args[1]);
            } else if (fn === OPS.rectangle) {
                pushPt(args[0], args[1]);
                pushPt(args[0] + args[2], args[1]);
                pushPt(args[0] + args[2], args[1] + args[3]);
                pushPt(args[0], args[1] + args[3]);
            } else if (fn === OPS.curveTo) {
                pushPt(args[4], args[5]);
            } else if (fn === OPS.curveTo2 || fn === OPS.curveTo3) {
                pushPt(args[2], args[3]);
            }
        }

        // 去重（相近点合并）
        const seen = new Set();
        const out = [];
        for (const p of rawPts) {
            const key = Math.round(p.x) + ',' + Math.round(p.y);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(p);
            if (out.length >= 60000) break;
        }
        return out;
    } catch (e) {
        console.warn('端点解析失败，捕捉功能将不可用', e);
        return [];
    }
}

// 构建空间网格索引，cellSize 为虚拟像素
function buildSnapGrid(endpoints) {
    const cellSize = 40;
    const grid = new Map();
    for (const p of endpoints) {
        const cx = Math.floor(p.x / cellSize);
        const cy = Math.floor(p.y / cellSize);
        const key = cx + ',' + cy;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(p);
    }
    return { cellSize, grid };
}