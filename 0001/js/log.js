// ===== 操作日志系统 =====
// 所有用户操作都会被记录到屏幕左下角，游戏风格，简洁不复杂

const MAX_LOG_ENTRIES = 50; // 最多保留 50 条日志
const LOG_DISPLAY_COUNT = 6; // 屏幕上同时显示 6 条
let _logEntries = []; // 日志缓冲区 [{msg, time, id}]
let _logIdCounter = 0; // 日志条目自增 ID

// 添加一条操作日志
// msg: 日志文本（支持简单 HTML 如 <b>标记</b>）
function addLog(msg) {
    const entry = {
        msg: msg,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        id: ++_logIdCounter,
    };
    _logEntries.push(entry);
    // 超出上限时移除旧条目
    while (_logEntries.length > MAX_LOG_ENTRIES) {
        _logEntries.shift();
    }
    _renderLog();
    // 同时输出到控制台便于调试
    console.log('[LOG]', entry.time, msg.replace(/<[^>]*>/g, ''));
}

// 渲染日志到屏幕左下角
function _renderLog() {
    const container = document.getElementById('opLog');
    if (!container) return;
    // 取最后 N 条显示，最新在上面
    const display = _logEntries.slice(-LOG_DISPLAY_COUNT).reverse();
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