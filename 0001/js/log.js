// ===== 操作日志系统 =====
// 所有用户操作都会被记录到屏幕右下角，显示 3 条，旧条目 5s 后自动消失

const LOG_DISPLAY_COUNT = 3; // 屏幕上同时显示 3 条
const LOG_FADE_DELAY = 5000; // 5s 后自动消失
let _logEntries = []; // 日志缓冲区 [{msg, time, id}]
let _logIdCounter = 0; // 日志条目自增 ID
let _logTimers = new Map(); // 条目 ID → 自动消失定时器

// 添加一条操作日志
// msg: 日志文本（支持简单 HTML 如 <b>标记</b>）
function addLog(msg) {
    const entry = {
        msg: msg,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        id: ++_logIdCounter,
    };
    _logEntries.push(entry);
    // 超出显示条数时移除旧条目
    while (_logEntries.length > LOG_DISPLAY_COUNT) {
        _removeEntry(_logEntries[0].id);
    }
    _renderLog();
    // 5s 后自动消失
    _logTimers.set(entry.id, setTimeout(() => _removeEntry(entry.id), LOG_FADE_DELAY));
    // 同时输出到控制台便于调试
    console.log('[LOG]', entry.time, msg.replace(/<[^>]*>/g, ''));
}

function _removeEntry(id) {
    const idx = _logEntries.findIndex(e => e.id === id);
    if (idx !== -1) _logEntries.splice(idx, 1);
    if (_logTimers.has(id)) {
        clearTimeout(_logTimers.get(id));
        _logTimers.delete(id);
    }
    _renderLog();
}

// 渲染日志到屏幕右下角
function _renderLog() {
    const container = document.getElementById('opLog');
    if (!container) return;
    const display = [..._logEntries].reverse();
    container.innerHTML = display.map(e =>
        `<div class="op-log-item" data-logid="${e.id}">
            <span class="op-log-time">${e.time}</span>
            <span class="op-log-msg">${e.msg}</span>
        </div>`
    ).join('');
}

// 清空日志
function clearLog() {
    _logEntries = [];
    _logTimers.forEach(t => clearTimeout(t));
    _logTimers.clear();
    const container = document.getElementById('opLog');
    if (container) container.innerHTML = '';
}

// 日志折叠切换
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('opLogToggle');
    const wrap = document.getElementById('opLogWrap');
    if (toggle && wrap) {
        toggle.addEventListener('click', () => {
            wrap.classList.toggle('collapsed');
        });
    }
});