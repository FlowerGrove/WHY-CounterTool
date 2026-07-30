// 从资源库加载默认可见类型（alwaysVisible: true 的项）
// 资源库定义在 assets/instrument-types.js，主窗口只展示常用类型，资源库其他项供自定义匹配调用
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

function getTypeById(id) {
    return markerTypes.find(t => t.id === id) || markerTypes[0];
}

function getCurrentType() {
    return getTypeById(currentTypeId);
}

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

// 删除类型（默认和自定义均可删，至少保留一个）
// - 若有标记使用该类型，提示用户确认（标记数据保留，但会回退到第一个类型的显示）
// - 若删除的是当前选中类型，切回第一个类型
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

    // 若删除的是当前选中类型，切回第一个
    if (currentTypeId === typeId) {
        currentTypeId = markerTypes[0].id;
        nextMarkerNumber = findNextNumberForType(currentTypeId);
        syncNumberInput();
    }

    renderTypeChips();
    updateUI();
    scheduleAutosave();
}

function selectType(typeId) {
    const t = getTypeById(typeId);
    currentTypeId = t.id;
    nextMarkerNumber = findNextNumberForType(t.id);
    syncNumberInput();
    renderTypeChips();
}

function addCustomType() {
    const name = prompt('输入新仪表类型代号（如：PSH、AI、HCV）', '');
    if (!name) return;
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
    selectType(id);
}
