const DEFAULT_TYPES = [
    { id: 'pi',  name: 'PI',  fullName: '压力指示',     color: '#1565c0', abbr: 'PI',  code: 'PI' },
    { id: 'pt',  name: 'PT',  fullName: '压力变送',     color: '#0277bd', abbr: 'PT',  code: 'PT' },
    { id: 'pit', name: 'PIT', fullName: '压力指示变送', color: '#0288d1', abbr: 'PIT', code: 'PIT' },
    { id: 'ti',  name: 'TI',  fullName: '温度指示',     color: '#ef6c00', abbr: 'TI',  code: 'TI' },
    { id: 'tt',  name: 'TT',  fullName: '温度变送',     color: '#f57c00', abbr: 'TT',  code: 'TT' },
    { id: 'tit', name: 'TIT', fullName: '温度指示变送', color: '#fb8c00', abbr: 'TIT', code: 'TIT' },
    { id: 'fi',  name: 'FI',  fullName: '流量指示',     color: '#2e7d32', abbr: 'FI',  code: 'FI' },
    { id: 'ft',  name: 'FT',  fullName: '流量变送',     color: '#388e3c', abbr: 'FT',  code: 'FT' },
    { id: 'fit', name: 'FIT', fullName: '流量指示变送', color: '#43a047', abbr: 'FIT', code: 'FIT' },
    { id: 'li',  name: 'LI',  fullName: '液位指示',     color: '#6a1b9a', abbr: 'LI',  code: 'LI' },
    { id: 'lt',  name: 'LT',  fullName: '液位变送',     color: '#7b1fa2', abbr: 'LT',  code: 'LT' },
    { id: 'lit', name: 'LIT', fullName: '液位指示变送', color: '#8e24aa', abbr: 'LIT', code: 'LIT' },
    { id: 'pdi', name: 'PDI', fullName: '差压指示',   color: '#00838f', abbr: 'PDI', code: 'PDI' },
    { id: 'pdt', name: 'PDT', fullName: '差压变送',   color: '#00695c', abbr: 'PDT', code: 'PDT' },
    { id: 'other', name: '其他', fullName: '其他仪表', color: '#e53935', abbr: 'X', code: 'X' },
];

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
        btn.textContent = t.name;
        btn.style.borderColor = t.color;
        if (t.id === currentTypeId) {
            btn.style.background = t.color;
            btn.style.color = '#fff';
        } else {
            btn.style.color = t.color;
            btn.style.background = t.color + '18';
        }
        btn.title = t.fullName ? `${t.name} · ${t.fullName}` : `${t.name}（点击选择）`;
        btn.addEventListener('click', () => selectType(t.id));
        typeChipsEl.appendChild(btn);
    }
}

function selectType(typeId) {
    const t = getTypeById(typeId);
    currentTypeId = t.id;
    currentColor = t.color;
    colorPicker.value = t.color;
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
    const colors = ['#00838f', '#ad1457', '#4527a0', '#558b2f', '#bf360c', '#37474f'];
    const color = colors[markerTypes.length % colors.length];
    const id = 'custom_' + Date.now();
    const usedCodes = new Set(markerTypes.map(t => t.code));
    let code = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'A';
    if (usedCodes.has(code)) {
        for (let i = 0; i < 26; i++) {
            const c = String.fromCharCode(65 + i);
            if (!usedCodes.has(c)) { code = c; break; }
        }
    }
    markerTypes.push({
        id,
        name: trimmed,
        fullName: trimmed,
        color,
        abbr: code,
        code,
    });
    selectType(id);
}