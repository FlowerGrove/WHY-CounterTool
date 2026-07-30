// 仪表资源库
// 包含两部分：
//   1) INSTRUMENT_TYPES：标准工程仪表类型（按 ISA 5.1 命名规范），覆盖 8 大类 100+ 代号
//      用于主窗口默认列表及自定义类型自动匹配
//   2) SIZE_CONNECTIONS：尺寸连接方式映射，按仪表代号决定 Process Connection 字段拼接规则
// 主窗口默认列表仅展示 alwaysVisible: true 的常用类型
// 用户自定义代号时，资源库按精确匹配自动覆盖标准代号、英文全称、颜色，避免小写/中文混入

// 标准工程仪表类型库（ISA 5.1 命名规范）
// alwaysVisible: true = 主窗口默认显示；false = 仅作资源库，用户自定义时匹配调用
const INSTRUMENT_TYPES = [
    // ===== 压力类 Pressure =====
    { abbr: 'PI',   fullName: 'Pressure Indicator',                  color: '#e53935', alwaysVisible: true  },
    { abbr: 'PT',   fullName: 'Pressure Transmitter',                color: '#e53935', alwaysVisible: true  },
    { abbr: 'PIT',  fullName: 'Pressure Indicating Transmitter',     color: '#e53935', alwaysVisible: true  },
    { abbr: 'PDI',  fullName: 'Differential Pressure Indicator',     color: '#e53935', alwaysVisible: true  },
    { abbr: 'PDT',  fullName: 'Differential Pressure Transmitter',   color: '#e53935', alwaysVisible: true  },
    { abbr: 'PG',   fullName: 'Pressure Gauge',                      color: '#e53935', alwaysVisible: false },
    { abbr: 'PGI',  fullName: 'Pressure Gauge Indicator',            color: '#e53935', alwaysVisible: false },
    { abbr: 'PDS',  fullName: 'Differential Pressure Switch',        color: '#e53935', alwaysVisible: false },
    { abbr: 'PDA',  fullName: 'Differential Pressure Alarm',         color: '#e53935', alwaysVisible: false },
    { abbr: 'PSH',  fullName: 'Pressure Switch High',                color: '#e53935', alwaysVisible: false },
    { abbr: 'PSL',  fullName: 'Pressure Switch Low',                 color: '#e53935', alwaysVisible: false },
    { abbr: 'PSHH', fullName: 'Pressure Switch High-High',           color: '#e53935', alwaysVisible: false },
    { abbr: 'PSLL', fullName: 'Pressure Switch Low-Low',             color: '#e53935', alwaysVisible: false },
    { abbr: 'PSE',  fullName: 'Pressure Switch Emergency',           color: '#e53935', alwaysVisible: false },
    { abbr: 'PSV',  fullName: 'Pressure Safety Valve',               color: '#e53935', alwaysVisible: false },
    { abbr: 'PRV',  fullName: 'Pressure Relief Valve',               color: '#e53935', alwaysVisible: false },
    { abbr: 'PCV',  fullName: 'Pressure Control Valve',              color: '#e53935', alwaysVisible: false },
    { abbr: 'PV',   fullName: 'Pressure Valve',                      color: '#e53935', alwaysVisible: false },
    { abbr: 'PY',   fullName: 'Pressure Relay',                      color: '#e53935', alwaysVisible: false },
    { abbr: 'PR',   fullName: 'Pressure Recorder',                   color: '#e53935', alwaysVisible: false },
    { abbr: 'PRC',  fullName: 'Pressure Recorder Controller',        color: '#e53935', alwaysVisible: false },
    { abbr: 'PC',   fullName: 'Pressure Controller',                 color: '#e53935', alwaysVisible: false },
    { abbr: 'PAH',  fullName: 'Pressure Alarm High',                 color: '#e53935', alwaysVisible: false },
    { abbr: 'PAL',  fullName: 'Pressure Alarm Low',                  color: '#e53935', alwaysVisible: false },
    { abbr: 'PFR',  fullName: 'Pressure Filter',                     color: '#e53935', alwaysVisible: false },

    // ===== 温度类 Temperature =====
    { abbr: 'TI',   fullName: 'Temperature Indicator',               color: '#e53935', alwaysVisible: true  },
    { abbr: 'TT',   fullName: 'Temperature Transmitter',             color: '#e53935', alwaysVisible: true  },
    { abbr: 'TIT',  fullName: 'Temperature Indicating Transmitter',  color: '#e53935', alwaysVisible: true  },
    { abbr: 'TG',   fullName: 'Temperature Gauge',                   color: '#e53935', alwaysVisible: false },
    { abbr: 'TCG',  fullName: 'Temperature Capillary Gauge',         color: '#e53935', alwaysVisible: false },
    { abbr: 'TW',   fullName: 'Thermowell',                          color: '#e53935', alwaysVisible: false },
    { abbr: 'TE',   fullName: 'Temperature Element',                 color: '#e53935', alwaysVisible: false },
    { abbr: 'TDI',  fullName: 'Differential Temperature Indicator',  color: '#e53935', alwaysVisible: false },
    { abbr: 'TDT',  fullName: 'Differential Temperature Transmitter', color: '#e53935', alwaysVisible: false },
    { abbr: 'TSH',  fullName: 'Temperature Switch High',             color: '#e53935', alwaysVisible: false },
    { abbr: 'TSL',  fullName: 'Temperature Switch Low',              color: '#e53935', alwaysVisible: false },
    { abbr: 'TSHH', fullName: 'Temperature Switch High-High',        color: '#e53935', alwaysVisible: false },
    { abbr: 'TSLL', fullName: 'Temperature Switch Low-Low',          color: '#e53935', alwaysVisible: false },
    { abbr: 'TCV',  fullName: 'Temperature Control Valve',           color: '#e53935', alwaysVisible: false },
    { abbr: 'TV',   fullName: 'Temperature Valve',                   color: '#e53935', alwaysVisible: false },
    { abbr: 'TY',   fullName: 'Temperature Relay',                   color: '#e53935', alwaysVisible: false },
    { abbr: 'TR',   fullName: 'Temperature Recorder',                color: '#e53935', alwaysVisible: false },
    { abbr: 'TRC',  fullName: 'Temperature Recorder Controller',     color: '#e53935', alwaysVisible: false },
    { abbr: 'TC',   fullName: 'Temperature Controller',              color: '#e53935', alwaysVisible: false },
    { abbr: 'TAH',  fullName: 'Temperature Alarm High',              color: '#e53935', alwaysVisible: false },
    { abbr: 'TAL',  fullName: 'Temperature Alarm Low',               color: '#e53935', alwaysVisible: false },

    // ===== 流量类 Flow =====
    { abbr: 'FI',   fullName: 'Flow Indicator',                      color: '#e53935', alwaysVisible: true  },
    { abbr: 'FT',   fullName: 'Flow Transmitter',                    color: '#e53935', alwaysVisible: true  },
    { abbr: 'FIT',  fullName: 'Flow Indicating Transmitter',         color: '#e53935', alwaysVisible: true  },
    { abbr: 'FE',   fullName: 'Flow Element',                        color: '#e53935', alwaysVisible: false },
    { abbr: 'FO',   fullName: 'Flow Orifice',                        color: '#e53935', alwaysVisible: false },
    { abbr: 'FTG',  fullName: 'Flow Totalizer Gauge',                color: '#e53935', alwaysVisible: false },
    { abbr: 'FQI',  fullName: 'Flow Quantity Indicator',             color: '#e53935', alwaysVisible: false },
    { abbr: 'FQT',  fullName: 'Flow Quantity Transmitter',           color: '#e53935', alwaysVisible: false },
    { abbr: 'FQIC', fullName: 'Flow Quantity Indicator Controller',  color: '#e53935', alwaysVisible: false },
    { abbr: 'FCV',  fullName: 'Flow Control Valve',                  color: '#e53935', alwaysVisible: false },
    { abbr: 'FV',   fullName: 'Flow Valve',                          color: '#e53935', alwaysVisible: false },
    { abbr: 'FSH',  fullName: 'Flow Switch High',                    color: '#e53935', alwaysVisible: false },
    { abbr: 'FSL',  fullName: 'Flow Switch Low',                     color: '#e53935', alwaysVisible: false },
    { abbr: 'FY',   fullName: 'Flow Relay',                          color: '#e53935', alwaysVisible: false },
    { abbr: 'FR',   fullName: 'Flow Recorder',                       color: '#e53935', alwaysVisible: false },
    { abbr: 'FRC',  fullName: 'Flow Recorder Controller',            color: '#e53935', alwaysVisible: false },
    { abbr: 'FC',   fullName: 'Flow Controller',                     color: '#e53935', alwaysVisible: false },
    { abbr: 'FAH',  fullName: 'Flow Alarm High',                     color: '#e53935', alwaysVisible: false },
    { abbr: 'FAL',  fullName: 'Flow Alarm Low',                      color: '#e53935', alwaysVisible: false },

    // ===== 液位类 Level =====
    { abbr: 'LI',   fullName: 'Level Indicator',                     color: '#e53935', alwaysVisible: true  },
    { abbr: 'LT',   fullName: 'Level Transmitter',                   color: '#e53935', alwaysVisible: true  },
    { abbr: 'LIT',  fullName: 'Level Indicating Transmitter',        color: '#e53935', alwaysVisible: true  },
    { abbr: 'LG',   fullName: 'Level Glass',                         color: '#e53935', alwaysVisible: false },
    { abbr: 'LE',   fullName: 'Level Element',                       color: '#e53935', alwaysVisible: false },
    { abbr: 'LSH',  fullName: 'Level Switch High',                   color: '#e53935', alwaysVisible: false },
    { abbr: 'LSL',  fullName: 'Level Switch Low',                    color: '#e53935', alwaysVisible: false },
    { abbr: 'LSHH', fullName: 'Level Switch High-High',              color: '#e53935', alwaysVisible: false },
    { abbr: 'LSLL', fullName: 'Level Switch Low-Low',                color: '#e53935', alwaysVisible: false },
    { abbr: 'LCV',  fullName: 'Level Control Valve',                 color: '#e53935', alwaysVisible: false },
    { abbr: 'LV',   fullName: 'Level Valve',                         color: '#e53935', alwaysVisible: false },
    { abbr: 'LY',   fullName: 'Level Relay',                         color: '#e53935', alwaysVisible: false },
    { abbr: 'LR',   fullName: 'Level Recorder',                      color: '#e53935', alwaysVisible: false },
    { abbr: 'LRC',  fullName: 'Level Recorder Controller',           color: '#e53935', alwaysVisible: false },
    { abbr: 'LC',   fullName: 'Level Controller',                    color: '#e53935', alwaysVisible: false },
    { abbr: 'LAH',  fullName: 'Level Alarm High',                    color: '#e53935', alwaysVisible: false },
    { abbr: 'LAL',  fullName: 'Level Alarm Low',                     color: '#e53935', alwaysVisible: false },

    // ===== 分析类 Analyzer =====
    { abbr: 'AI',   fullName: 'Analyzer Indicator',                  color: '#e53935', alwaysVisible: false },
    { abbr: 'AT',   fullName: 'Analyzer Transmitter',                color: '#e53935', alwaysVisible: false },
    { abbr: 'AIT',  fullName: 'Analyzer Indicating Transmitter',     color: '#e53935', alwaysVisible: false },
    { abbr: 'AE',   fullName: 'Analyzer Element',                    color: '#e53935', alwaysVisible: false },
    { abbr: 'AR',   fullName: 'Analyzer Recorder',                   color: '#e53935', alwaysVisible: false },
    { abbr: 'ARC',  fullName: 'Analyzer Recorder Controller',        color: '#e53935', alwaysVisible: false },
    { abbr: 'AC',   fullName: 'Analyzer Controller',                 color: '#e53935', alwaysVisible: false },
    { abbr: 'AY',   fullName: 'Analyzer Relay',                      color: '#e53935', alwaysVisible: false },
    { abbr: 'ASH',  fullName: 'Analyzer Switch High',                color: '#e53935', alwaysVisible: false },
    { abbr: 'ASL',  fullName: 'Analyzer Switch Low',                 color: '#e53935', alwaysVisible: false },
    { abbr: 'QI',   fullName: 'Quantity Indicator',                  color: '#e53935', alwaysVisible: false },
    { abbr: 'QT',   fullName: 'Quantity Transmitter',                color: '#e53935', alwaysVisible: false },
    { abbr: 'QIT',  fullName: 'Quantity Indicating Transmitter',     color: '#e53935', alwaysVisible: false },
    { abbr: 'QR',   fullName: 'Quantity Recorder',                   color: '#e53935', alwaysVisible: false },

    // ===== 阀门类 Valves =====
    { abbr: 'HCV',  fullName: 'Hand Control Valve',                  color: '#e53935', alwaysVisible: false },
    { abbr: 'HV',   fullName: 'Hand Valve',                          color: '#e53935', alwaysVisible: false },
    { abbr: 'CV',   fullName: 'Control Valve',                       color: '#e53935', alwaysVisible: false },
    { abbr: 'SV',   fullName: 'Solenoid Valve',                      color: '#e53935', alwaysVisible: false },
    { abbr: 'BV',   fullName: 'Butterfly Valve',                     color: '#e53935', alwaysVisible: false },
    { abbr: 'GV',   fullName: 'Gate Valve',                          color: '#e53935', alwaysVisible: false },
    { abbr: 'NB',   fullName: 'Needle Valve',                        color: '#e53935', alwaysVisible: false },
    { abbr: 'DBV',  fullName: 'Double Block Valve',                  color: '#e53935', alwaysVisible: false },
    { abbr: 'HBV',  fullName: 'Hose Block Valve',                    color: '#e53935', alwaysVisible: false },
    { abbr: 'SDV',  fullName: 'Shutdown Valve',                      color: '#e53935', alwaysVisible: false },
    { abbr: 'BDV',  fullName: 'Blowdown Valve',                      color: '#e53935', alwaysVisible: false },
    { abbr: 'RV',   fullName: 'Relief Valve',                        color: '#e53935', alwaysVisible: false },
    { abbr: 'CKV',  fullName: 'Check Valve',                         color: '#e53935', alwaysVisible: false },
    { abbr: 'BVV',  fullName: 'Ball Valve',                          color: '#e53935', alwaysVisible: false },

    // ===== 位置/运动类 Position/Motion =====
    { abbr: 'ZI',   fullName: 'Position Indicator',                  color: '#e53935', alwaysVisible: false },
    { abbr: 'ZT',   fullName: 'Position Transmitter',                color: '#e53935', alwaysVisible: false },
    { abbr: 'ZSH',  fullName: 'Position Switch High',                color: '#e53935', alwaysVisible: false },
    { abbr: 'ZSL',  fullName: 'Position Switch Low',                 color: '#e53935', alwaysVisible: false },
    { abbr: 'ZSO',  fullName: 'Position Switch Open',                color: '#e53935', alwaysVisible: false },
    { abbr: 'ZSC',  fullName: 'Position Switch Closed',              color: '#e53935', alwaysVisible: false },
    { abbr: 'ZV',   fullName: 'Position Valve',                      color: '#e53935', alwaysVisible: false },
    { abbr: 'HS',   fullName: 'Hand Switch',                         color: '#e53935', alwaysVisible: false },

    // ===== 速度/振动/重量/电气类 =====
    { abbr: 'SI',   fullName: 'Speed Indicator',                     color: '#e53935', alwaysVisible: false },
    { abbr: 'ST',   fullName: 'Speed Transmitter',                   color: '#e53935', alwaysVisible: false },
    { abbr: 'SSH',  fullName: 'Speed Switch High',                   color: '#e53935', alwaysVisible: false },
    { abbr: 'SSL',  fullName: 'Speed Switch Low',                    color: '#e53935', alwaysVisible: false },
    { abbr: 'VI',   fullName: 'Vibration Indicator',                 color: '#e53935', alwaysVisible: false },
    { abbr: 'VT',   fullName: 'Vibration Transmitter',               color: '#e53935', alwaysVisible: false },
    { abbr: 'WI',   fullName: 'Weight Indicator',                    color: '#e53935', alwaysVisible: false },
    { abbr: 'WT',   fullName: 'Weight Transmitter',                  color: '#e53935', alwaysVisible: false },
    { abbr: 'EI',   fullName: 'Electrical Indicator',                color: '#e53935', alwaysVisible: false },
    { abbr: 'ET',   fullName: 'Electrical Transmitter',              color: '#e53935', alwaysVisible: false },

    // ===== 其他 =====
    { abbr: 'X',    fullName: 'Other Instrument',                    color: '#e53935', alwaysVisible: true  },
];

// 尺寸连接方式映射
// 键为仪表代号（大写），值为该代号的 Process Connection 拼接后缀
// 未列出的代号使用 DEFAULT_CONNECTION.suffix
// sizeNote 已含 ANSI/NPT/FLANGED/THREADED/SW 等关键字时原样输出，不走拼接
const DEFAULT_CONNECTION = { suffix: 'ANSI 150# RF' };

const SIZE_CONNECTIONS = {
    'PG':   { suffix: 'NPT' },          // 压力表：螺纹连接
    'PGI':  { suffix: 'NPT' },          // 压力表指示器：螺纹连接
    'TG':   { suffix: 'NPT' },          // 温度计：螺纹连接
    'TCG':  { suffix: 'NPT' },          // 毛细管温度计：螺纹连接
    'PSV':  { suffix: 'ANSI 300# RF' }, // 安全阀：高压法兰
    'PRV':  { suffix: 'ANSI 300# RF' }, // 卸压阀：高压法兰
    'RV':   { suffix: 'ANSI 300# RF' }, // 缓冲阀：高压法兰
    'BDV':  { suffix: 'ANSI 300# RF' }, // 放空阀：高压法兰
};

// 检测 sizeNote 是否已包含完整连接方式（避免重复拼接）
function hasConnectionKeyword(s) {
    return /ANSI|NPT|FLANGED|THREADED|SW|RTJ/i.test(s);
}

// 根据仪表代号获取连接后缀
function getConnectionSuffix(abbr) {
    const key = (abbr || '').toUpperCase();
    if (SIZE_CONNECTIONS[key]) return SIZE_CONNECTIONS[key].suffix;
    return DEFAULT_CONNECTION.suffix;
}

// 从资源库按代号精确查找仪表类型定义
function findInstrumentByAbbr(abbr) {
    if (!abbr) return null;
    const key = abbr.toUpperCase().trim();
    return INSTRUMENT_TYPES.find(t => t.abbr.toUpperCase() === key) || null;
}

// 暴露到全局
window.INSTRUMENT_RESOURCES = {
    INSTRUMENT_TYPES,
    DEFAULT_CONNECTION,
    SIZE_CONNECTIONS,
    hasConnectionKeyword,
    getConnectionSuffix,
    findInstrumentByAbbr,
};
