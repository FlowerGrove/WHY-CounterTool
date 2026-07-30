const DEFAULT_TYPES = [
    { id: 'pi',  name: 'PI',  fullName: 'Pressure Indicator',              color: '#e53935', abbr: 'PI',  code: 'PI' },
    { id: 'pt',  name: 'PT',  fullName: 'Pressure Transmitter',            color: '#e53935', abbr: 'PT',  code: 'PT' },
    { id: 'pit', name: 'PIT', fullName: 'Pressure Indicating Transmitter', color: '#e53935', abbr: 'PIT', code: 'PIT' },
    { id: 'ti',  name: 'TI',  fullName: 'Temperature Indicator',           color: '#e53935', abbr: 'TI',  code: 'TI' },
    { id: 'tt',  name: 'TT',  fullName: 'Temperature Transmitter',         color: '#e53935', abbr: 'TT',  code: 'TT' },
    { id: 'tit', name: 'TIT', fullName: 'Temperature Indicating Transmitter', color: '#e53935', abbr: 'TIT', code: 'TIT' },
    { id: 'fi',  name: 'FI',  fullName: 'Flow Indicator',                  color: '#e53935', abbr: 'FI',  code: 'FI' },
    { id: 'ft',  name: 'FT',  fullName: 'Flow Transmitter',                color: '#e53935', abbr: 'FT',  code: 'FT' },
    { id: 'fit', name: 'FIT', fullName: 'Flow Indicating Transmitter',     color: '#e53935', abbr: 'FIT', code: 'FIT' },
    { id: 'li',  name: 'LI',  fullName: 'Level Indicator',                 color: '#e53935', abbr: 'LI',  code: 'LI' },
    { id: 'lt',  name: 'LT',  fullName: 'Level Transmitter',               color: '#e53935', abbr: 'LT',  code: 'LT' },
    { id: 'lit', name: 'LIT', fullName: 'Level Indicating Transmitter',    color: '#e53935', abbr: 'LIT', code: 'LIT' },
    { id: 'pdi', name: 'PDI', fullName: 'Differential Pressure Indicator', color: '#e53935', abbr: 'PDI', code: 'PDI' },
    { id: 'pdt', name: 'PDT', fullName: 'Differential Pressure Transmitter', color: '#e53935', abbr: 'PDT', code: 'PDT' },
    { id: 'other', name: '其他', fullName: 'Other Instrument', color: '#e53935', abbr: 'X', code: 'X' },
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
    }
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
    const color = '#e53935';
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