/**
 * render.js - Canvas 渲染模块
 * 负责在画布上绘制 PDF 页面、标记圆圈、测量折线、校准辅助线、统计面板等所有可视化内容。
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
 * 主渲染函数：绘制背景、所有页面图片、标记、定位闪烁、测量折线、校准辅助线等
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

    // 先绘制所有已完成的测量段（蓝色，带段编号）
    for (const m of measurements) {
        drawPolyline(ctx, m.points, true, `M${m.id}`);
    }

    // 再绘制当前进行中的段（红色/未完成态）
    if (polylineMode && currentPolylinePoints.length > 0) {
        drawPolyline(ctx, currentPolylinePoints, isPolylineComplete, null);
    }

    if (polylineMode && measurePhase === 'calibrate') {
        drawCalibrate(ctx);
    }

    if (polylineMode && snapHint) {
        drawSnapHint(ctx, snapHint.x, snapHint.y);
    }

    ctx.restore();
}

/**
 * 绘制校准阶段：已拾取的校准点 + 正交投影预览线
 * 用于测量模式下的标尺校准，显示两个校准点和它们之间的连线
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
 */
function drawCalibrate(ctx) {
    if (calibratePoints.length === 0 && !calibratePreview) return;

    ctx.save();
    // 以数字字号为基准统一计算，保证外圈/内圈/数字同步缩放
    const labelSize = Math.max(9, 11 / zoom);
    const lineWidth = 2.5 / Math.max(zoom, 0.01);
    const pointRadius = labelSize * 0.55;
    const outerRadius = labelSize * 0.95;

    // 已拾取的第一点
    if (calibratePoints.length >= 1) {
        const p1 = calibratePoints[0];
        // 预览线（第一点 → 投影点）
        if (calibratePreview) {
            ctx.strokeStyle = '#FF9800';
            ctx.lineWidth = lineWidth;
            ctx.setLineDash([10 / Math.max(zoom, 0.01), 5 / Math.max(zoom, 0.01)]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(calibratePreview.x, calibratePreview.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // 投影点（虚线圆环）
            ctx.beginPath();
            ctx.arc(calibratePreview.x, calibratePreview.y, outerRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 152, 0, 0.15)';
            ctx.fill();
            ctx.strokeStyle = '#FF9800';
            ctx.lineWidth = lineWidth;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(calibratePreview.x, calibratePreview.y, pointRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#FF9800';
            ctx.fill();
        }

        // 第一点（实心圆 + 编号）
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, outerRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 152, 0, 0.15)';
        ctx.fill();
        ctx.strokeStyle = '#FF9800';
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p1.x, p1.y, pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#FF9800';
        ctx.fill();

        ctx.font = `bold ${labelSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5 / Math.max(zoom, 0.01);
        ctx.strokeText('1', p1.x, p1.y + 0.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('1', p1.x, p1.y + 0.5);
    }

    // 校准已完成两点（实线连接）
    if (calibratePoints.length === 2) {
        const p1 = calibratePoints[0];
        const p2 = calibratePoints[1];
        ctx.strokeStyle = '#FF9800';
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // 第二点
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, outerRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 152, 0, 0.15)';
        ctx.fill();
        ctx.strokeStyle = '#FF9800';
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p2.x, p2.y, pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#FF9800';
        ctx.fill();

        ctx.font = `bold ${labelSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5 / Math.max(zoom, 0.01);
        ctx.strokeText('2', p2.x, p2.y + 0.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('2', p2.x, p2.y + 0.5);
    }

    ctx.restore();
}

/**
 * 绘制端点捕捉指示器：绿色方框 + 十字准星
 * 当鼠标靠近矢量端点时显示，帮助精确对齐测量点
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
 * @param {number} x - 捕捉点的虚拟 X 坐标
 * @param {number} y - 捕捉点的虚拟 Y 坐标
 */
function drawSnapHint(ctx, x, y) {
    const s = 10 / zoom;
    ctx.save();
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeStyle = '#00C853';
    ctx.fillStyle = 'rgba(0, 200, 83, 0.15)';
    ctx.beginPath();
    ctx.rect(x - s, y - s, s * 2, s * 2);
    ctx.fill();
    ctx.stroke();
    // 十字
    ctx.beginPath();
    ctx.moveTo(x - s * 1.6, y); ctx.lineTo(x + s * 1.6, y);
    ctx.moveTo(x, y - s * 1.6); ctx.lineTo(x, y + s * 1.6);
    ctx.stroke();
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
 * 多边形斜线填充：用 clip 限定区域，再绘制等间距 45° 斜线
 * 用于测量面积时显示填充效果
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
 * @param {Array<{x: number, y: number}>} points - 多边形顶点数组
 * @param {object} opts - 选项
 * @param {number} [opts.spacing=8] - 斜线间距
 * @param {number} [opts.opacity=0.35] - 斜线透明度
 * @param {string} [opts.color='25, 118, 210'] - 斜线颜色（RGB 格式）
 */
function fillHatch(ctx, points, opts) {
    if (!points || points.length < 3) return;
    const spacing = Math.max(2, opts.spacing || 8);
    const opacity = Math.max(0, Math.min(1, opts.opacity != null ? opts.opacity : 0.35));
    const rgb = opts.color || '25, 118, 210';

    // 计算包围盒
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return;

    ctx.save();
    // 裁剪到多边形
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.clip();

    // 45° 斜线：沿对角线方向等间距绘制
    ctx.strokeStyle = `rgba(${rgb}, ${opacity})`;
    ctx.lineWidth = 1 / Math.max(zoom, 0.01);
    ctx.beginPath();
    // 从左下到右上扫描，步长 = spacing
    const diag = w + h;
    for (let d = -h; d <= w; d += spacing) {
        // 斜线两端点：(minX + d, minY) → (minX + d + h, minY + h) 限制在包围盒内
        const x1 = minX + d;
        const y1 = minY;
        const x2 = x1 + h;
        const y2 = minY + h;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.restore();
}

/**
 * 绘制测量折线：包含线段、顶点编号、段长标注、总长标签、面积标签、段编号
 * 已完成段显示为蓝色实线，进行中段显示为红色虚线
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
 * @param {Array<{x: number, y: number}>} points - 折线顶点数组
 * @param {boolean} isCompleted - 是否为已完成段
 * @param {string|null} segmentLabel - 段编号标签（如 'M1'），null 时不显示
 */
function drawPolyline(ctx, points, isCompleted, segmentLabel) {
    if (!points || points.length === 0) return;

    ctx.save();

    // 以数字字号为基准统一计算，保证外圈/内圈/数字同步缩放
    // 标注字号可由设置面板调整
    const baseLabelSize = settings.measureLabelFontSize || 13;
    const labelSize = Math.max(9, baseLabelSize / zoom);
    const pointRadius = labelSize * 0.55;
    const outerRadius = labelSize * 0.95;
    const lineWidth = 3 / Math.max(zoom, 0.01);

    if (points.length >= 2) {
        ctx.strokeStyle = isCompleted ? '#1976D2' : '#E53935';
        ctx.lineWidth = lineWidth;

        if (!isCompleted) {
            ctx.setLineDash([12 / Math.max(zoom, 0.01), 6 / Math.max(zoom, 0.01)]);
        } else {
            ctx.setLineDash([]);
        }

        if (points.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = isCompleted ? 'rgba(25, 118, 210, 0.12)' : 'rgba(229, 57, 53, 0.10)';
            ctx.fill();

            // 斜线填充表示面积（仅完成态，且设置开启时）
            if (isCompleted && settings.measureShowHatch !== false) {
                fillHatch(ctx, points, {
                    spacing: (settings.measureHatchSpacing || 8) / zoom,
                    opacity: settings.measureHatchOpacity != null ? settings.measureHatchOpacity : 0.35,
                    color: isCompleted ? '25, 118, 210' : '229, 57, 53',
                });
            }
        }

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        if (points.length >= 3 && isCompleted) {
            ctx.closePath();
        }
        ctx.stroke();
    }

    points.forEach((point, index) => {
        drawMeasurePoint(ctx, point.x, point.y,
                        pointRadius, outerRadius, lineWidth,
                        String(index + 1), labelSize);
    });

    if (points.length >= 2 && settings.measureShowSegmentLen !== false) {
        const segments = getSegmentDistances(points);

        segments.forEach((seg, idx) => {
            const fromIdx = seg.from - 1;
            const toIdx = seg.to - 1;
            const midX = (points[fromIdx].x + points[toIdx].x) / 2;
            const midY = (points[fromIdx].y + points[toIdx].y) / 2;

            const dx = points[toIdx].x - points[fromIdx].x;
            const dy = points[toIdx].y - points[fromIdx].y;
            const angle = Math.atan2(dy, dx);
            const perpAngle = angle + Math.PI / 2;
            const offsetDistance = 18 / Math.max(zoom, 0.01);
            const offsetX = Math.cos(perpAngle) * offsetDistance;
            const offsetY = Math.sin(perpAngle) * offsetDistance;

            const segFontSize = Math.max(11, (settings.measureLabelFontSize || 13) / zoom);
            ctx.font = `bold ${segFontSize}px Arial, sans-serif`;

            const segText = seg.distanceText + ' ' + seg.unit;
            const segMetrics = ctx.measureText(segText);
            const segPad = 8 / zoom;
            const labelX = midX + offsetX;
            const labelY = midY + offsetY;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            roundRect(ctx, labelX - segMetrics.width/2 - segPad,
                     labelY - segFontSize/2 - segPad,
                     segMetrics.width + segPad*2,
                     segFontSize + segPad*2,
                     3 / zoom);
            ctx.fill();

            ctx.strokeStyle = isCompleted ? '#1565C0' : '#C62828';
            ctx.lineWidth = 1 / Math.max(zoom, 0.01);
            strokeRoundRect(ctx, labelX - segMetrics.width/2 - segPad,
                           labelY - segFontSize/2 - segPad,
                           segMetrics.width + segPad*2,
                           segFontSize + segPad*2,
                           3 / zoom);

            ctx.fillStyle = isCompleted ? '#1976D2' : '#D32F2F';
            ctx.fillText(segText, labelX, labelY);
        });
    }

    if (points.length >= 2) {
        const totalLen = calculatePolylineTotalLength(points);
        const areaFmt = points.length >= 3 ? calculatePolylineArea(points) : null;

        let sumX = 0, sumY = 0;
        points.forEach(p => { sumX += p.x; sumY += p.y; });
        const centerX = sumX / points.length;
        let centerY = sumY / points.length;

        const totalFontSize = Math.max(16, (settings.measureLabelFontSize || 13) * 1.38 / zoom);
        ctx.font = `bold ${totalFontSize}px Arial, sans-serif`;

        let totalText = '';
        if (points.length === 2) {
            totalText = `Σ ${totalLen.text} ${totalLen.unit}`;
        } else {
            totalText = `Σ ${totalLen.text} ${totalLen.unit} (${points.length}段)`;
        }

        const totalMetrics = ctx.measureText(totalText);
        const totalPad = 10 / zoom;
        const lineGap = 4 / zoom;

        let areaText = null;
        let areaMetrics = null;
        let totalBoxHeight = totalFontSize + totalPad * 2;
        const showAreaText = areaFmt !== null && settings.measureShowArea !== false;

        if (showAreaText) {
            areaText = `▣ ${areaFmt.text} ${areaFmt.unit}`;
            areaMetrics = ctx.measureText(areaText);
            totalBoxHeight = totalFontSize * 2 + lineGap + totalPad * 2;
        }

        const totalBoxWidth = Math.max(
            totalMetrics.width + totalPad * 2,
            areaMetrics ? areaMetrics.width + totalPad * 2 : 0
        );
        const totalBoxX = centerX - totalBoxWidth / 2;
        const totalBoxY = centerY - totalBoxHeight / 2;

        ctx.fillStyle = isCompleted ? 'rgba(25, 118, 210, 0.95)' : 'rgba(211, 47, 47, 0.95)';
        roundRect(ctx, totalBoxX, totalBoxY, totalBoxWidth, totalBoxHeight, 4 / zoom);
        ctx.fill();

        ctx.strokeStyle = isCompleted ? '#1565C0' : '#C62828';
        ctx.lineWidth = 1.5 / Math.max(zoom, 0.01);
        strokeRoundRect(ctx, totalBoxX, totalBoxY, totalBoxWidth, totalBoxHeight, 4 / zoom);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (showAreaText) {
            const lengthY = totalBoxY + totalPad + totalFontSize / 2;
            const areaY = lengthY + totalFontSize / 2 + lineGap + totalFontSize / 2;
            ctx.fillText(totalText, centerX, lengthY);
            ctx.fillText(areaText, centerX, areaY);
        } else {
            ctx.fillText(totalText, centerX, centerY);
        }
    }

    // 段编号标签（M1/M2/...）：放在第一个点上方
    if (segmentLabel && points.length > 0 && settings.measureShowSegLabel !== false) {
        const firstPt = points[0];
        const segLabelSize = Math.max(11, (settings.measureLabelFontSize || 13) / zoom);
        ctx.font = `bold ${segLabelSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const segMetrics = ctx.measureText(segmentLabel);
        const segPad = 5 / zoom;
        const boxW = segMetrics.width + segPad * 2;
        const boxH = segLabelSize + segPad * 2;
        const boxX = firstPt.x - boxW / 2;
        const boxY = firstPt.y - outerRadius - boxH - 4 / zoom;

        ctx.fillStyle = isCompleted ? '#1976D2' : '#E53935';
        roundRect(ctx, boxX, boxY, boxW, boxH, 3 / zoom);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(segmentLabel, firstPt.x, boxY + boxH / 2);
    }

    ctx.setLineDash([]);
    ctx.restore();
}

/**
 * 绘制测量点标记：红色外圈光晕 + 白色内圈 + 红色编号数字
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
 * @param {number} x - 点的虚拟 X 坐标
 * @param {number} y - 点的虚拟 Y 坐标
 * @param {number} radius - 内圈半径
 * @param {number} outerRadius - 外圈光晕半径
 * @param {number} lineWidth - 描边线宽
 * @param {string} label - 编号文字
 * @param {number} labelSize - 文字字号
 */
function drawMeasurePoint(ctx, x, y, radius, outerRadius, lineWidth, label, labelSize) {
    // 外圈光晕（淡红色）
    ctx.beginPath();
    ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(229, 57, 53, 0.15)';
    ctx.fill();

    // 外圈描边
    ctx.beginPath();
    ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // 内圈实心圆（白色背景，突出红色数字）
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.font = `bold ${labelSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 红色数字 + 浅描边增强对比
    ctx.strokeStyle = 'rgba(229, 57, 53, 0.35)';
    ctx.lineWidth = 2 / Math.max(zoom, 0.01);
    ctx.strokeText(label, x, y + 0.5);
    ctx.fillStyle = '#d32f2f';
    ctx.fillText(label, x, y + 0.5);
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

    updateStats();
}

/**
 * 按文件分组渲染统计面板 HTML
 * 当有多个文件时使用此视图，按文件→类型二级分组显示标记数量
 * @returns {string} 统计面板 HTML 字符串
 */
function renderStatsByFile() {
    const byDoc = new Map();
    for (const m of markers) {
        if (!byDoc.has(m.docId)) byDoc.set(m.docId, []);
        byDoc.get(m.docId).push(m);
    }

    const docOrder = documents.map(d => d.id).filter(id => byDoc.has(id));
    for (const id of byDoc.keys()) {
        if (!docOrder.includes(id)) docOrder.push(id);
    }

    let html = '';

    for (const docId of docOrder) {
        const list = byDoc.get(docId);
        const fileName = getDocFileName(docId);

        html += `<div class="stats-file">
            <div class="stats-file__name">${escapeHtml(fileName)}<span class="stats-file__total">${list.length} 个</span></div>`;

        const docCounts = new Map();
        for (const m of list) {
            const key = m.typeId;
            if (!docCounts.has(key)) {
                docCounts.set(key, { count: 0, name: m.typeName, fullName: m.typeFullName || '', color: m.color });
            }
            const entry = docCounts.get(key);
            entry.count++;
            entry.color = m.color;
            if (m.typeFullName) entry.fullName = m.typeFullName;
        }

        for (const [id, c] of docCounts) {
            html += `<div class="stats-row">
                <div class="stats-type"><span class="stats-dot" style="background:${c.color}"></span><span class="stats-name">${escapeHtml(c.name)}</span></div>
                <span class="stats-count">${c.count}</span>
            </div>`;
        }

        html += '</div>';
    }

    return html;
}

/**
 * 按页面分组渲染统计面板 HTML
 * 当单个文件包含多页时使用此视图，按页面→类型二级分组显示标记数量
 * @returns {string} 统计面板 HTML 字符串
 */
function renderStatsByPage() {
    const doc = documents[0];

    let html = '';

    html += `<div class="stats-file-header">
        📄 ${escapeHtml(doc.fileName)}
        <span class="stats-total-markers">${markers.length} 个标记</span>
    </div>`;

    const byPage = new Map();
    for (const m of markers) {
        if (!byPage.has(m.pageIndex)) {
            byPage.set(m.pageIndex, []);
        }
        byPage.get(m.pageIndex).push(m);
    }

    const sortedPages = [...byPage.keys()].sort((a, b) => a - b);

    for (const pageIndex of sortedPages) {
        const pageMarkers = byPage.get(pageIndex);

        html += `<div class="stats-page-group" data-page="${pageIndex}">
            <div class="stats-page__name">
                📄 第${pageIndex}页
                <span>${pageMarkers.length} 个</span>
            </div>`;

        const typeCounts = new Map();
        for (const m of pageMarkers) {
            if (!typeCounts.has(m.typeId)) {
                typeCounts.set(m.typeId, {
                    count: 0,
                    name: m.typeName,
                    color: m.color
                });
            }
            typeCounts.get(m.typeId).count++;
        }

        for (const [id, tc] of typeCounts) {
            html += `<div class="stats-row">
                <div class="stats-type">
                    <span class="stats-dot" style="background:${tc.color}"></span>
                    <span class="stats-name">${escapeHtml(tc.name)}</span>
                </div>
                <span class="stats-count">${tc.count}</span>
            </div>`;
        }

        html += '</div>';
    }

    return html;
}

/**
 * 更新统计面板：根据文件数量自动选择按文件 / 按页面视图
 * 统计各类型标记的数量并显示在侧边栏中
 */
function updateStats() {
    if (markers.length === 0) {
        statsList.innerHTML = '<div class="stats-empty">暂无标记</div>';
        statsTotal.textContent = '共 0 个';
        return;
    }

    const isSingleMultiPageDoc =
        documents.length === 1 &&
        documents[0] &&
        documents[0].pageCount > 1;

    let html;

    if (isSingleMultiPageDoc) {
        html = renderStatsByPage();
    } else {
        html = renderStatsByFile();
    }

    statsList.innerHTML = html;
    statsTotal.textContent = `共 ${markers.length} 个`;

    const show = pages.length > 0 || markers.length > 0;
    statsToggle.classList.toggle('visible', show);
    if (!show) {
        statsPanel.classList.remove('visible');
        statsToggle.classList.remove('active');
    }
}