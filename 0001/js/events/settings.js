/**
 * 设置面板模块 - 处理工具栏设置和全局配置
 */

// ===== 工具栏控件事件 =====

radiusSlider.addEventListener('input', () => {
    markerRadius = parseFloat(radiusSlider.value);
    radiusValueEl.textContent = markerRadius;
    requestRender();
});

fontSizeSlider.addEventListener('input', () => {
    markerFontSize = parseFloat(fontSizeSlider.value);
    fontSizeValueEl.textContent = markerFontSize;
    requestRender();
});

numberInput.addEventListener('input', () => {
    updateNumberInputState();
});

numberInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const val = parseInt(numberInput.value, 10);
        if (!isNaN(val) && val >= 1 && val <= MAX_MARKER_NUMBER && !isNumberUsed(val)) {
            nextMarkerNumber = val;
            syncNumberInput();
        }
    }
});

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

// ===== 设置面板按钮 =====

settingsBtn.addEventListener('click', () => {
    settingPadDigits.value = String(settings.numberPadDigits);
    settingShowCaption.checked = settings.showPageCaption;
    settingCaptionName.checked = settings.captionShowName;
    settingCaptionSize.checked = settings.captionShowSize;
    settingMeasureMode.value = measureMode;
    settingMeasureScale.value = measureScale;
    // 回填测量标注样式
    settingMeasureShowSegmentLen.checked = settings.measureShowSegmentLen !== false;
    settingMeasureShowArea.checked = settings.measureShowArea !== false;
    settingMeasureShowSegLabel.checked = settings.measureShowSegLabel !== false;
    settingMeasureShowHatch.checked = settings.measureShowHatch !== false;
    settingMeasureLabelFontSize.value = settings.measureLabelFontSize || 13;
    settingMeasureHatchSpacing.value = settings.measureHatchSpacing || 8;
    settingMeasureHatchOpacity.value = settings.measureHatchOpacity != null ? settings.measureHatchOpacity : 0.35;
    settingsBackdrop.classList.add('visible');
});

settingsCloseBtn.addEventListener('click', () => {
    settingsBackdrop.classList.remove('visible');
});
settingsCancelBtn.addEventListener('click', () => {
    settingsBackdrop.classList.remove('visible');
});

settingsSaveBtn.addEventListener('click', () => {
    settings.numberPadDigits = parseInt(settingPadDigits.value, 10) || 3;
    settings.showPageCaption = settingShowCaption.checked;
    settings.captionShowName = settingCaptionName.checked;
    settings.captionShowSize = settingCaptionSize.checked;
    measureMode = settingMeasureMode.value;
    measureScale = Math.max(1, parseFloat(settingMeasureScale.value) || 1);
    measureRawScale = null;
    settings.measureMode = measureMode;
    settings.measureScale = measureScale;
    // 测量标注样式设置
    settings.measureShowSegmentLen = settingMeasureShowSegmentLen.checked;
    settings.measureShowArea = settingMeasureShowArea.checked;
    settings.measureShowSegLabel = settingMeasureShowSegLabel.checked;
    settings.measureShowHatch = settingMeasureShowHatch.checked;
    settings.measureLabelFontSize = parseInt(settingMeasureLabelFontSize.value, 10) || 13;
    settings.measureHatchSpacing = parseInt(settingMeasureHatchSpacing.value, 10) || 8;
    settings.measureHatchOpacity = parseFloat(settingMeasureHatchOpacity.value) || 0.35;
    saveSettings();
    settingsBackdrop.classList.remove('visible');
    updateMeasureUI();
    requestRender();
});

settingsBackdrop.addEventListener('click', (e) => {
    if (e.target === settingsBackdrop) {
        settingsBackdrop.classList.remove('visible');
    }
});

// ===== 其他按钮 =====

clearBtn.addEventListener('click', clearAll);

addTypeBtn.addEventListener('click', addCustomType);

// IO List 类型选择按钮
const ioSelectBtn = document.getElementById('ioSelectBtn');
if (ioSelectBtn) ioSelectBtn.addEventListener('click', openIOSelectModal);

statsToggle.addEventListener('click', () => {
    const visible = statsPanel.classList.toggle('visible');
    statsToggle.classList.toggle('active', visible);
});

exportExcelBtn.addEventListener('click', exportExcel);
exportExcelBottomBtn.addEventListener('click', exportExcel);
exportBtn.addEventListener('click', exportMarkedPDF);
exportPdfFromStatsBtn.addEventListener('click', exportMarkedPDF);
exportBothBtn.addEventListener('click', exportBoth);

// 预览窗口事件绑定已移至 js/preview.js（直接读取内存数据，无需 iframe）

// 测量数据导出（独立于仪表标记导出）
exportMeasureExcelBtn.addEventListener('click', exportMeasureExcel);
exportMeasurePdfBtn.addEventListener('click', exportMeasurePdf);

// ===== PDF 导入 =====

importBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).filter(f =>
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) await importPDF(files);
    fileInput.value = '';
});

// ===== 初始化 UI 状态 =====
updateModeUI();