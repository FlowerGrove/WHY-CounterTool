let panX = 0,
    panY = 0,
    zoom = 1;

let documents = [];
let pages = [];
let nextDocId = 1;

let markers = [];

const markerLineWidth = isMobile ? MOBILE_LINE_WIDTH : DESKTOP_LINE_WIDTH;

let nextMarkerNumber = 1;
const usedNumbersByType = new Map();

let eraseMode = false;
let polylineMode = false;
let currentPolylinePoints = [];
let isPolylineComplete = false;

function getUsedSet(typeId) {
    if (!usedNumbersByType.has(typeId)) usedNumbersByType.set(typeId, new Set());
    return usedNumbersByType.get(typeId);
}

function isNumberUsed(num, typeId = currentTypeId) {
    return getUsedSet(typeId).has(num);
}

function reserveNumber(num, typeId = currentTypeId) {
    getUsedSet(typeId).add(num);
}

function releaseNumber(num, typeId) {
    getUsedSet(typeId).delete(num);
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