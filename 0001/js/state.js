let panX = 0,
    panY = 0,
    zoom = 1;

let documents = [];
let pages = [];
let nextDocId = 1;

let markers = [];

const markerLineWidth = isMobile ? MOBILE_LINE_WIDTH : DESKTOP_LINE_WIDTH;

// 兼容旧自动编号（保留变量，但不再自动分配）
let nextMarkerNumber = 1;
const usedNumbersByType = new Map();

let eraseMode = false;
let polylineMode = false;
let currentPolylinePoints = [];
let isPolylineComplete = false;

// 多段测量：已完成的测量段数组
// 每个元素: { id, points, totalLenPixels, areaPixels|null }
let measurements = [];

let measureMode = settings.measureMode || 'drawing';
let measureScale = settings.measureScale || 530;

let snapHint = null; // 当前鼠标附近的捕捉点 {x,y} 或 null

// 测量阶段：'calibrate'(校准) | 'measure'(测量)
let measurePhase = 'calibrate';
let calibratePoints = []; // 校准用的两点
let calibratePreview = null; // 校准时鼠标正交投影点 {x,y}
let measureRawScale = null; // 用户测量得到的原始比例（未自动校准前的值）

function getUsedSet(typeId) {
    if (!usedNumbersByType.has(typeId)) usedNumbersByType.set(typeId, new Set());
    return usedNumbersByType.get(typeId);
}

// 旧函数保留以兼容历史/恢复逻辑，不再强制执行唯一性（用户手动编号时不检查）
function isNumberUsed(num, typeId = currentTypeId) {
    return false;
}

function reserveNumber(num, typeId = currentTypeId) {
    // 无操作：不再强制编号
}

function releaseNumber(num, typeId) {
    // 无操作：不再强制编号
}

function findNextNumberForType(typeId) {
    let n = 1;
    const used = getUsedSet(typeId);
    while (n <= MAX_MARKER_NUMBER && used.has(n)) n++;
    return n > MAX_MARKER_NUMBER ? MAX_MARKER_NUMBER : n;
}

function updateNumberInputState() {
    const val = parseInt(numberInput.value, 10);
    if (isNaN(val) || val < 1 || val > MAX_MARKER_NUMBER) {
        numberInput.classList.add('error');
    } else if (isNumberUsed(val)) {
        numberInput.classList.add('error');
    } else {
        numberInput.classList.remove('error');
    }
}

function syncNumberInput() {
    numberInput.value = formatMarkerNumber(nextMarkerNumber);
    numberInput.classList.remove('error');
    updateNumberInputState();
}