/**
 * pdf-loader.js - PDF 导入与处理模块
 * 负责 PDF 文件的导入、页面渲染为位图、矢量端点提取、空间索引构建、会话恢复，
 * 以及自动适配视口缩放与平移。
 */

/**
 * 导入 PDF 文件：逐文件逐页渲染为位图，提取矢量端点，并建立页面数据结构
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
 * 同时恢复自定义类型、IO List 选择、已用编号等状态
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

    // 恢复 IO List 类型选择
    if (data.ioListSelected === null) {
        ioListSelectedIds = null;
    } else if (Array.isArray(data.ioListSelected)) {
        ioListSelectedIds = new Set(data.ioListSelected);
    }
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

// ===== PDF 矢量端点提取（用于 CAD 式端点捕捉）=====

/**
 * 3x3 仿射变换矩阵乘法（以长度为 6 的数组表示 [a,b,c,d,e,f]）
 * @param {number[]} m1 - 第一个矩阵
 * @param {number[]} m2 - 第二个矩阵
 * @returns {number[]} 相乘结果矩阵
 */
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

/**
 * 对点 (x, y) 应用仿射变换矩阵
 * @param {number[]} m - 仿射变换矩阵 [a,b,c,d,e,f]
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @returns {[number, number]} 变换后的 [x, y]
 */
function applyMat(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * 解析 PDF 页面操作符列表，提取所有路径端点并转换为虚拟坐标
 * 遍历 moveTo、lineTo、rectangle、curveTo 等操作符，收集所有路径顶点，
 * 通过 CTM 和视口变换矩阵映射到虚拟画布坐标，最后去重
 * @param {object} pdfjs - PDF.js 库实例
 * @param {object} page - PDF.js 页面对象
 * @param {number[]} vTransform - 视口变换矩阵 [a,b,c,d,e,f]
 * @param {number} pageVy - 页面在虚拟画布中的 Y 偏移
 * @returns {Promise<Array<{x: number, y: number}>>} 去重后的端点列表
 */
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
        addLog('端点解析失败');
        return [];
    }
}

/**
 * 构建空间网格索引：将端点按 cellSize 划分到网格单元中，加速邻近查询
 * @param {Array<{x: number, y: number}>} endpoints - 端点列表
 * @returns {{ cellSize: number, grid: Map<string, Array<{x: number, y: number}>> }}
 */
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