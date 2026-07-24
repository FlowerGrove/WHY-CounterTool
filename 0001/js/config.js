const PDFJS_VERSION = '3.11.174';
const PDFJS_CDN = `lib/pdf.min.js`;
const PDFJS_WORKER_CDN = `lib/pdf.worker.min.js`;
const PDFLIB_CDN = 'lib/pdf-lib.min.js';
const EXCELJS_CDN = 'lib/exceljs.min.js';

const PAGE_GAP = 16;
const PAGE_CAPTION_H = 22;
const DOC_GAP = 48;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 30;
const ZOOM_SENSITIVITY = 0.001;
const WHEEL_PAN_SPEED = 1.0;
const MARKER_MIN_DIST = 28;
const MAX_MARKER_NUMBER = 9999;
const AUTOSAVE_KEY = 'elecPdfMarkerAutosave_v1';
const AUTOSAVE_DEBOUNCE_MS = 400;
const SETTINGS_KEY = 'elecPdfMarkerSettings_v1';

const defaultSettings = {
    numberPadDigits: 3,
    showPageCaption: true,
    captionShowName: true,
    captionShowSize: true,
};

const isMobile = window.innerWidth < 768 || window.devicePixelRatio > 2 ||
    ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

const MOBILE_RADIUS = 28;
const MOBILE_FONT_SIZE = 14;
const DESKTOP_RADIUS = 26;
const DESKTOP_FONT_SIZE = 12;

const PDF_RENDER_SCALE = isMobile ? 4.5 : 5.5;
const RENDER_MAX_DIM = isMobile ? 6000 : 8000;
const RENDER_MAX_PIXELS = isMobile ? 20000000 : 36000000;

const DESKTOP_LINE_WIDTH = 2.0;
const MOBILE_LINE_WIDTH = 2.5;
