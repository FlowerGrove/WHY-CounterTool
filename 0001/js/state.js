/**
 * state.js - 全局状态管理
 * 管理画布平移/缩放、文档/页面列表、标记数据、编号系统、
 * 测量模式、多段测量、擦除模式等核心状态变量和操作函数
 */

/** @type {number} 画布水平平移偏移量 */
let panX = 0,
    panY = 0,
    zoom = 1;

// ---- 文档和页面状态 ----
let documents = [];
let pages = [];
let nextDocId = 1;

// ---- 标记数据 ----
let markers = [];

/** @const {number} 标记线宽（根据平台自动选择） */
const markerLineWidth = isMobile ? MOBILE_LINE_WIDTH : DESKTOP_LINE_WIDTH;

// ---- 全局自动编号系统 ----
// 所有仪表类型共享同一编号序列
let nextMarkerNumber = 1;
/** @type {number} 全局创建顺序计数器，用于按创建顺序排列标记 */
let _globalOrderCounter = 0;
/** @type {boolean} 用户是否手动设置了编号 */
let manualNumberSet = false;
/** @type {Set<number>} 已使用的编号集合 */
const usedNumbers = new Set();

// ---- 擦除模式 ----
let eraseMode = false;

// ---- 多段线模式 ----
let polylineMode = false;
let currentPolylinePoints = [];
let isPolylineComplete = false;

// ---- 多段测量 ----
// 已完成的测量段数组，每个元素: { id, points, totalLenPixels, areaPixels|null }
let measurements = [];

// ---- 测量模式状态 ----
let measureMode = settings.measureMode || 'drawing';
let measureScale = settings.measureScale || 530;

/** @type {?{x: number, y: number}} 当前鼠标附近的捕捉点 */
let snapHint = null;

// ---- 测量校准阶段 ----
// 'calibrate'(校准) | 'measure'(测量)
let measurePhase = 'calibrate';
/** @type {Array<{x: number, y: number}>} 校准用的两个点 */
let calibratePoints = [];
/** @type {?{x: number, y: number}} 校准时鼠标正交投影点 */
let calibratePreview = null;
/** @type {?number} 用户测量得到的原始比例（未自动校准前的值） */
let measureRawScale = null;

/**
 * 获取已使用编号的集合引用
 * @returns {Set<number>} 已使用编号集合
 */
function getUsedSet() {
    return usedNumbers;
}

/**
 * 检查编号是否已被使用（兼容历史/恢复逻辑）
 * 用户手动编号时不做唯一性检查
 * @param {number} num - 要检查的编号
 * @returns {boolean} 是否已被使用
 */
function isNumberUsed(num) {
    return usedNumbers.has(num);
}

/**
 * 将编号标记为已使用
 * @param {number} num - 要预留的编号
 */
function reserveNumber(num) {
    usedNumbers.add(num);
    addLog('预留编号: ' + num);
}

/**
 * 释放编号，使其可被重新分配
 * @param {number} num - 要释放的编号
 */
function releaseNumber(num) {
    usedNumbers.delete(num);
    addLog('释放编号: ' + num);
}

/**
 * 查找下一个可用编号（从1开始递增）
 * @returns {number} 下一个可用编号
 */
function findNextNumber() {
    let n = 1;
    while (n <= MAX_MARKER_NUMBER && usedNumbers.has(n)) n++;
    return n > MAX_MARKER_NUMBER ? MAX_MARKER_NUMBER : n;
}

/**
 * 更新编号输入框的验证状态（高亮错误）
 */
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

/**
 * 将编号输入框同步为当前下一个可用编号
 */
function syncNumberInput() {
    numberInput.value = formatMarkerNumber(nextMarkerNumber);
    numberInput.classList.remove('error');
    updateNumberInputState();
}