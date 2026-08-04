/**
 * render.js - Canvas 渲染模块
 * 负责在画布上绘制 PDF 页面、标记圆圈、统计面板等所有可视化内容。
 * 通过 requestAnimationFrame 实现按需渲染，避免不必要的重绘开销。
 */

let renderReq = null;

/**
 * 定位闪烁状态
 * @type {{ marker: object, t0: number } | null}
 * @description 标记定位后在其周围绘制渐隐圆环动画，持续约 1.2 秒
 */
let locateFlash = null;

/**
 * 定位闪烁动画：点击详情列表后，在对应标记周围绘制渐隐圆环
 * @param {object} marker - 要定位的标记对象
 */
function flashLocate(marker) {
    addLog('定位标记 #' + getMarkerTagNumber(marker));
    locateFlash = { marker, t0: performance.now() };
    requestRender();
    requestAnimationFrame(function tick(now) {
        if (!locateFlash || locateFlash.marker !== marker) return;
        if (now - locateFlash.t0 < 1200) {
            requestRender();
            requestAnimationFrame(tick);
        } else {
            locateFlash = null;
            requestRender();
        }
    });
}

/**
 * 请求渲染：使用 requestAnimationFrame 合并多次渲染请求，避免重复绘制
 */
function requestRender() {
    if (renderReq) return;
    renderReq = requestAnimationFrame(() => {
        renderReq = null;
        render();
    });
}

/**
 * 主渲染函数：绘制背景、所有页面图片、标记、定位闪烁等
 */
function render() {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
    ctx.scale(zoom, zoom);

    for (const page of pages) {
        if (page.img) {
            ctx.drawImage(page.img, page.vx, page.vy, page.width, page.height);
        }

        if (settings.showPageCaption) {
            drawPageCaption(page, page.vx, page.vy, page.width, page.height);
        }
    }

    const idxMap = getDetailListIndexMap();
    // DEBUG: 检查是否有标记缺失序号
    const missingBadges = [];
    for (let i = 0; i < markers.length; i++) {
        const idx = idxMap.get(markers[i]);
        if (idx == null) {
            missingBadges.push(markers[i].typeName + '#' + markers[i].number);
        }
        drawMarker(ctx, markers[i], idx);
    }
    if (missingBadges.length > 0) {
        console.warn('[DEBUG render] 缺失序号的标记: ' + missingBadges.join(', '));
    }

    // 定位闪烁圆环（标记周围渐隐，虚拟坐标下绘制）
    if (locateFlash && markers.includes(locateFlash.marker)) {
        const m = locateFlash.marker;
        const t = (performance.now() - locateFlash.t0) / 1200;
        if (t < 1) {
            ctx.beginPath();
            ctx.arc(m.vx, m.vy, markerRadius + 4 + 12 * t, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 152, 0, ${(1 - t) * 0.95})`;
            ctx.lineWidth = 3 / Math.max(zoom, 0.01);
            ctx.stroke();
        }
    }

    // 选中标记高亮（左键点击选中，用于 Ctrl+1 打开 Inspector）
    if (typeof selectedMarker !== 'undefined' && selectedMarker && markers.includes(selectedMarker)) {
        ctx.beginPath();
        ctx.arc(selectedMarker.vx, selectedMarker.vy, markerRadius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(26, 115, 232, 0.7)';
        ctx.lineWidth = 2.5 / Math.max(zoom, 0.01);
        ctx.setLineDash([6 / zoom, 3 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.restore();
}

/**
 * 绘制页面说明文字：在页面下方显示文件名和尺寸信息
 * @param {object} page - 页面数据对象
 * @param {number} dx - 页面左上角虚拟 X 坐标
 * @param {number} dy - 页面左上角虚拟 Y 坐标
 * @param {number} dw - 页面宽度（虚拟像素）
 * @param {number} dh - 页面高度（虚拟像素）
 */
function drawPageCaption(page, dx, dy, dw, dh) {
    const mmW = (page.origWidth * 25.4 / 72).toFixed(1);
    const mmH = (page.origHeight * 25.4 / 72).toFixed(1);
    const parts = [];
    if (settings.captionShowName) parts.push(getDocFileName(page.docId));
    if (settings.captionShowSize) parts.push(`${mmW} × ${mmH} mm`);
    if (parts.length === 0) return;

    const text = parts.join('  ·  ');
    const fontSize = Math.max(11, Math.min(16, dw * 0.035));
    const padX = 10;
    const padY = 5;
    const cy = dy + dh + fontSize + padY + 2;

    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const textW = ctx.measureText(text).width;
    const boxW = Math.min(dw, textW + padX * 2);
    const boxH = fontSize + padY * 2;
    const boxX = dx;
    const boxY = cy - boxH / 2;

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5 / Math.max(zoom, 0.01);
    const r = 3;
    ctx.beginPath();
    ctx.moveTo(boxX + r, boxY);
    ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, r);
    ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, r);
    ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r);
    ctx.arcTo(boxX, boxY, boxX + boxW, boxY, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#555555';
    ctx.save();
    ctx.beginPath();
    ctx.rect(boxX + padX * 0.5, boxY, boxW - padX, boxH);
    ctx.clip();
    ctx.fillText(text, boxX + padX, cy);
    ctx.restore();
}

/**
 * 绘制标记圆圈：彩色圆环 + 类型缩写 + 仪表编号 + 尺寸备注 + 通用备注
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
 * @param {object} m - 标记对象
 * @param {number|null} globalIndex - 全局计数编号（详情列表中的序号），为 null 时不显示右上角绿标
 */
function drawMarker(ctx, m, globalIndex) {
    const rgb = hexToRgb(m.color);
    const circleText = m.typeAbbr || getTypeById(m.typeId).abbr;
    const tn = getMarkerTagNumber(m);

    ctx.save();
    ctx.translate(m.vx, m.vy);

    ctx.beginPath();
    ctx.arc(0, 0, markerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = markerLineWidth;
    ctx.strokeStyle = `rgb(${rgb.r * 255},${rgb.g * 255},${rgb.b * 255})`;
    ctx.stroke();

    // 右上角全局计数标记（绿色小圆）
    if (globalIndex != null) {
        const badgeR = Math.max(5, markerRadius * 0.32);
        const angle = -Math.PI / 4; // 45° 右上
        const bx = Math.cos(angle) * (markerRadius + badgeR * 0.1);
        const by = Math.sin(angle) * (markerRadius + badgeR * 0.1);
        ctx.beginPath();
        ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = '#2e7d32';
        ctx.fill();
        // 数字
        const numStr = String(globalIndex);
        const numSize = Math.max(6, badgeR * 1.3);
        ctx.font = `bold ${numSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(numStr, bx, by + 0.5);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgb(${rgb.r * 255},${rgb.g * 255},${rgb.b * 255})`;

    // 圆圈内：字母 + 仪表编号（编号在字母下方，跟随 markerFontSize 缩放）
    if (tn) {
        const abbrSize = markerFontSize * 0.62;
        const tagSize = markerFontSize * 0.48;
        ctx.font = `bold ${abbrSize}px sans-serif`;
        ctx.fillText(circleText, 0, -markerRadius * 0.28);
        ctx.font = `bold ${tagSize}px sans-serif`;
        ctx.fillText(tn, 0, markerRadius * 0.38);
    } else {
        const fontSize = circleText.length > 5 ? markerFontSize * 0.68 : (circleText.length > 4 ? markerFontSize * 0.78 : markerFontSize);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillText(circleText, 0, 1);
    }

    // 圆圈下方：尺寸编号（固定视觉字号，不随 markerFontSize 缩放，仅按 zoom 反向缩放保持视觉一致）
    const sizeNote = m.sizeNote ? formatSizeNote(m.sizeNote) : '';
    if (sizeNote) {
        const noteFontSize = Math.max(8, 11 / zoom);
        ctx.font = `${noteFontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const noteY = markerRadius + noteFontSize * 0.4;
        const noteMetrics = ctx.measureText(sizeNote);
        const pad = 2 / zoom;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(-noteMetrics.width / 2 - pad, noteY - pad, noteMetrics.width + pad * 2, noteFontSize + pad * 2);
        ctx.fillStyle = '#555';
        ctx.fillText(sizeNote, 0, noteY);
    }

    // 圆圈左上角：通用备注（固定视觉字号，不随 markerFontSize 缩放）
    const note = m.note ? String(m.note) : '';
    if (note) {
        const noteFontSize = Math.max(8, 11 / zoom);
        ctx.font = `${noteFontSize}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        const noteMetrics = ctx.measureText(note);
        const pad = 2 / zoom;
        // 左上角：文字右下角对齐到圆圈左上角附近
        const cornerX = -markerRadius * 0.72;
        const cornerY = -markerRadius * 0.72;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(cornerX - noteMetrics.width - pad, cornerY - noteFontSize - pad, noteMetrics.width + pad * 2, noteFontSize + pad * 2);
        ctx.fillStyle = '#333';
        ctx.fillText(note, cornerX, cornerY);
    }

    ctx.restore();
}

/**
 * 绘制圆角矩形（填充）
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
 * @param {number} x - 矩形左上角 X 坐标
 * @param {number} y - 矩形左上角 Y 坐标
 * @param {number} width - 矩形宽度
 * @param {number} height - 矩形高度
 * @param {number} radius - 圆角半径
 */
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * 绘制圆角矩形（描边）
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
 * @param {number} x - 矩形左上角 X 坐标
 * @param {number} y - 矩形左上角 Y 坐标
 * @param {number} width - 矩形宽度
 * @param {number} height - 矩形高度
 * @param {number} radius - 圆角半径
 */
function strokeRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.stroke();
}

/**
 * 更新界面：刷新页面计数显示、拖放提示、统计面板
 */
function updateUI() {
    const hasPages = pages.length > 0;
    if (hasPages) {
        const docCount = documents.length;
        pageCountEl.textContent = docCount > 1
            ? `${docCount} 个文件 · ${pages.length} 页`
            : `${pages.length} 页`;
    } else {
        pageCountEl.textContent = '';
    }
    pageCountEl.classList.toggle('visible', hasPages);
    dropHint.classList.toggle('hidden', hasPages);

    // 导入文件后才显示左侧仪表栏和底部工具栏
    document.getElementById('typeDock').classList.toggle('visible', hasPages);
    document.querySelector('.bottom-bar').classList.toggle('visible', hasPages);
}

