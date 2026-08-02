/**
 * config.js - 全局配置常量
 * 定义 PDF 渲染、缩放、标记、测量、自动保存等所有可配置参数
 */

/** @const {string} PDF.js 库版本号 */
const PDFJS_VERSION = '3.11.174';
// ---- 外部库 CDN 路径 ----
const PDFJS_CDN = `lib/pdf.min.js`;
const PDFJS_WORKER_CDN = `lib/pdf.worker.min.js`;
const PDFLIB_CDN = 'lib/pdf-lib.min.js';
const EXCELJS_CDN = 'lib/exceljs.min.js';

// ---- 画布布局参数 ----
const PAGE_GAP = 16;
const PAGE_CAPTION_H = 22;
const DOC_GAP = 48;

// ---- 缩放参数 ----
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 30;
const ZOOM_SENSITIVITY = 0.001;
const WHEEL_PAN_SPEED = 1.0;

// ---- 标记参数 ----
const MARKER_MIN_DIST = 28;
const MAX_MARKER_NUMBER = 9999;

// ---- 自动保存参数 ----
const AUTOSAVE_KEY = 'elecPdfMarkerAutosave_v1';
const AUTOSAVE_DEBOUNCE_MS = 400;
const SETTINGS_KEY = 'elecPdfMarkerSettings_v1';

/**
 * 默认设置对象
 * 包含标记编号位数、页面标题显示、测量模式等用户可配置项
 */
const defaultSettings = {
    numberPadDigits: 3,
    showPageCaption: true,
    captionShowName: true,
    captionShowSize: true,
    measureMode: 'drawing',
    measureScale: 530,
    // 测量标注显示设置
    measureShowSegmentLen: true,   // 显示线段距离
    measureShowArea: true,         // 显示面积
    measureShowSegLabel: true,     // 显示段编号(M1/M2)
    measureShowHatch: true,        // 多边形内部斜线填充
    measureLabelFontSize: 13,      // 标注文字字号(px 基准)
    measureHatchSpacing: 8,        // 斜线间距(px)
    measureHatchOpacity: 0.35,     // 斜线透明度(0-1)
};

// ---- 移动端检测 ----
// 仅通过触摸能力和屏幕宽度判断，移除 devicePixelRatio 检查（4K/Retina 桌面显示器会误判）
const isMobile = window.innerWidth < 768 ||
    ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

// ---- 标记尺寸参数（移动端/桌面端） ----
const MOBILE_RADIUS = 42;
const MOBILE_FONT_SIZE = 36;
const DESKTOP_RADIUS = 35;
const DESKTOP_FONT_SIZE = 30;

// ---- PDF 渲染参数（移动端/桌面端） ----
const PDF_RENDER_SCALE = isMobile ? 4.5 : 5.5;
const RENDER_MAX_DIM = isMobile ? 6000 : 8000;
const RENDER_MAX_PIXELS = isMobile ? 20000000 : 36000000;

// ---- 线条宽度参数（移动端/桌面端） ----
const DESKTOP_LINE_WIDTH = 2.0;
const MOBILE_LINE_WIDTH = 2.5;
