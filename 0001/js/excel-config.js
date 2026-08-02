// ===== Excel 列定义配置 =====
// 所有表格的列定义集中管理，支持用户自定义选择显示哪些列
// 存储在 localStorage KEY: 'elecPdfMarkerExcelColumns_v1'

const EXCEL_COLUMNS_KEY = 'elecPdfMarkerExcelColumns_v1';

// ===== 列定义 =====
// 每个列定义字段：
//   key:       唯一标识
//   header:    列头文字
//   header2:   IO List 第二行头文字（可选）
//   colSpan:   分组合并列数（IO List 用，如 Alarm Setting 跨 4 列）
//   width:     Excel 默认列宽
//   getter:    (marker, index) => 单元格值
//   editable:  预览中是否可编辑（对应 marker 字段）
//   field:     marker 上的字段名（editable 时使用）
//   type:      'sn' | 'tagNo' | 'locate' | 'listTag' | 'connection' | 'normal' 特殊处理类型

const COLUMN_DEFS = {
  // ===== Detail List =====
  detailList: [
    { key: 'locate',    header: '',                       width: 5,  type: 'locate',    getter: () => '' },
    { key: 'sn',        header: 'S/N',                    width: 6,  type: 'sn',         getter: (m, i) => i + 1 },
    { key: 'tagNo',     header: 'Tag No.',                width: 18, type: 'tagNo',      getter: (m) => formatMarkerLabel(m) },
    { key: 'location',  header: 'Location',               width: 20, editable: true,    field: 'location',  getter: (m) => m.location || '' },
    { key: 'type',      header: 'Instrument Type',        width: 24, getter: (m) => { const t = getTypeById(m.typeId); return m.typeFullName || (t && t.fullName) || m.typeName || ''; } },
    { key: 'connection',header: 'Process Connection',     width: 20, type: 'connection', getter: (m) => buildProcessConnection(m) },
    { key: 'size',      header: 'Size / Calibration Range',width: 24, editable: true,   field: 'range',     getter: (m) => m.range || '' },
    { key: 'service',   header: 'Service',                width: 16, editable: true,    field: 'service',   getter: (m) => m.service || '' },
    { key: 'product',   header: 'Product',                width: 16, editable: true,    field: 'product',   getter: (m) => m.product || '' },
    { key: 'dataSheet', header: 'Data Sheet No.',         width: 20, editable: true,    field: 'dataSheet', getter: (m) => m.dataSheet || '' },
    { key: 'pid',       header: 'P & ID Dwg No.',         width: 20, editable: true,    field: 'pid',       getter: (m) => m.pid || '' },
    { key: 'note',      header: 'Remarks',                width: 20, editable: true,    field: 'note',      getter: (m) => m.note || '' },
    { key: 'list',      header: 'List',                   width: 6,  type: 'listTag',   getter: (m) => isTypeInIOList(m.typeId) ? 'IO' : 'INS' },
  ],

  // ===== INS List =====
  insList: [
    { key: 'sn',        header: 'S/N',                    width: 6,  type: 'sn',         getter: (m, i) => i + 1 },
    { key: 'tagNo',     header: 'Tag No.',                width: 18, type: 'tagNo',      getter: (m) => formatMarkerLabel(m) },
    { key: 'location',  header: 'Location',               width: 20, editable: true,    field: 'location',  getter: (m) => m.location || '' },
    { key: 'type',      header: 'Instrument Type',        width: 24, getter: (m) => { const t = getTypeById(m.typeId); return m.typeFullName || (t && t.fullName) || m.typeName || ''; } },
    { key: 'connection',header: 'Process Connection',     width: 20, type: 'connection', getter: (m) => buildProcessConnection(m) },
    { key: 'size',      header: 'Size / Calibration Range',width: 24, editable: true,   field: 'range',     getter: (m) => m.range || '' },
    { key: 'service',   header: 'Service',                width: 16, editable: true,    field: 'service',   getter: (m) => m.service || '' },
    { key: 'product',   header: 'Product',                width: 16, editable: true,    field: 'product',   getter: (m) => m.product || '' },
    { key: 'dataSheet', header: 'Data Sheet No.',         width: 20, editable: true,    field: 'dataSheet', getter: (m) => m.dataSheet || '' },
    { key: 'pid',       header: 'P & ID Dwg No.',         width: 20, editable: true,    field: 'pid',       getter: (m) => m.pid || '' },
    { key: 'note',      header: 'Remarks',                width: 20, editable: true,    field: 'note',      getter: (m) => m.note || '' },
  ],

  // ===== IO List =====
  ioList: [
    { key: 'sn',           header: 'S/N',             header2: 'S/N',             width: 6,  type: 'sn',      getter: (m, i) => i + 1 },
    { key: 'revision',     header: 'Revision No.',    header2: 'Revision No.',    width: 10, getter: () => '' },
    { key: 'dcsTag',       header: 'DCS Tag Number',  header2: 'DCS Tag Number',  width: 16, editable: true, field: 'dcsTag',       getter: (m) => m.dcsTag || '' },
    { key: 'tagNo',        header: 'Instrument Tag No.', header2: 'Instrument Tag No.', width: 18, type: 'tagNo', getter: (m) => formatMarkerLabel(m) },
    { key: 'desc',         header: 'Signal Description', header2: 'Signal Description', width: 24, getter: (m) => { const t = getTypeById(m.typeId); return m.typeFullName || (t && t.fullName) || m.typeName || ''; } },
    { key: 'location',     header: 'Equipment',       header2: 'Equipment',       width: 20, editable: true, field: 'location',  getter: (m) => m.location || '' },
    { key: 'pid',          header: 'P & ID Dwg No.',  header2: 'P & ID Dwg No.',  width: 20, editable: true, field: 'pid',       getter: (m) => m.pid || '' },
    { key: 'pidRev',       header: 'P&ID Revision No.', header2: 'P&ID Revision No.', width: 12, editable: true, field: 'pidRev',   getter: (m) => m.pidRev || '' },
    { key: 'ioType',       header: 'IO Type',          header2: 'IO Type',          width: 10, editable: true, field: 'ioType', getter: (m) => { const defs = getIOListSignalDefaults(m.typeCode); return m.ioType || defs.ioType || ''; } },
    { key: 'signalType',   header: 'Signal Type',      header2: 'Signal Type',      width: 14, editable: true, field: 'signalType', getter: (m) => { const defs = getIOListSignalDefaults(m.typeCode); return m.signalType || defs.signalType || ''; } },
    { key: 'power',        header: 'Power',            header2: 'Power',            width: 12, editable: true, field: 'power', getter: (m) => { const defs = getIOListSignalDefaults(m.typeCode); return m.power || defs.power || ''; } },
    { key: 'zeroStatus',   header: 'Zero Stauts',      header2: 'Zero Stauts',      width: 12, editable: true, field: 'zeroStatus', getter: (m) => m.zeroStatus || '' },
    { key: 'oneStatus',    header: 'One Stauts',       header2: 'One Stauts',       width: 12, editable: true, field: 'oneStatus',  getter: (m) => m.oneStatus || '' },
    { key: 'alarmLL',      header: 'Alarm Setting',    header2: 'LL',               width: 8,  colSpan: 4,  editable: true, field: 'alarmLL',  getter: (m) => m.alarmLL || '' },
    { key: 'alarmL',       header: '',                  header2: 'L',                width: 8,              editable: true, field: 'alarmL',   getter: (m) => m.alarmL || '' },
    { key: 'alarmH',       header: '',                  header2: 'H',                width: 8,              editable: true, field: 'alarmH',   getter: (m) => m.alarmH || '' },
    { key: 'alarmHH',      header: '',                  header2: 'HH',               width: 8,              editable: true, field: 'alarmHH',  getter: (m) => m.alarmHH || '' },
    { key: 'range0',       header: 'Range',             header2: '0%',               width: 8,  colSpan: 2,  editable: true, field: 'range0',  getter: (m) => (m.range0 || m.range0 === 0) ? m.range0 : (m.range ? String(m.range).split(/[~\-–—]/)[0] || '' : '') },
    { key: 'range100',     header: '',                  header2: '100%',             width: 8,              editable: true, field: 'range100', getter: (m) => (m.range100 || m.range100 === 0) ? m.range100 : (m.range ? String(m.range).split(/[~\-–—]/)[1] || '' : '') },
    { key: 'unit',         header: 'Unit',              header2: 'Unit',             width: 10, editable: true, field: 'unit',  getter: (m) => m.unit || '' },
    { key: 'rioPanel',     header: 'RIO Panel No.',     header2: 'RIO Panel No.',    width: 14, editable: true, field: 'rioPanel', getter: (m) => m.rioPanel || '' },
    { key: 'slotNumber',   header: 'Slot Number',       header2: 'Slot Number',      width: 12, editable: true, field: 'slotNumber', getter: (m) => m.slotNumber || '' },
    { key: 'channelNumber',header: 'Channel Number',    header2: 'Channel Number',   width: 14, editable: true, field: 'channelNumber', getter: (m) => m.channelNumber || '' },
    { key: 'note',         header: 'Remarks',            header2: 'Remarks',          width: 20, editable: true, field: 'note',  getter: (m) => m.note || '' },
  ],
};

// ===== 默认可见列（全选） =====
function getDefaultColumns(sheetName) {
  return COLUMN_DEFS[sheetName] ? COLUMN_DEFS[sheetName].map(c => c.key) : [];
}

// ===== 用户自定义字段 =====
// 自定义字段绑定到 marker 的某个属性，显示在预览表格和 Excel 导出中
// 存储结构: [{ key, label, sheet, bindField }]
const CUSTOM_FIELDS_KEY = 'elecPdfMarkerCustomFields_v1';

// ===== 所有内置仪表属性清单 =====
// 完整展示 marker 的所有属性，用于属性管理对话框
const ALL_MARKER_ATTRIBUTES = [
  { key: 'tagNumber', label: 'Tag No.',              desc: '仪表位号，由类型缩写 + 编号组成，如 PI0101', group: '标识' },
  { key: 'typeName',  label: 'Instrument Type',       desc: '仪表类型全称，如 Pressure Indicator', group: '标识' },
  { key: 'location',  label: 'Location',              desc: '安装位置 / 设备位号', group: '标识' },
  { key: 'pid',       label: 'P & ID Dwg No.',        desc: 'P&ID 图纸编号', group: '标识' },
  { key: 'pidRev',    label: 'P&ID Revision No.',     desc: 'P&ID 图纸版本号', group: '标识' },
  { key: 'note',      label: 'Remarks',               desc: '备注信息', group: '标识' },
  { key: 'sizeNote',  label: 'Process Connection',    desc: '过程连接口径，如 2" 或 2"x3"', group: '规格' },
  { key: 'range',     label: 'Range / Set Point',     desc: '量程或设定点，如 0~10 Barg', group: '规格' },
  { key: 'service',   label: 'Service',               desc: '介质 / 工况描述', group: '规格' },
  { key: 'product',   label: 'Product',               desc: '产品名称', group: '规格' },
  { key: 'dataSheet', label: 'Data Sheet No.',         desc: '数据表编号', group: '规格' },
  { key: 'unit',      label: 'Unit',                  desc: '工程单位，如 Barg、℃', group: '规格' },
  { key: 'dcsTag',        label: 'DCS Tag Number',        desc: 'DCS 系统位号', group: 'IO List' },
  { key: 'ioType',        label: 'IO Type',               desc: 'IO 类型: AI / AO / DI / DO / PI / RTD / TC', group: 'IO List' },
  { key: 'signalType',    label: 'Signal Type',           desc: '信号类型: 4~20mA / 0~10V / dry contact 等', group: 'IO List' },
  { key: 'power',         label: 'Power',                 desc: '供电方式: Loop Powered / 24VDC / 220VAC', group: 'IO List' },
  { key: 'zeroStatus',    label: 'Zero Status',           desc: '零位状态描述', group: 'IO List' },
  { key: 'oneStatus',     label: 'One Status',            desc: '一位状态描述', group: 'IO List' },
  { key: 'alarmLL',       label: 'Alarm LL',              desc: '低低报警值', group: 'IO List' },
  { key: 'alarmL',        label: 'Alarm L',               desc: '低报警值', group: 'IO List' },
  { key: 'alarmH',        label: 'Alarm H',               desc: '高报警值', group: 'IO List' },
  { key: 'alarmHH',       label: 'Alarm HH',              desc: '高高报警值', group: 'IO List' },
  { key: 'range0',        label: 'Range 0%',              desc: '量程下限 (0%)', group: 'IO List' },
  { key: 'range100',      label: 'Range 100%',            desc: '量程上限 (100%)', group: 'IO List' },
  { key: 'rioPanel',      label: 'RIO Panel No.',         desc: '远程 IO 盘柜编号', group: 'IO List' },
  { key: 'slotNumber',    label: 'Slot Number',           desc: '槽位号', group: 'IO List' },
  { key: 'channelNumber', label: 'Channel Number',        desc: '通道号', group: 'IO List' },
];

// ===== marker 可绑定字段注册表 =====
// 所有可用于自定义列绑定的 marker 属性
const MARKER_FIELD_OPTIONS = [
  { key: 'location', label: 'Location' },
  { key: 'range', label: 'Size / Calibration Range' },
  { key: 'service', label: 'Service' },
  { key: 'product', label: 'Product' },
  { key: 'dataSheet', label: 'Data Sheet No.' },
  { key: 'pid', label: 'P & ID Dwg No.' },
  { key: 'note', label: 'Remarks' },
  { key: 'dcsTag', label: 'DCS Tag Number' },
  { key: 'ioType', label: 'IO Type' },
  { key: 'signalType', label: 'Signal Type' },
  { key: 'power', label: 'Power' },
  { key: 'zeroStatus', label: 'Zero Status' },
  { key: 'oneStatus', label: 'One Status' },
  { key: 'alarmLL', label: 'Alarm LL' },
  { key: 'alarmL', label: 'Alarm L' },
  { key: 'alarmH', label: 'Alarm H' },
  { key: 'alarmHH', label: 'Alarm HH' },
  { key: 'range0', label: 'Range 0%' },
  { key: 'range100', label: 'Range 100%' },
  { key: 'unit', label: 'Unit' },
  { key: 'rioPanel', label: 'RIO Panel No.' },
  { key: 'slotNumber', label: 'Slot Number' },
  { key: 'channelNumber', label: 'Channel Number' },
  { key: 'pidRev', label: 'P&ID Revision No.' },
  { key: 'tagNumber', label: 'Tag Number (手动编号)' },
  { key: 'sizeNote', label: 'Size Note (口径)' },
];

let _customFieldDefs = null;

function getCustomFieldDefs() {
  if (_customFieldDefs) return _customFieldDefs;
  try {
    const raw = localStorage.getItem(CUSTOM_FIELDS_KEY);
    _customFieldDefs = raw ? JSON.parse(raw) : [];
  } catch {
    _customFieldDefs = [];
  }
  return _customFieldDefs;
}

function saveCustomFieldDefs(defs) {
  _customFieldDefs = defs;
  try {
    localStorage.setItem(CUSTOM_FIELDS_KEY, JSON.stringify(defs));
  } catch { /* ignore */ }
}

function addCustomFieldDef(sheetName, label, bindField) {
  const defs = getCustomFieldDefs();
  const key = 'cf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  defs.push({ key, label, sheet: sheetName, bindField });
  saveCustomFieldDefs(defs);
  return key;
}

function removeCustomFieldDef(key) {
  const defs = getCustomFieldDefs().filter(d => d.key !== key);
  saveCustomFieldDefs(defs);
}

// 获取指定工作表的自定义字段，转换为列定义
function getCustomFieldColumns(sheetName) {
  const defs = getCustomFieldDefs().filter(d => d.sheet === sheetName);
  return defs.map(cf => ({
    key: cf.key,
    header: cf.label,
    width: 16,
    editable: true,
    field: cf.bindField,
    isCustom: true,
    _customKey: cf.key,
    getter: (m) => {
      // 直接读 marker 上的绑定字段
      const v = m[cf.bindField];
      return (v === undefined || v === null) ? '' : String(v);
    },
  }));
}

// ===== 用户列选择配置 =====
// 结构: { detailList: ['sn','tagNo','location',...], ioList: [...], insList: [...] }
let _columnSettings = null;

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
    for (const sheet of ['detailList', 'ioList', 'insList']) {
      _columnSettings[sheet] = getDefaultColumns(sheet);
    }
  }
  return _columnSettings;
}

function saveColumnSettings(settings) {
  _columnSettings = settings;
  try {
    localStorage.setItem(EXCEL_COLUMNS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

// 获取某张表的启用的列定义列表（按用户配置过滤，自动合并新增列）
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

// 获取某张表的 Excel 列定义（保持与原始列数一致的索引映射）
function getExcelColumnDefs(sheetName) {
  return getEnabledColumns(sheetName);
}



// 获取包含自定义字段的完整列定义
function getSheetColumnsWithCustom(sheetName) {
  const base = getEnabledColumns(sheetName);
  const custom = getCustomFieldColumns(sheetName);
  const attrs = getCustomAttrColumns();
  return [...base, ...custom, ...attrs];
}

// ===== 工具函数：获取列的实际索引（Excel 列号） =====
// 返回 { colIndex: 1-based, columnDefs: 列定义数组 }
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

function saveCustomAttrDefs(defs) {
  _customAttrDefs = defs;
  try {
    localStorage.setItem(CUSTOM_ATTRS_KEY, JSON.stringify(defs));
  } catch { /* ignore */ }
}

function addCustomAttrDef(label, description) {
  const defs = getCustomAttrDefs();
  const key = 'ca_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  defs.push({ key, label, description: description || '', enabled: true });
  saveCustomAttrDefs(defs);
  return key;
}

function updateCustomAttrDef(key, updates) {
  const defs = getCustomAttrDefs();
  const idx = defs.findIndex(d => d.key === key);
  if (idx === -1) return;
  Object.assign(defs[idx], updates);
  saveCustomAttrDefs(defs);
}

function removeCustomAttrDef(key) {
  const defs = getCustomAttrDefs().filter(d => d.key !== key);
  saveCustomAttrDefs(defs);
}

// 获取 marker 上的自定义属性值
function getCustomAttrValue(marker, attrKey) {
  if (!marker.customAttrs) return '';
  const v = marker.customAttrs[attrKey];
  return (v === undefined || v === null) ? '' : String(v);
}

// 设置 marker 上的自定义属性值
function setCustomAttrValue(marker, attrKey, value) {
  if (!marker.customAttrs) marker.customAttrs = {};
  if (value === '' || value === null || value === undefined) {
    delete marker.customAttrs[attrKey];
  } else {
    marker.customAttrs[attrKey] = String(value);
  }
}

// 获取所有可用于列绑定的字段（内置 + 已启用的自定义属性）
function getAllBindableFields() {
  const custom = getCustomAttrDefs()
    .filter(d => d.enabled !== false)
    .map(d => ({ key: d.key, label: d.label + ' (自定义)' }));
  return [...MARKER_FIELD_OPTIONS, ...custom];
}

// 获取已启用的自定义属性对应的列定义
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

function saveBuiltinAttrState(state) {
  _builtinAttrState = state;
  try {
    localStorage.setItem(BUILTIN_ATTR_STATE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

// 获取内置属性的启用状态，默认 true
function isBuiltinAttrEnabled(key) {
  const state = getBuiltinAttrState();
  const s = state[key];
  if (!s) return true;
  return s.enabled !== false;
}

// 获取内置属性的隐藏状态，默认 false
function isBuiltinAttrHidden(key) {
  const state = getBuiltinAttrState();
  const s = state[key];
  if (!s) return false;
  return s.hidden === true;
}

// 更新单个内置属性状态
function updateBuiltinAttrState(key, updates) {
  const state = getBuiltinAttrState();
  if (!state[key]) state[key] = {};
  Object.assign(state[key], updates);
  saveBuiltinAttrState(state);
}

// 恢复所有隐藏的内置属性
function restoreAllBuiltinAttrs() {
  const state = getBuiltinAttrState();
  for (const k of Object.keys(state)) {
    state[k].hidden = false;
  }
  saveBuiltinAttrState(state);
}

// 获取可见的内置属性列表（排除隐藏的）
function getVisibleBuiltinAttrs() {
  return ALL_MARKER_ATTRIBUTES.filter(a => !isBuiltinAttrHidden(a.key));
}

// 是否有隐藏的内置属性
function hasHiddenBuiltinAttrs() {
  return ALL_MARKER_ATTRIBUTES.some(a => isBuiltinAttrHidden(a.key));
}

// ===== 自定义表格数据存储 =====
// 用户可在预览窗口创建自定义表格，每个表格有名称和字段列表
// 存储结构: [{ id, name, columns: [{ key, label, bindField }] }]
const CUSTOM_TABLES_KEY = 'elecPdfMarkerCustomTables_v1';

let _customTables = null;

function getCustomTables() {
  if (_customTables) return _customTables;
  try {
    _customTables = JSON.parse(localStorage.getItem(CUSTOM_TABLES_KEY)) || [];
  } catch { _customTables = []; }
  return _customTables;
}

function saveCustomTables(tables) {
  _customTables = tables;
  try { localStorage.setItem(CUSTOM_TABLES_KEY, JSON.stringify(tables)); } catch {}
}

function addCustomTable(name, columns) {
  const tables = getCustomTables();
  const id = 'ct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  tables.push({ id, name, columns });
  saveCustomTables(tables);
  return id;
}

function removeCustomTable(id) {
  const tables = getCustomTables().filter(t => t.id !== id);
  saveCustomTables(tables);
}