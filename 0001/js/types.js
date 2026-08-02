/**
 * types.js - 仪表类型管理
 * 管理标记类型（仪表类型）的创建、删除、切换，
 * 以及 IO List 导出类型选择弹窗
 */

/**
 * 从资源库加载默认可见类型
 * 资源库定义在 assets/instrument-types.js，主窗口只展示常用类型
 * @returns {Array<{id: string, name: string, fullName: string, color: string, abbr: string, code: string}>} 默认类型列表
 */
function buildDefaultTypes() {
    const list = (window.INSTRUMENT_RESOURCES && Array.isArray(window.INSTRUMENT_RESOURCES.INSTRUMENT_TYPES))
        ? window.INSTRUMENT_RESOURCES.INSTRUMENT_TYPES
        : [];
    return list
        .filter(t => t.alwaysVisible)
        .map(t => ({
            id: t.abbr.toLowerCase(),
            name: t.abbr,
            fullName: t.fullName,
            color: t.color,
            abbr: t.abbr,
            code: t.abbr,
        }));
}

const DEFAULT_TYPES = buildDefaultTypes();

let markerTypes = DEFAULT_TYPES.map(t => ({ ...t }));
let currentTypeId = markerTypes[0].id;

/**
 * 根据 ID 查找类型
 * @param {string} id - 类型 ID
 * @returns {Object} 类型对象，未找到时返回第一个类型
 */
function getTypeById(id) {
    return markerTypes.find(t => t.id === id) || markerTypes[0];
}

/**
 * 获取当前选中类型
 * @returns {Object} 当前类型对象
 */
function getCurrentType() {
    return getTypeById(currentTypeId);
}

/**
 * 渲染类型选择器 chip 按钮列表
 * 自定义类型标记为 type-chip--custom 类，支持删除
 */
function renderTypeChips() {
    typeChipsEl.innerHTML = '';
    for (const t of markerTypes) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'type-chip' + (t.id === currentTypeId ? ' active' : '');
        // 自定义类型标记，便于 CSS 显示删除按钮
        if (t.id.startsWith('custom_')) btn.classList.add('type-chip--custom');

        // Color dot via CSS custom property
        btn.style.setProperty('--chip-color', t.color);

        if (t.id === currentTypeId) {
            btn.style.background = t.color;
            btn.style.color = '#fff';
        } else {
            btn.style.color = t.color;
            btn.style.background = t.color + '10';
        }

        // Inner structure: code only (no fullName comment)
        const label = document.createElement('span');
        label.className = 'type-chip__label';

        const code = document.createElement('span');
        code.className = 'type-chip__code';
        code.textContent = t.name;

        label.appendChild(code);
        btn.appendChild(label);

        btn.title = t.fullName ? `${t.name} · ${t.fullName}` : `${t.name}（点击选择）`;
        btn.addEventListener('click', () => selectType(t.id));
        typeChipsEl.appendChild(btn);

        // 所有类型都可删除，但至少保留一个
        if (markerTypes.length > 1) {
            const delBtn = document.createElement('span');
            delBtn.className = 'type-chip__delete';
            delBtn.innerHTML = '&times;';
            delBtn.title = '删除此类型';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                deleteType(t.id);
            });
            btn.appendChild(delBtn);
        }
    }
}

/**
 * 删除指定类型（默认和自定义均可删，至少保留一个）
 * - 若有标记使用该类型，提示用户确认（标记数据保留，但会回退到第一个类型的显示）
 * - 若删除的是当前选中类型，切回第一个类型
 * @param {string} typeId - 要删除的类型 ID
 */
function deleteType(typeId) {
    if (!typeId) return;
    if (markerTypes.length <= 1) {
        alert('至少需要保留一个类型');
        return;
    }
    const idx = markerTypes.findIndex(t => t.id === typeId);
    if (idx === -1) return;
    const t = markerTypes[idx];

    // 检查是否有标记使用该类型
    const usedCount = markers.filter(m => m.typeId === typeId).length;
    const msg = usedCount > 0
        ? `类型「${t.name}」已被 ${usedCount} 个标记使用，删除后这些标记将保留但类型显示会改变。确定删除？`
        : `确定删除类型「${t.name}」？`;
    if (!confirm(msg)) return;

    markerTypes.splice(idx, 1);

    // 同步清理 IO List 选择集合，避免残留已删除类型的 id
    if (ioListSelectedIds !== null) {
        ioListSelectedIds.delete(typeId);
    }

    // 若删除的是当前选中类型，切回第一个
    if (currentTypeId === typeId) {
        currentTypeId = markerTypes[0].id;
        manualNumberSet = false;
        nextMarkerNumber = findNextNumber();
        syncNumberInput();
    }

    addLog('删除类型: ' + t.name);
    renderTypeChips();
    updateUI();
    scheduleAutosave();
}

/**
 * 切换当前选中类型
 * 切换后重置手动编号标志并重新查找可用编号
 * @param {string} typeId - 要切换到的类型 ID
 */
function selectType(typeId) {
    const t = getTypeById(typeId);
    currentTypeId = t.id;
    manualNumberSet = false;
    nextMarkerNumber = findNextNumber();
    syncNumberInput();
    addLog('切换类型: ' + t.name);
    renderTypeChips();
}

/**
 * 将中文引号统一转为英文引号（自定义类型强制使用英文符号）
 * @param {string} s - 输入字符串
 * @returns {string} 规范化后的字符串
 */
function normalizeQuotes(s) {
    return String(s == null ? '' : s)
        .replace(/[\u201C\u201D]/g, '"')   // “ ” → "
        .replace(/[\u2018\u2019]/g, "'");  // ‘ ’ → '
}

/**
 * 添加自定义仪表类型
 * 通过弹窗输入类型代号，自动匹配资源库获取标准名称和颜色
 * 支持中文引号自动转英文、代码去重
 */
async function addCustomType() {
    const name = await showPromptDialog('输入新仪表类型代号', '', '如：PSH、AI、HCV');
    if (!name) return;
    // 自定义类型强制英文符号：中文双引号/单引号 → 英文
    name = normalizeQuotes(name);
    const trimmed = name.trim().slice(0, 12);
    if (!trimmed) return;
    if (markerTypes.some(t => t.name === trimmed)) {
        alert('该类型已存在');
        return;
    }
    const code = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'A';

    // 优先资源库覆盖：代号精确匹配资源库时，自动使用资源库的标准代号、英文全称和颜色
    const res = window.INSTRUMENT_RESOURCES ? window.INSTRUMENT_RESOURCES.findInstrumentByAbbr(code) : null;
    const color = (res && res.color) ? res.color : '#e53935';
    const fullName = (res && res.fullName) ? res.fullName : trimmed;
    // 匹配资源库时 name/abbr 都用资源库的标准代号（解决用户输入小写 pg→显示 PG 的问题）
    const displayName = (res && res.abbr) ? res.abbr : trimmed;
    const abbr = (res && res.abbr) ? res.abbr : code;

    // code 去重：若与已有类型冲突，追加后缀
    const usedCodes = new Set(markerTypes.map(t => t.code));
    let finalCode = abbr;
    if (usedCodes.has(finalCode)) {
        for (let i = 1; i < 100; i++) {
            if (!usedCodes.has(finalCode + i)) { finalCode = finalCode + i; break; }
        }
    }

    const id = 'custom_' + Date.now();
    markerTypes.push({
        id,
        name: displayName,
        fullName,
        color,
        abbr,
        code: finalCode,
    });
    addLog('添加自定义类型: ' + displayName);
    selectType(id);
}

// ===== IO List 类型选择 =====
// null = 全部导出；Set = 仅导出集合中的类型
// 默认仅勾选 PI / TI / FI / LI 进入 IO List
let ioListSelectedIds = (() => {
    const targetAbbrs = new Set(['PI', 'TI', 'FI', 'LI']);
    const selected = new Set();
    for (const t of markerTypes) {
        if (targetAbbrs.has(t.abbr)) selected.add(t.id);
    }
    return selected;
})();

/**
 * 判断某类型是否被勾选导出到 IO List
 * @param {string} typeId - 类型 ID
 * @returns {boolean} 是否在 IO List 导出范围内
 */
function isTypeInIOList(typeId) {
    if (ioListSelectedIds === null) return true;
    return ioListSelectedIds.has(typeId);
}

/**
 * 打开 IO List 类型选择弹窗
 * 支持全选/清空/单个勾选，关闭时自动保存选择结果
 */
function openIOSelectModal() {
    addLog('打开IO List类型选择');
    const modal = document.getElementById('ioSelectModal');
    const listEl = document.getElementById('ioSelectList');

    // 临时集合：null = 全选，Set = 显式选定
    let temp = ioListSelectedIds === null ? null : new Set(ioListSelectedIds);
    // 未勾选项默认折叠
    let uncheckedCollapsed = true;

    function isChecked(id) {
        return temp === null || temp.has(id);
    }

    // 创建单个 io-select-item 元素
    function createItem(t) {
        const item = document.createElement('div');
        item.className = 'io-select-item' + (isChecked(t.id) ? ' io-select-item--checked' : '');
        item.innerHTML = `
            <div class="io-select-item__checkbox"></div>
            <span class="io-select-item__code">${t.name}</span>
            <span class="io-select-item__name">${t.fullName || ''}</span>
        `;
        item.addEventListener('click', () => {
            if (temp === null) {
                // 当前全选 → 切换为显式集合（排除点击项）
                temp = new Set();
                for (const mt of markerTypes) {
                    if (mt.id !== t.id) temp.add(mt.id);
                }
            } else if (temp.has(t.id)) {
                // 取消勾选：空集合 = 什么都不导出，与"清空"按钮一致
                temp.delete(t.id);
            } else {
                temp.add(t.id);
            }
            renderList();
        });
        return item;
    }

    function renderList() {
        listEl.innerHTML = '';

        // 分组：已勾选的常驻，未勾选的折叠
        const checkedTypes = [];
        const uncheckedTypes = [];
        for (const t of markerTypes) {
            if (isChecked(t.id)) checkedTypes.push(t);
            else uncheckedTypes.push(t);
        }

        // 渲染已勾选项
        for (const t of checkedTypes) {
            listEl.appendChild(createItem(t));
        }

        // 渲染未勾选项的折叠区
        if (uncheckedTypes.length > 0) {
            const toggle = document.createElement('div');
            toggle.className = 'io-select-toggle';
            toggle.innerHTML = `
                <i class="fa-solid fa-chevron-${uncheckedCollapsed ? 'right' : 'down'}"></i>
                <span>${uncheckedCollapsed ? '展开' : '折叠'}未勾选 (${uncheckedTypes.length})</span>
            `;
            toggle.addEventListener('click', () => {
                uncheckedCollapsed = !uncheckedCollapsed;
                renderList();
            });
            listEl.appendChild(toggle);

            if (!uncheckedCollapsed) {
                for (const t of uncheckedTypes) {
                    listEl.appendChild(createItem(t));
                }
            }
        }
    }

    renderList();

    // 全选 = null
    document.getElementById('ioSelectAll').onclick = () => {
        temp = null;
        renderList();
    };
    // 清空 = 空集合（不导出任何类型）
    document.getElementById('ioSelectNone').onclick = () => {
        temp = new Set();
        renderList();
    };

    // 关闭即保存：弹窗无"取消"按钮，叉号/遮罩/确定均视为确认当前选择
    function commitAndClose() {
        ioListSelectedIds = temp;
        modal.hidden = true;
        scheduleAutosave();
    }
    document.getElementById('ioSelectClose').onclick = commitAndClose;
    document.querySelector('.io-select-modal__backdrop').onclick = commitAndClose;
    document.getElementById('ioSelectConfirm').onclick = commitAndClose;

    modal.hidden = false;
}
