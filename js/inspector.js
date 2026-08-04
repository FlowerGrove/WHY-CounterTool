/**
 * inspector.js - Inspector 属性面板模块
 * 类似 Unity/Godot 的 Inspector，停靠在屏幕右侧，显示选中标记的完整属性
 * 打开方式：右键标记 → 属性 / 左键点击标记 + Ctrl+1
 */

// ===== 状态 =====
let inspectorTarget = null;  // 当前选中的标记对象
let inspectorDirty = false;  // 是否有未保存的修改
let inspectorActiveTab = 'builtin';  // 当前激活的标签页: 'builtin' | 'custom'

// ===== DOM 引用 =====
const inspectorPanel = document.getElementById('inspectorPanel');
const inspectorIcon = document.getElementById('inspectorIcon');
const inspectorTitle = document.getElementById('inspectorTitle');
const inspectorBody = document.getElementById('inspectorBody');
const inspectorEmpty = document.getElementById('inspectorEmpty');
const inspectorFields = document.getElementById('inspectorFields');

// ===== 内置属性定义（与 excel-config 的字段对应） =====
const INSPECTOR_BUILTIN_FIELDS = [
    { key: 'tagNumber',  label: 'Tag No.',                section: 'Identification' },
    { key: 'location',   label: 'Location',               section: 'Identification' },
    { key: 'typeFullName', label: 'Instrument Type',      section: 'Identification', readonly: true },
    { key: 'sizeNote',   label: 'Process Connection',     section: 'Specification' },
    { key: 'range',      label: 'Size / Cal. Range',      section: 'Specification' },
    { key: 'service',    label: 'Service',                section: 'Specification' },
    { key: 'product',    label: 'Product',                section: 'Specification' },
    { key: 'dataSheet',  label: 'Data Sheet No.',         section: 'Document' },
    { key: 'pid',        label: 'P & ID Dwg No.',         section: 'Document' },
    { key: 'note',       label: 'Remarks',                section: 'Document' },
];

/**
 * 打开 Inspector 面板，加载指定标记的属性
 * @param {Object} marker - 标记对象
 */
function openInspector(marker) {
    if (!marker) return;
    if (!markers.includes(marker)) {
        showToast('标记已被删除');
        return;
    }

    // 如果同一标记已打开，只确保面板可见
    if (inspectorTarget === marker && inspectorPanel.classList.contains('visible')) {
        return;
    }

    // 自动保存当前修改
    if (inspectorDirty && inspectorTarget) {
        saveInspector();
    }

    inspectorTarget = marker;
    inspectorDirty = false;
    renderInspector();
    inspectorPanel.classList.add('visible');
    addLog('打开属性面板: ' + formatMarkerLabel(marker));
}

/**
 * 关闭 Inspector 面板
 */
function closeInspector() {
    if (inspectorDirty && inspectorTarget) {
        saveInspector();
    }
    inspectorPanel.classList.remove('visible');
    inspectorTarget = null;
    inspectorDirty = false;
}

/**
 * 切换 Inspector 面板（不改变目标标记）
 */
function toggleInspector() {
    if (inspectorPanel.classList.contains('visible')) {
        closeInspector();
    } else if (inspectorTarget) {
        inspectorPanel.classList.add('visible');
        renderInspector();
    }
}

/**
 * 渲染 Inspector 面板内容
 * 根据当前 inspectorTarget 和 activeTab 渲染对应字段
 */
function renderInspector() {
    if (!inspectorTarget) {
        inspectorEmpty.hidden = false;
        inspectorFields.hidden = true;
        document.getElementById('inspectorTabs').hidden = true;
        return;
    }

    const m = inspectorTarget;
    const t = getTypeById(m.typeId);

    // Header
    const color = m.color || t.color || '#e53935';
    inspectorIcon.style.background = color;
    inspectorIcon.textContent = m.typeAbbr || t.abbr || '';
    inspectorTitle.textContent = formatMarkerLabel(m);

    // 显示标签栏
    document.getElementById('inspectorTabs').hidden = false;

    // 更新标签激活状态
    document.querySelectorAll('.inspector-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === inspectorActiveTab);
    });

    let html = '';

    // UID 计数器：内置字段从 01 开始，自定义属性接在后面
    let uidCounter = 0;
    function nextUid() { uidCounter++; return String(uidCounter).padStart(2, '0'); }

    // ===== Tab 1: 仪表属性 =====
    html += '<div class="inspector-tab-panel" data-panel="builtin"' + (inspectorActiveTab !== 'builtin' ? ' hidden' : '') + '>';

    const sections = {};
    INSPECTOR_BUILTIN_FIELDS.forEach(f => {
        if (!sections[f.section]) sections[f.section] = [];
        sections[f.section].push(f);
    });

    for (const [sectionName, fields] of Object.entries(sections)) {
        html += '<div class="inspector-section">';
        html += '<div class="inspector-section-header" data-section="' + pvEscape(sectionName) + '">';
        html += '<span class="inspector-section-arrow"><i class="fa-solid fa-chevron-down"></i></span>';
        html += '<span>' + pvEscape(sectionName) + '</span>';
        html += '</div>';
        html += '<div class="inspector-section-body">';

        fields.forEach(f => {
            const val = getInspectorFieldValue(m, f);
            const uid = nextUid();
            html += '<div class="inspector-field">';
            html += '<div class="inspector-label-row">';
            html += '<span class="inspector-label">' + pvEscape(f.label) + '</span>';
            html += '<span class="inspector-uid">uid=' + uid + '</span>';
            html += '</div>';
            if (f.readonly) {
                html += '<input type="text" class="inspector-input" value="' + pvEscape(val) + '" disabled />';
            } else {
                html += '<input type="text" class="inspector-input" data-field="' + f.key + '" value="' + pvEscape(val) + '" placeholder="-" />';
            }
            html += '</div>';
        });

        html += '</div></div>';
    }

    html += '</div>';

    // ===== Tab 2: 自定义属性 =====
    const customDefs = getCustomAttrDefs().filter(d => d.enabled !== false);
    html += '<div class="inspector-tab-panel" data-panel="custom"' + (inspectorActiveTab !== 'custom' ? ' hidden' : '') + '>';
    html += '<div style="padding:6px 10px 10px;">';

    customDefs.forEach(d => {
        const val = getCustomAttrValue(m, d.key);
        const uid = nextUid();
        html += '<div class="inspector-custom-row" data-cattr-key="' + d.key + '">';
        html += '<div class="inspector-field">';
        html += '<div class="inspector-label-row">';
        html += '<span class="inspector-label">' + pvEscape(d.label) + '</span>';
        html += '<span class="inspector-uid">uid=' + uid + '</span>';
        html += '</div>';
        html += '<input type="text" class="inspector-input" data-custom-attr="' + d.key + '" value="' + pvEscape(val) + '" placeholder="-" />';
        html += '</div>';
        html += '<div class="inspector-custom-actions">';
        html += '<button class="inspector-custom-menu-btn" title="更多操作"><i class="fa-solid fa-ellipsis"></i></button>';
        html += '<div class="inspector-custom-menu">';
        html += '<button class="inspector-custom-menu-item" data-action="rename">重命名</button>';
        html += '<button class="inspector-custom-menu-item danger" data-action="delete">删除</button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
    });

    html += '</div>';

    html += '</div>';

    inspectorFields.innerHTML = html;
    inspectorEmpty.hidden = true;
    inspectorFields.hidden = false;

    // 绑定事件
    bindInspectorEvents();
}

/**
 * 获取字段值（处理特殊字段）
 */
function getInspectorFieldValue(marker, fieldDef) {
    if (fieldDef.key === 'typeFullName') {
        const t = getTypeById(marker.typeId);
        return marker.typeFullName || (t && t.fullName) || marker.typeName || '';
    }
    const val = marker[fieldDef.key];
    return (val === undefined || val === null) ? '' : String(val);
}

/**
 * 绑定 Inspector 面板内部事件
 */
function bindInspectorEvents() {
    // Section 折叠/展开
    inspectorFields.querySelectorAll('.inspector-section-header').forEach(hdr => {
        hdr.onclick = function (e) {
            if (e.target.closest('button')) return;
            this.parentElement.classList.toggle('collapsed');
        };
    });

    // 输入框变更标记为 dirty
    inspectorFields.querySelectorAll('.inspector-input:not([disabled])').forEach(input => {
        input.addEventListener('input', () => {
            inspectorDirty = true;
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveInspector();
            }
        });
        input.addEventListener('blur', () => {
            if (inspectorDirty) {
                saveInspector();
            }
        });
    });

    // ---- 自定义属性管理事件 ----

    // ... 菜单按钮
    inspectorFields.querySelectorAll('.inspector-custom-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = btn.nextElementSibling;
            const isOpen = menu.classList.contains('visible');
            // 关闭所有菜单
            inspectorFields.querySelectorAll('.inspector-custom-menu.visible').forEach(m => m.classList.remove('visible'));
            if (!isOpen) menu.classList.add('visible');
        });
    });

    // 菜单项点击
    inspectorFields.querySelectorAll('.inspector-custom-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = item.closest('.inspector-custom-row');
            const key = row ? row.dataset.cattrKey : null;
            const action = item.dataset.action;
            if (!key) return;
            // 关闭所有菜单
            inspectorFields.querySelectorAll('.inspector-custom-menu.visible').forEach(m => m.classList.remove('visible'));
            if (action === 'rename') renameInspectorCustomAttr(key);
            if (action === 'delete') deleteInspectorCustomAttr(key);
        });
    });
}

// 全局点击关闭菜单
document.addEventListener('click', () => {
    if (inspectorFields) {
        inspectorFields.querySelectorAll('.inspector-custom-menu.visible').forEach(m => m.classList.remove('visible'));
    }
});

/**
 * 重命名自定义属性
 * @param {string} key - 属性 key
 */
async function renameInspectorCustomAttr(key) {
    const defs = getCustomAttrDefs();
    const d = defs.find(x => x.key === key);
    if (!d) return;
    const newLabel = await showPromptDialog('重命名属性', d.label, '新属性名');
    if (newLabel === null || newLabel.trim() === '') return;
    const trimmed = newLabel.trim();
    if (trimmed === d.label) return;
    // 重名校验
    if (ALL_MARKER_ATTRIBUTES && ALL_MARKER_ATTRIBUTES.some(a => a.label === trimmed)) {
        showToast('与内置属性重名');
        return;
    }
    if (defs.some(x => x.key !== key && x.label === trimmed)) {
        showToast('属性名已存在');
        return;
    }
    updateCustomAttrDef(key, { label: trimmed });
    showToast('已重命名为「' + trimmed + '」');
    renderInspector();
    scheduleAutosave();
}

/**
 * 删除自定义属性
 * @param {string} key - 属性 key
 */
function deleteInspectorCustomAttr(key) {
    const defs = getCustomAttrDefs();
    const d = defs.find(x => x.key === key);
    if (!d) return;
    if (!confirm('确定删除属性「' + d.label + '」？已填入的值将保留在数据中。')) return;
    removeCustomAttrDef(key);
    showToast('已删除属性「' + d.label + '」');
    renderInspector();
    scheduleAutosave();
    // 若预览已打开，刷新预览表（可能清理了绑定列）
    if (typeof pvRefreshPreview === 'function') pvRefreshPreview();
}

/**
 * 保存 Inspector 面板中的修改到标记对象
 */
function saveInspector() {
    if (!inspectorTarget || !inspectorDirty) return;

    const m = inspectorTarget;
    const updates = [];
    const changes = {};
    const after = {};

    function applyField(fieldKey, newVal) {
        const clean = typeof newVal === 'string' ? newVal.trim() : newVal;
        const finalVal = (clean === '') ? undefined : clean;
        const oldVal = m[fieldKey] !== undefined ? m[fieldKey] : '';
        const oldForCmp = (oldVal === undefined || oldVal === null) ? '' : String(oldVal);
        const newForCmp = (finalVal === undefined || finalVal === null) ? '' : String(finalVal);
        if (oldForCmp !== newForCmp) {
            updates.push({ field: fieldKey, oldValue: oldForCmp, newValue: newForCmp });
            changes[fieldKey] = oldForCmp;
            after[fieldKey] = newForCmp;
            if (finalVal === undefined) {
                delete m[fieldKey];
            } else {
                m[fieldKey] = finalVal;
            }
        }
    }

    // 内置字段
    inspectorFields.querySelectorAll('.inspector-input[data-field]').forEach(input => {
        applyField(input.dataset.field, input.value);
    });

    // 自定义属性
    inspectorFields.querySelectorAll('.inspector-input[data-custom-attr]').forEach(input => {
        const attrKey = input.dataset.customAttr;
        const oldVal = getCustomAttrValue(m, attrKey);
        const newVal = input.value.trim();
        if (oldVal !== newVal) {
            updates.push({ field: 'custom:' + attrKey, oldValue: oldVal, newValue: newVal });
            changes['custom:' + attrKey] = oldVal;
            after['custom:' + attrKey] = newVal;
            setCustomAttrValue(m, attrKey, newVal || undefined);
        }
    });

    if (updates.length > 0) {
        pushHistory({ type: 'bulkUpdate', marker: m, changes, after });
        addLog('Inspector: 修改 ' + updates.length + ' 个字段');
        requestRender();
        scheduleAutosave();
        // 若预览已打开，刷新预览表
        if (typeof pvRefreshPreview === 'function') pvRefreshPreview();
        showToast('已保存属性修改');
    }

    inspectorDirty = false;
}

/**
 * 导航到前一个/后一个标记
 */
function inspectorNavigateTo(delta) {
    if (!inspectorTarget) return;
    const idx = markers.indexOf(inspectorTarget);
    if (idx === -1) return;
    const newIdx = (idx + delta + markers.length) % markers.length;
    openInspector(markers[newIdx]);
}

// ===== 事件绑定 =====
(function initInspector() {
    // 关闭按钮
    document.getElementById('inspectorCloseBtn').addEventListener('click', closeInspector);

    // 标签切换
    document.getElementById('inspectorTabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.inspector-tab');
        if (!tab) return;
        const tabName = tab.dataset.tab;
        if (tabName === inspectorActiveTab) return;
        // 切换前保存当前修改
        if (inspectorDirty && inspectorTarget) saveInspector();
        inspectorActiveTab = tabName;
        renderInspector();
    });

    // Esc 关闭
    inspectorPanel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeInspector();
        }
    });

    // 拖拽调整宽度
    let resizeState = null;
    inspectorPanel.addEventListener('mousedown', (e) => {
        if (e.offsetX <= 4) {
            resizeState = {
                startX: e.clientX,
                startWidth: inspectorPanel.offsetWidth,
            };
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!resizeState) return;
        const dx = resizeState.startX - e.clientX;
        const newWidth = Math.max(240, Math.min(600, resizeState.startWidth + dx));
        inspectorPanel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        resizeState = null;
    });

    // 点击面板外部区域不关闭（Inspector 是停靠面板，不是模态弹窗）
})();