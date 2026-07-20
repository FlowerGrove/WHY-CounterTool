let renderReq = null;

function requestRender() {
    if (renderReq) return;
    renderReq = requestAnimationFrame(() => {
        renderReq = null;
        render();
    });
}

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

    for (const m of markers) {
        drawMarker(ctx, m);
    }

    if (polylineMode && currentPolylinePoints.length > 0) {
        drawPolyline(ctx, currentPolylinePoints, isPolylineComplete);
    }

    ctx.restore();
}

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

function drawMarker(ctx, m) {
    const rgb = hexToRgb(m.color);
    const label = formatMarkerLabel(m);

    ctx.save();
    ctx.translate(m.vx, m.vy);

    ctx.beginPath();
    ctx.arc(0, 0, markerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = markerLineWidth;
    ctx.strokeStyle = `rgb(${rgb.r * 255},${rgb.g * 255},${rgb.b * 255})`;
    ctx.stroke();

    const fontSize = label.length > 5 ? markerFontSize * 0.68 : (label.length > 4 ? markerFontSize * 0.78 : markerFontSize);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = `rgb(${rgb.r * 255},${rgb.g * 255},${rgb.b * 255})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);

    ctx.restore();
}

function drawPolyline(ctx, points, isCompleted) {
    if (!points || points.length === 0) return;

    ctx.save();

    const pointRadius = 6 / Math.max(zoom, 0.01);
    const outerRadius = 10 / Math.max(zoom, 0.01);
    const lineWidth = 3 / Math.max(zoom, 0.01);

    if (points.length >= 2) {
        ctx.strokeStyle = isCompleted ? '#1976D2' : '#E53935';
        ctx.lineWidth = lineWidth;

        if (!isCompleted) {
            ctx.setLineDash([12 / Math.max(zoom, 0.01), 6 / Math.max(zoom, 0.01)]);
        } else {
            ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
    }

    points.forEach((point, index) => {
        drawMeasurePoint(ctx, point.x, point.y,
                        pointRadius, outerRadius, lineWidth,
                        String(index + 1));
    });

    if (points.length >= 2) {
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

            const segFontSize = Math.max(11, 13 / zoom);
            ctx.font = `bold ${segFontSize}px Arial, sans-serif`;

            const segText = seg.distanceMM + ' mm';
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

        const totalMM = calculatePolylineTotalLength(points);

        let sumX = 0, sumY = 0;
        points.forEach(p => { sumX += p.x; sumY += p.y; });
        const centerX = sumX / points.length;
        const centerY = sumY / points.length;

        const totalFontSize = Math.max(16, 18 / zoom);
        ctx.font = `bold ${totalFontSize}px Arial, sans-serif`;

        let totalText = '';
        if (points.length === 2) {
            totalText = `Σ ${totalMM} mm`;
        } else {
            totalText = `Σ ${totalMM} mm (${points.length}段)`;
        }

        const totalMetrics = ctx.measureText(totalText);
        const totalPad = 10 / zoom;

        ctx.fillStyle = isCompleted ? 'rgba(25, 118, 210, 0.95)' : 'rgba(211, 47, 47, 0.95)';
        roundRect(ctx, centerX - totalMetrics.width/2 - totalPad,
                 centerY - totalFontSize/2 - totalPad,
                 totalMetrics.width + totalPad*2,
                 totalFontSize + totalPad*2,
                 4 / zoom);
        ctx.fill();

        ctx.strokeStyle = isCompleted ? '#1565C0' : '#C62828';
        ctx.lineWidth = 1.5 / Math.max(zoom, 0.01);
        strokeRoundRect(ctx, centerX - totalMetrics.width/2 - totalPad,
                       centerY - totalFontSize/2 - totalPad,
                       totalMetrics.width + totalPad*2,
                       totalFontSize + totalPad*2,
                       4 / zoom);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(totalText, centerX, centerY);
    }

    ctx.setLineDash([]);
    ctx.restore();
}

function drawMeasurePoint(ctx, x, y, radius, outerRadius, lineWidth, label) {
    ctx.beginPath();
    ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(229, 57, 53, 0.15)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#e53935';
    ctx.fill();

    const labelSize = Math.max(9, 11 / zoom);
    ctx.font = `bold ${labelSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x, y + 0.5);
}

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

function updateUI() {
    if (pages.length > 0) {
        const docCount = documents.length;
        pageCountEl.textContent = docCount > 1
            ? `${docCount} 个文件 · ${pages.length} 页`
            : `${pages.length} 页`;
    } else {
        pageCountEl.textContent = '';
    }
    pageCountEl.classList.toggle('visible', pages.length > 0);
    dropHint.classList.toggle('hidden', pages.length > 0);

    updateStats();
}

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