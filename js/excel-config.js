/**
 * excel-config.js - Excel列定义配置，集中管理所有表格的列定义和自定义字段
 * 支持用户自定义选择显示列、自定义字段、自定义属性、自定义表格等
 * 所有配置存储在 localStorage 中
 */

// ===== Excel 列定义配置 =====
// 所有表格的列定义集中管理，支持用户自定义选择显示哪些列
// 存储在 localStorage KEY: 'elecPdfMarkerExcelColumns_v1'

const EXCEL_COLUMNS_KEY = 'elecPdfMarkerExcelColumns_v1';

// ===== 列定义 =====
// 每个列定义字段：
//   key:       唯一标识
//   header:    列头文字
//   width:     Excel 默认列宽
//   getter:    (marker, index) => 单元格值
//   editable:  预览中是否可编辑（对应 marker 字段）
//   field:     marker 上的字段名（editable 时使用）
//   type:      'sn' | 'tagNo' | 'locate' | 'connection' | 'normal' 特殊处理类型

const COLUMN_DEFS = {
  // ===== Detail List =====
  detailList: [
    { key: 'sn',        header: 'S/N',                    width: 6,  type: 'sn',         getter: (m, i) => i + 1 },
    { key: 'locate',    header: '',                       width: 5,  type: 'locate',    getter: () => '' },
    { key: 'tagNo',     header: 'Tag No.',                width: 18, type: 'tagNo',      getter: (m) => formatMarkerLabel(m) },
    { key: 'location',  header: 'Location',               width: 20, editable: true,    field: 'location',  getter: (m) => m.location || '' },
    { key: 'type',      header: 'Instrument Type',        width: 24, editable: true, field: 'typeFullName', getter: (m) => { const t = getTypeById(m.typeId); return m.typeFullName || (t && t.fullName) || m.typeName || ''; } },
    { key: 'connection',header: 'Process Connection',     width: 20, editable: true, field: 'sizeNote', type: 'connection', getter: (m) => buildProcessConnection(m) },
    { key: 'size',      header: 'Size / Calibration Range',width: 24, editable: true,   field: 'range',     getter: (m) => m.range || '' },
    { key: 'service',   header: 'Service',                width: 16, editable: true,    field: 'service',   getter: (m) => m.service || '' },
    { key: 'product',   header: 'Product',                width: 16, editable: true,    field: 'product',   getter: (m) => m.product || '' },
    { key: 'dataSheet', header: 'Data Sheet No.',         width: 20, editable: true,    field: 'dataSheet', getter: (m) => m.dataSheet || '' },
    { key: 'pid',       header: 'P & ID Dwg No.',         width: 20, editable: true,    field: 'pid',       getter: (m) => m.pid || '' },
    { key: 'note',      header: 'Remarks',                width: 20, editable: true,    field: 'note',      getter: (m) => m.note || '' },
    ],
};

// ===== 默认可见列（全选） =====

/**
 * 获取指定工作表的默认列定义（全选所有列）
 * @param {string} sheetName - 工作表名称（detailList）
 * @returns {string[]} 列 key 数组
 */
function getDefaultColumns(sheetName) {
  return COLUMN_DEFS[sheetName] ? COLUMN_DEFS[sheetName].map(c => c.key) : [];
}

// ===== 用户列选择配置 =====
// 结构: { detailList: ['sn','tagNo','location',...] }
let _columnSettings = null;

/**
 * 加载用户列选择配置（从 localStorage 读取，带缓存）
 * 默认全选所有列
 * @returns {Object} 列配置对象 { detailList: [...] }
 */
function loadColumnSettings() {
  if (_columnSettings) return _columnSettings;
  try {
    const raw = localStorage.getItem(EXCEL_COLUMNS_KEY);
    _columnSettings = raw ? JSON.parse(raw) : null;
  } catch {
    _columnSettings = null;
  }
  if (!_columnSettings) {
    // 默认全选
    _columnSettings = {};
    for (const sheet of ['detailList']) {
      _columnSettings[sheet] = getDefaultColumns(sheet);
    }
  }
  return _columnSettings;
}

/**
 * 保存用户列选择配置到 localStorage
 * @param {Object} settings - 列配置对象
 */
function saveColumnSettings(settings) {
  _columnSettings = settings;
  try {
    localStorage.setItem(EXCEL_COLUMNS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

/**
 * 获取某张表启用的列定义列表（按用户配置过滤，自动合并新增列）
 * @param {string} sheetName - 工作表名称
 * @returns {Array} 启用的列定义数组
 */
function getEnabledColumns(sheetName) {
  const defs = COLUMN_DEFS[sheetName];
  if (!defs) return [];
  const settings = loadColumnSettings();
  const enabledKeys = settings[sheetName];
  if (!enabledKeys) return defs;
  // 自动补充定义中存在但配置中缺失的新列（如后续新增的 locate 列）
  const merged = [...enabledKeys];
  for (const col of defs) {
    if (!merged.includes(col.key)) {
      // 新列插入到定义中的原始位置
      const defIdx = defs.indexOf(col);
      let insertIdx = merged.length;
      for (let i = defIdx - 1; i >= 0; i--) {
        const prevIdx = merged.indexOf(defs[i].key);
        if (prevIdx !== -1) { insertIdx = prevIdx + 1; break; }
      }
      if (insertIdx > merged.length) insertIdx = merged.length;
      merged.splice(insertIdx, 0, col.key);
    }
  }
  return merged
    .map(k => defs.find(c => c.key === k))
    .filter(Boolean);
}

/**
 * 获取某张表的 Excel 列定义（保持与原始列数一致的索引映射）
 * @param {string} sheetName - 工作表名称
 * @returns {Array} 列定义数组
 */
function getExcelColumnDefs(sheetName) {
  return getEnabledColumns(sheetName);
}



/**
 * 获取包含自定义属性的完整列定义（内置 + 自定义属性）
 * @param {string} sheetName - 工作表名称
 * @returns {Array} 完整列定义数组
 */
function getSheetColumnsWithCustom(sheetName) {
  const base = getEnabledColumns(sheetName);
  const bound = getBoundColumnDefs();
  return [...base, ...bound];
}

// ===== 工具函数：获取列的实际索引（Excel 列号） =====
/**
 * 获取指定列的实际索引（1-based Excel 列号）
 * @param {string} sheetName - 工作表名称
 * @param {string} key - 列 key
 * @returns {number} 列索引（1-based），未找到返回 -1
 */
function getColumnIndex(sheetName, key) {
  const cols = getEnabledColumns(sheetName);
  const idx = cols.findIndex(c => c.key === key);
  return idx >= 0 ? idx + 1 : -1;
}

// ===== 自定义 marker 属性 =====
// 用户可定义新的 marker 属性名，在右键菜单中编辑，也可作为自定义列的绑定字段
// 存储结构: [{ key, label, description, enabled }]
const CUSTOM_ATTRS_KEY = 'elecPdfMarkerCustomAttrs_v1';

let _customAttrDefs = null;

/**
 * 获取自定义 marker 属性定义列表（从 localStorage 读取，带缓存）
 * @returns {Array<{key: string, label: string, description: string, enabled: boolean}>}
 */
function getCustomAttrDefs() {
  if (_customAttrDefs) return _customAttrDefs;
  try {
    const raw = localStorage.getItem(CUSTOM_ATTRS_KEY);
    _customAttrDefs = raw ? JSON.parse(raw) : [];
  } catch {
    _customAttrDefs = [];
  }
  // 兼容旧数据：无 enabled 字段默认 true
  _customAttrDefs.forEach(d => { if (d.enabled === undefined) d.enabled = true; });
  return _customAttrDefs;
}

/**
 * 保存自定义 marker 属性定义到 localStorage
 * @param {Array} defs - 属性定义数组
 */
function saveCustomAttrDefs(defs) {
  _customAttrDefs = defs;
  try {
    localStorage.setItem(CUSTOM_ATTRS_KEY, JSON.stringify(defs));
  } catch { /* ignore */ }
}

/**
 * 添加自定义 marker 属性定义
 * @param {string} label - 属性标签
 * @param {string} description - 属性描述
 * @returns {string} 新属性的唯一 key
 */
function addCustomAttrDef(label, description) {
  const defs = getCustomAttrDefs();
  const key = 'ca_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  defs.push({ key, label, description: description || '', enabled: true });
  saveCustomAttrDefs(defs);
  addLog('添加自定义属性: ' + label);
  return key;
}

/**
 * 更新自定义 marker 属性定义
 * @param {string} key - 属性唯一 key
 * @param {Object} updates - 要更新的字段
 */
function updateCustomAttrDef(key, updates) {
  const defs = getCustomAttrDefs();
  const idx = defs.findIndex(d => d.key === key);
  if (idx === -1) return;
  Object.assign(defs[idx], updates);
  saveCustomAttrDefs(defs);
}

/**
 * 删除自定义 marker 属性定义
 * @param {string} key - 属性唯一 key
 */
function removeCustomAttrDef(key) {
  const defs = getCustomAttrDefs().filter(d => d.key !== key);
  saveCustomAttrDefs(defs);
  // 清理引用该属性的列绑定
  const bindings = getColumnBindings().filter(b => b.bindField !== key);
  if (bindings.length !== getColumnBindings().length) {
    saveColumnBindings(bindings);
    _columnBindings = bindings;
    addLog('清理绑定列: ' + key);
  }
  addLog('删除自定义属性: ' + key);
}

/**
 * 获取 marker 上的自定义属性值
 * @param {Object} marker - 标记对象
 * @param {string} attrKey - 属性 key
 * @returns {string} 属性值
 */
function getCustomAttrValue(marker, attrKey) {
  if (!marker.customAttrs) return '';
  const v = marker.customAttrs[attrKey];
  return (v === undefined || v === null) ? '' : String(v);
}

/**
 * 设置 marker 上的自定义属性值
 * @param {Object} marker - 标记对象
 * @param {string} attrKey - 属性 key
 * @param {string} value - 属性值
 */
function setCustomAttrValue(marker, attrKey, value) {
  if (!marker.customAttrs) marker.customAttrs = {};
  if (value === '' || value === null || value === undefined) {
    delete marker.customAttrs[attrKey];
  } else {
    marker.customAttrs[attrKey] = String(value);
  }
}

/**
 * 获取所有可用于列绑定的字段（内置 + 已启用的自定义属性）
 * @returns {Array<{key: string, label: string}>}
 */
function getAllBindableFields() {
  const custom = getCustomAttrDefs()
    .filter(d => d.enabled !== false)
    .map(d => ({ key: d.key, label: d.label + ' (自定义)' }));
  return [...MARKER_FIELD_OPTIONS, ...custom];
}

/**
 * 获取已启用的自定义属性对应的列定义
 * @returns {Array} 自定义属性列定义数组
 */
function getCustomAttrColumns() {
  return getCustomAttrDefs()
    .filter(d => d.enabled !== false)
    .map(d => ({
      key: d.key,
      header: d.label,
      width: 16,
      editable: true,
      field: d.key,
      isCustomAttr: true,
      getter: (m) => getCustomAttrValue(m, d.key),
    }));
}

// ===== 内置属性启用/隐藏状态 =====
// 存储结构: { tagNumber: { enabled: true, hidden: false }, ... }
// enabled: 是否在右键菜单中显示该字段
// hidden:  是否在属性列表中隐藏（用户点击"删除"后隐藏）
const BUILTIN_ATTR_STATE_KEY = 'elecPdfMarkerBuiltinAttrState_v1';

let _builtinAttrState = null;

/**
 * 获取内置属性状态（从 localStorage 读取，带缓存）
 * @returns {Object} 属性状态对象 { key: { enabled: boolean, hidden: boolean } }
 */
function getBuiltinAttrState() {
  if (_builtinAttrState) return _builtinAttrState;
  try {
    const raw = localStorage.getItem(BUILTIN_ATTR_STATE_KEY);
    _builtinAttrState = raw ? JSON.parse(raw) : {};
  } catch {
    _builtinAttrState = {};
  }
  return _builtinAttrState;
}

/**
 * 保存内置属性状态到 localStorage
 * @param {Object} state - 属性状态对象
 */
function saveBuiltinAttrState(state) {
  _builtinAttrState = state;
  try {
    localStorage.setItem(BUILTIN_ATTR_STATE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

/**
 * 判断内置属性是否启用，默认 true
 * @param {string} key - 属性 key
 * @returns {boolean}
 */
function isBuiltinAttrEnabled(key) {
  const state = getBuiltinAttrState();
  const s = state[key];
  if (!s) return true;
  return s.enabled !== false;
}

/**
 * 判断内置属性是否隐藏，默认 false
 * @param {string} key - 属性 key
 * @returns {boolean}
 */
function isBuiltinAttrHidden(key) {
  const state = getBuiltinAttrState();
  const s = state[key];
  if (!s) return false;
  return s.hidden === true;
}

/**
 * 更新单个内置属性状态
 * @param {string} key - 属性 key
 * @param {Object} updates - 要更新的字段 { enabled, hidden }
 */
function updateBuiltinAttrState(key, updates) {
  const state = getBuiltinAttrState();
  if (!state[key]) state[key] = {};
  Object.assign(state[key], updates);
  saveBuiltinAttrState(state);
}

/**
 * 恢复所有隐藏的内置属性
 */
function restoreAllBuiltinAttrs() {
  const state = getBuiltinAttrState();
  for (const k of Object.keys(state)) {
    state[k].hidden = false;
  }
  saveBuiltinAttrState(state);
}

/**
 * 获取可见的内置属性列表（排除隐藏的）
 * @returns {Array} 属性定义数组
 */
function getVisibleBuiltinAttrs() {
  return ALL_MARKER_ATTRIBUTES.filter(a => !isBuiltinAttrHidden(a.key));
}

/**
 * 是否有隐藏的内置属性
 * @returns {boolean}
 */
function hasHiddenBuiltinAttrs() {
  return ALL_MARKER_ATTRIBUTES.some(a => isBuiltinAttrHidden(a.key));
}

// ===== 自定义表格数据存储 =====
// 用户可在预览窗口创建自定义表格，每个表格有名称和字段列表
// 存储结构: [{ id, name, columns: [{ key, label, bindField }] }]
const CUSTOM_TABLES_KEY = 'elecPdfMarkerCustomTables_v1';

let _customTables = null;

/**
 * 获取自定义表格列表（从 localStorage 读取，带缓存）
 * @returns {Array<{id: string, name: string, columns: Array}>}
 */
function getCustomTables() {
  if (_customTables) return _customTables;
  try {
    _customTables = JSON.parse(localStorage.getItem(CUSTOM_TABLES_KEY)) || [];
  } catch { _customTables = []; }
  return _customTables;
}

/**
 * 保存自定义表格列表到 localStorage
 * @param {Array} tables - 表格数组
 */
function saveCustomTables(tables) {
  _customTables = tables;
  try { localStorage.setItem(CUSTOM_TABLES_KEY, JSON.stringify(tables)); } catch {}
}

/**
 * 添加自定义表格
 * @param {string} name - 表格名称
 * @param {Array} columns - 列定义数组
 * @returns {string} 新表格的唯一 id
 */
function addCustomTable(name, columns) {
  const tables = getCustomTables();
  const id = 'ct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  tables.push({ id, name, columns });
  saveCustomTables(tables);
  addLog('添加自定义表格: ' + name);
  return id;
}

/**
 * 删除自定义表格
 * @param {string} id - 表格唯一 id
 */
function removeCustomTable(id) {
  const tables = getCustomTables().filter(t => t.id !== id);
  saveCustomTables(tables);
  addLog('删除自定义表格: ' + id);
}

// ===== 内置属性定义（供 Inspector 和属性管理使用） =====
const ALL_MARKER_ATTRIBUTES = [
    { key: 'tagNumber',  label: 'Tag No.',                group: '标识', desc: '仪表编号' },
    { key: 'location',   label: 'Location',               group: '标识', desc: '位置' },
    { key: 'typeFullName', label: 'Instrument Type',      group: '标识', desc: '仪表类型' },
    { key: 'sizeNote',   label: 'Process Connection',     group: '规格', desc: '过程连接' },
    { key: 'range',      label: 'Size / Cal. Range',      group: '规格', desc: '尺寸/量程' },
    { key: 'service',    label: 'Service',                group: '规格', desc: '服务' },
    { key: 'product',    label: 'Product',                group: '规格', desc: '产品' },
    { key: 'dataSheet',  label: 'Data Sheet No.',         group: '文档', desc: '数据表编号' },
    { key: 'pid',        label: 'P & ID Dwg No.',         group: '文档', desc: 'P&ID 图纸号' },
    { key: 'note',       label: 'Remarks',                group: '文档', desc: '备注' },
];

const MARKER_FIELD_OPTIONS = ALL_MARKER_ATTRIBUTES.map(a => ({ key: a.key, label: a.label }));

// ===== 列绑定配置 =====
// 用户在预览表中手动绑定的列，将仪表属性值映射到自定义列
// 存储结构: [{ id, name, bindField }]
const COLUMN_BINDINGS_KEY = 'elecPdfMarkerColumnBindings_v1';

let _columnBindings = null;

/**
 * 获取列绑定列表（从 localStorage 读取，带缓存）
 * @returns {Array<{id: string, name: string, bindField: string}>}
 */
function getColumnBindings() {
    if (_columnBindings) return _columnBindings;
    try {
        _columnBindings = JSON.parse(localStorage.getItem(COLUMN_BINDINGS_KEY)) || [];
    } catch { _columnBindings = []; }
    return _columnBindings;
}

/**
 * 保存列绑定列表到 localStorage
 * @param {Array} bindings - 绑定数组
 */
function saveColumnBindings(bindings) {
    _columnBindings = bindings;
    try { localStorage.setItem(COLUMN_BINDINGS_KEY, JSON.stringify(bindings)); } catch {}
}

/**
 * 添加列绑定
 * @param {string} name - 列名
 * @param {string} bindField - 绑定的属性字段 key
 * @returns {string} 新绑定的唯一 id
 */
function addColumnBinding(name, bindField) {
    const bindings = getColumnBindings();
    const id = 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    bindings.push({ id, name, bindField });
    saveColumnBindings(bindings);
    addLog('添加列绑定: ' + name + ' → ' + bindField);
    return id;
}

/**
 * 删除列绑定
 * @param {string} id - 绑定唯一 id
 */
function removeColumnBinding(id) {
    const bindings = getColumnBindings().filter(b => b.id !== id);
    saveColumnBindings(bindings);
    addLog('删除列绑定: ' + id);
}

/**
 * 更新列绑定
 * @param {string} id - 绑定唯一 id
 * @param {Object} updates - 要更新的字段 { name, bindField }
 */
function updateColumnBinding(id, updates) {
    const bindings = getColumnBindings();
    const idx = bindings.findIndex(b => b.id === id);
    if (idx === -1) return;
    Object.assign(bindings[idx], updates);
    saveColumnBindings(bindings);
}

/**
 * 获取绑定的列定义（用于预览表渲染）
 * @returns {Array} 绑定列定义数组
 */
function getBoundColumnDefs() {
    return getColumnBindings().map(b => {
        const isCustomAttr = b.bindField && b.bindField.startsWith('ca_');
        return {
            key: 'bound_' + b.id,
            header: b.name,
            width: 16,
            editable: true,
            field: b.bindField,
            isCustomAttr: isCustomAttr,
            isBound: true,
            bindingId: b.id,
            getter: (m) => {
                if (!b.bindField) return '';
                if (isCustomAttr) return getCustomAttrValue(m, b.bindField);
                const v = m[b.bindField];
                return (v !== undefined && v !== null) ? String(v) : '';
            },
        };
    });
}