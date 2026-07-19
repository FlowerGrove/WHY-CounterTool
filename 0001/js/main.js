const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
const dropHint = document.getElementById('dropHint');
const pageCountEl = document.getElementById('pageCount');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const fileInput = document.getElementById('fileInput');
const colorPicker = document.getElementById('colorPicker');
const radiusSlider = document.getElementById('radiusSlider');
const fontSizeSlider = document.getElementById('fontSizeSlider');
const radiusValueEl = document.getElementById('radiusValue');
const fontSizeValueEl = document.getElementById('fontSizeValue');
const numberInput = document.getElementById('numberInput');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const eraserBtn = document.getElementById('eraserBtn');
const measureBtn = document.getElementById('measureBtn');
const clearBtn = document.getElementById('clearBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const settingsCancelBtn = document.getElementById('settingsCancelBtn');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');
const settingPadDigits = document.getElementById('settingPadDigits');
const settingShowCaption = document.getElementById('settingShowCaption');
const settingCaptionName = document.getElementById('settingCaptionName');
const settingCaptionSize = document.getElementById('settingCaptionSize');
const typeChipsEl = document.getElementById('typeChips');
const addTypeBtn = document.getElementById('addTypeBtn');
const statsPanel = document.getElementById('statsPanel');
const statsToggle = document.getElementById('statsToggle');
const statsList = document.getElementById('statsList');
const statsTotal = document.getElementById('statsTotal');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const exportExcelBottomBtn = document.getElementById('exportExcelBottomBtn');
const exportPdfFromStatsBtn = document.getElementById('exportPdfFromStatsBtn');

let currentColor = colorPicker.value;
let markerRadius = isMobile ? MOBILE_RADIUS : DESKTOP_RADIUS;
let markerFontSize = isMobile ? MOBILE_FONT_SIZE : DESKTOP_FONT_SIZE;

radiusSlider.value = markerRadius;
fontSizeSlider.value = markerFontSize;
radiusValueEl.textContent = markerRadius;
fontSizeValueEl.textContent = markerFontSize;

function resizeCanvas() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    requestRender();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

checkPendingRestore();
renderTypeChips();
syncNumberInput();
requestRender();