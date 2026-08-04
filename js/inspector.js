/**
 * inspector.js - Inspector 属性面板模块
 * 类似 Unity/Godot 的 Inspector，停靠在屏幕右侧，显示选中标记的完整属性
 * 打开方式：右键标记 → 属性 / 左键点击标记 + Ctrl+1
 */

// ===== 状态 =====
let inspectorTarget = null;  // 当前选中的标记对象
let inspectorDirty = false;  // 是否有未保存的修改

// ===== DOM 引用 =====
const inspectorPanel = document.getElementById('inspectorPanel');
const inspectorIcon = document.getElementById('inspectorIcon');
const inspectorTitle = document.getElementById('inspectorTitle');
const inspectorBody = document.getElementById('inspectorBody');
const inspectorEmpty = document.getElementById('inspectorEmpty');
const inspectorFields = document.getElementById('inspectorFields');
const inspectorFooter = document.getElementById('inspectorFooter');
const inspectorNavInfo = document.getElementById('inspectorNavInfo');

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
 * 根据当前 inspectorTarget 填充所有字段
 */
function renderInspector() {
    if (!inspectorTarget) {
        inspectorEmpty.hidden = false;
        inspectorFields.hidden = true;
        inspectorFooter.hidden = true;
        return;
    }

    const m = inspectorTarget;
    const t = getTypeById(m.typeId);

    // Header
    const color = m.color || t.color || '#e53935';
    inspectorIcon.style.background = color;
    inspectorIcon.textContent = m.typeAbbr || t.abbr || '';
    inspectorTitle.textContent = formatMarkerLabel(m);

    // Body: 按 section 分组渲染
    const sections = {};
    INSPECTOR_BUILTIN_FIELDS.forEach(f => {
        if (!sections[f.section]) sections[f.section] = [];
        sections[f.section].push(f);
    });

    let html = '';

    for (const [sectionName, fields] of Object.entries(sections)) {
        html += '<div class="inspector-section">';
        html += '<div class="inspector-section-header" data-section="' + pvEscape(sectionName) + '">';
        html += '<span class="inspector-section-arrow"><i class="fa-solid fa-chevron-down"></i></span>';
        html += '<span>' + pvEscape(sectionName) + '</span>';
        html += '</div>';
        html += '<div class="inspector-section-body">';

        fields.forEach(f => {
            const val = getInspectorFieldValue(m, f);
            html += '<div class="inspector-field">';
            html += '<label class="inspector-label">' + pvEscape(f.label) + '</label>';
            if (f.readonly) {
                html += '<input type="text" class="inspector-input" value="' + pvEscape(val) + '" disabled />';
            } else {
                html += '<input type="text" class="inspector-input" data-field="' + f.key + '" value="' + pvEscape(val) + '" placeholder="-" />';
            }
            html += '</div>';
        });

        html += '</div></div>';
    }

    // 自定义属性 section
    const customDefs = getCustomAttrDefs().filter(d => d.enabled !== false);
    if (customDefs.length > 0) {
        html += '<div class="inspector-section">';
        html += '<div class="inspector-section-header" data-section="custom">';
        html += '<span class="inspector-section-arrow"><i class="fa-solid fa-chevron-down"></i></span>';
        html += '<span>Custom Attributes</span>';
        html += '</div>';
        html += '<div class="inspector-section-body">';

        customDefs.forEach(d => {
            const val = getCustomAttrValue(m, d.key);
            html += '<div class="inspector-field">';
            html += '<label class="inspector-label">' + pvEscape(d.label) + '</label>';
            html += '<input type="text" class="inspector-input" data-custom-attr="' + d.key + '" value="' + pvEscape(val) + '" placeholder="-" />';
            html += '</div>';
        });

        html += '</div></div>';
    }

    inspectorFields.innerHTML = html;
    inspectorEmpty.hidden = true;
    inspectorFields.hidden = false;
    inspectorFooter.hidden = false;

    // 导航信息
    const idx = markers.indexOf(m);
    inspectorNavInfo.textContent = (idx + 1) + ' / ' + markers.length;

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
        hdr.onclick = function () {
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
        // 失去焦点时自动保存
        input.addEventListener('blur', () => {
            if (inspectorDirty) {
                saveInspector();
            }
        });
    });
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

/**
 * 删除当前 Inspector 中的标记
 */
function inspectorDeleteCurrent() {
    if (!inspectorTarget) return;
    const m = inspectorTarget;
    const label = formatMarkerLabel(m);
    if (!confirm('确定删除标记「' + label + '」？')) return;
    closeInspector();
    deleteMarker(m);
    showToast('已删除标记「' + label + '」');
}

// ===== 事件绑定 =====
(function initInspector() {
    // 关闭按钮
    document.getElementById('inspectorCloseBtn').addEventListener('click', closeInspector);

    // 上一个/下一个（header 按钮）
    document.getElementById('inspectorPrevBtn').addEventListener('click', () => inspectorNavigateTo(-1));
    document.getElementById('inspectorNextBtn').addEventListener('click', () => inspectorNavigateTo(1));

    // 上一个/下一个（footer 按钮）
    document.getElementById('inspectorFooterPrev').addEventListener('click', () => inspectorNavigateTo(-1));
    document.getElementById('inspectorFooterNext').addEventListener('click', () => inspectorNavigateTo(1));

    // 删除按钮
    document.getElementById('inspectorDeleteBtn').addEventListener('click', inspectorDeleteCurrent);

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