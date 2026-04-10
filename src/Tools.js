import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Binary,
  Braces,
  Check,
  Clock3,
  Copy,
  FileJson,
  Globe,
  Link2,
  RefreshCw,
  Regex,
  Wand2
} from 'lucide-react';

const copyText = async (text) => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('copy failed =', error);
    return false;
  }
};

const toUnicodeEscape = (input) => {
  return Array.from(String(input || '')).map((char) => {
    const code = char.charCodeAt(0);
    return code > 127 ? `\\u${code.toString(16).padStart(4, '0')}` : char;
  }).join('');
};

const fromUnicodeEscape = (input) => {
  return String(input || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
};

const extractMatches = (text, regex) => {
  return Array.from(new Set((String(text || '').match(regex) || []).map(item => item.trim()))).filter(Boolean);
};

const toSingleLineBashCurl = (input) => {
  return String(input || '')
    .replace(/\\\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const convertSingleQuotedChunks = (input) => {
  return input.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, content) => {
    const normalized = content.replace(/"/g, '\\"');
    return `"${normalized}"`;
  });
};

const toSingleLineCmdCurl = (input) => {
  const bashLine = toSingleLineBashCurl(input);
  return convertSingleQuotedChunks(bashLine)
    .replace(/\s+/g, ' ')
    .trim();
};

const parseTimestampText = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (/^\d{13}$/.test(trimmed)) return Number(trimmed);
  if (/^\d{10}$/.test(trimmed)) return Number(trimmed) * 1000;
  return null;
};

const formatDateTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const moduleMeta = [
  {
    id: 'codec',
    icon: <Binary size={18} />,
    title: '编码与解码',
    subtitle: 'Base64 / URL / Unicode 中文互转',
    category: '编码',
    features: ['Base64', 'URL', 'Unicode']
  },
  {
    id: 'regex',
    icon: <Regex size={18} />,
    title: '正则表达式筛选',
    subtitle: '提取域名、URL、IP 等结果',
    category: '解析',
    features: ['Domain', 'URL', 'IP']
  },
  {
    id: 'format',
    icon: <FileJson size={18} />,
    title: '格式化工具',
    subtitle: 'JSON 格式化与 curl 命令整理',
    category: '格式化',
    features: ['JSON', 'curl Bash', 'curl CMD']
  },
  {
    id: 'time',
    icon: <Clock3 size={18} />,
    title: '时间戳转换',
    subtitle: '秒级 / 毫秒级时间戳与日期互转',
    category: '时间',
    features: ['10 位秒', '13 位毫秒', '本地时间']
  }
];

const ModuleShell = ({ title, subtitle, onBack, children }) => (
  <div className="tool-module-shell">
    <div className="tool-module-header">
      <div className="tool-module-title-group">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <button className="tool-back-btn" onClick={onBack}>
        <ArrowLeft size={16} />
        <span>返回模块列表</span>
      </button>
    </div>
    <div className="tool-module-body">{children}</div>
  </div>
);

function Tools() {
  const [activeModule, setActiveModule] = useState('');

  const [codecInput, setCodecInput] = useState('');
  const [codecOutput, setCodecOutput] = useState({ base64: '', url: '', unicode: '' });
  const [codecError, setCodecError] = useState('');

  const [regexInput, setRegexInput] = useState('');
  const [regexResult, setRegexResult] = useState({
    domains: [],
    urls: [],
    ips: []
  });

  const [jsonInput, setJsonInput] = useState('');
  const [jsonOutput, setJsonOutput] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [curlInput, setCurlInput] = useState('');
  const [curlBashOutput, setCurlBashOutput] = useState('');
  const [curlCmdOutput, setCurlCmdOutput] = useState('');

  const [timestampInput, setTimestampInput] = useState('');
  const [timestampOutput, setTimestampOutput] = useState('');
  const [dateTimeInput, setDateTimeInput] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  });
  const [dateTimeOutput, setDateTimeOutput] = useState('');
  const [timeError, setTimeError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const regexOutput = useMemo(() => {
    const sections = [];
    if (regexResult.domains.length > 0) {
      sections.push(`[ Domains - ${regexResult.domains.length} ]\n${regexResult.domains.join('\n')}`);
    }
    if (regexResult.urls.length > 0) {
      sections.push(`[ URLs - ${regexResult.urls.length} ]\n${regexResult.urls.join('\n')}`);
    }
    if (regexResult.ips.length > 0) {
      sections.push(`[ IPs - ${regexResult.ips.length} ]\n${regexResult.ips.join('\n')}`);
    }
    return sections.join('\n\n');
  }, [regexResult]);

  const totalModules = moduleMeta.length;

  const handleCodecAction = (action) => {
    setCodecError('');
    try {
      const input = (codecInput || '').trim();
      if (!input) return;

      const results = { base64: '', url: '', unicode: '' };
      if (action === 'encode') {
        results.base64 = window.btoa(unescape(encodeURIComponent(input)));
        results.url = encodeURIComponent(input);
        results.unicode = toUnicodeEscape(input);
      } else {
        // Base64 Decode
        try {
          results.base64 = decodeURIComponent(escape(window.atob(input)));
        } catch {
          results.base64 = '(无效 Base64 数据)';
        }
        // URL Decode
        try {
          results.url = decodeURIComponent(input);
        } catch {
          results.url = '(无效 URL 编码)';
        }
        // Unicode Decode
        try {
          results.unicode = fromUnicodeEscape(input);
        } catch {
          results.unicode = '(无效 Unicode 编码)';
        }
      }
      setCodecOutput(results);
    } catch (error) {
      setCodecError(error.message || '转换失败，请检查输入格式');
      setCodecOutput({ base64: '', url: '', unicode: '' });
    }
  };

  const handleCodecClear = () => {
    setCodecInput('');
    setCodecOutput({ base64: '', url: '', unicode: '' });
    setCodecError('');
  };

  const handleCodecSwap = () => {
    // 优先取第一个有值的非错误提示内容
    const out = codecOutput.base64 || codecOutput.url || codecOutput.unicode || '';
    if (!out || out.startsWith('(')) return;
    setCodecInput(out);
    setCodecOutput({ base64: '', url: '', unicode: '' });
    setCodecError('');
  };

  const handleRegexExtract = (type) => {
    const text = regexInput || '';
    const domainRegex = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}\b/g;
    const urlRegex = /\bhttps?:\/\/[^\s"'<>]+/g;
    const ipRegex = /\b(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}\b/g;

    const urls = extractMatches(text, urlRegex);
    const ips = extractMatches(text, ipRegex);
    const domains = extractMatches(text, domainRegex).filter((domain) => !ips.includes(domain));

    setRegexResult((prev) => {
      if (type === 'domain') {
        return { ...prev, domains };
      }
      if (type === 'url') {
        return { ...prev, urls };
      }
      if (type === 'ip') {
        return { ...prev, ips };
      }
      return prev;
    });
  };

  const handleRegexExtractAll = () => {
    const text = regexInput || '';
    const domainRegex = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}\b/g;
    const urlRegex = /\bhttps?:\/\/[^\s"'<>]+/g;
    const ipRegex = /\b(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}\b/g;
    const urls = extractMatches(text, urlRegex);
    const ips = extractMatches(text, ipRegex);
    const domains = extractMatches(text, domainRegex).filter((domain) => !ips.includes(domain));
    setRegexResult({ domains, urls, ips });
  };

  const handleRegexClear = () => {
    setRegexInput('');
    setRegexResult({ domains: [], urls: [], ips: [] });
  };

  const handleJsonFormat = (pretty = true) => {
    setJsonError('');
    try {
      const parsed = JSON.parse(jsonInput);
      setJsonOutput(pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed));
    } catch (error) {
      setJsonError(error.message || 'JSON 格式错误');
      setJsonOutput('');
    }
  };

  const handleJsonClear = () => {
    setJsonInput('');
    setJsonOutput('');
    setJsonError('');
  };

  const handleCurlFormat = () => {
    const input = curlInput || '';
    setCurlBashOutput(toSingleLineBashCurl(input));
    setCurlCmdOutput(toSingleLineCmdCurl(input));
  };

  const handleCurlClear = () => {
    setCurlInput('');
    setCurlBashOutput('');
    setCurlCmdOutput('');
  };

  const handleCopy = async (key, text) => {
    const ok = await copyText(text);
    if (!ok) return;
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current == key ? '' : current));
    }, 1200);
  };

  const handleTimestampToDate = () => {
    setTimeError('');
    const value = parseTimestampText(timestampInput);
    if (!value) {
      setTimeError('请输入 10 位秒级或 13 位毫秒级时间戳');
      setTimestampOutput('');
      return;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      setTimeError('时间戳无效');
      setTimestampOutput('');
      return;
    }
    setTimestampOutput(formatDateTime(date));
  };

  const handleDateToTimestamp = () => {
    setTimeError('');
    const date = new Date(dateTimeInput);
    if (Number.isNaN(date.getTime())) {
      setTimeError('请输入有效时间');
      setDateTimeOutput('');
      return;
    }
    setDateTimeOutput(`${date.getTime()} ms / ${Math.floor(date.getTime() / 1000)} s`);
  };

  const handleFillNowTimestamp = () => {
    const now = Date.now();
    setTimestampInput(String(now));
  };

  const handleFillNowDate = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    setDateTimeInput(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
  };

  const renderModuleContent = () => {
    if (activeModule === 'codec') {
      return (
        <ModuleShell title="编码与解码" subtitle="Base64 / URL / Unicode 中文互转" onBack={() => setActiveModule('')}>
          <div className="tool-split-grid">
            <div className="tool-card">
              <div className="tool-card-header">
                <div className="tool-card-icon"><Binary size={18} /></div>
                <div>
                  <h3>输入与操作</h3>
                  <p>支持 Base64、URL、Unicode 编解码</p>
                </div>
              </div>
              <textarea
                className="tool-textarea"
                placeholder="输入待转换的内容..."
                value={codecInput}
                onChange={(e) => setCodecInput(e.target.value)}
                rows={10}
              />
              <div className="tool-action-row">
                <div className="tool-btn-group">
                  <button className="tool-btn primary" onClick={() => handleCodecAction('encode')}>一键编码</button>
                  <button className="tool-btn" onClick={() => handleCodecAction('decode')}>一键解码</button>
                </div>
                <div className="tool-btn-group">
                  <button className="tool-btn" onClick={handleCodecClear}>清空</button>
                  <button className="tool-btn" onClick={handleCodecSwap}>交换</button>
                </div>
              </div>
              {codecError && <div className="tool-error">{codecError}</div>}
            </div>
            <div className="tool-card">
              <div className="tool-card-header">
                <div className="tool-card-icon"><Check size={18} /></div>
                <div>
                  <h3>处理结果</h3>
                  <p>自动转换 Base64、URL、Unicode 格式</p>
                </div>
              </div>
              <div className="tool-output-box compact">
                <div className="tool-output-header">
                  <span>Base64</span>
                  <button className="tool-copy-btn" onClick={() => handleCopy('codec-b64', codecOutput.base64)}>
                    {copiedKey == 'codec-b64' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <pre>{codecOutput.base64 || '等待...'}</pre>
              </div>
              <div className="tool-output-box compact">
                <div className="tool-output-header">
                  <span>URL</span>
                  <button className="tool-copy-btn" onClick={() => handleCopy('codec-url', codecOutput.url)}>
                    {copiedKey == 'codec-url' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <pre>{codecOutput.url || '等待...'}</pre>
              </div>
              <div className="tool-output-box compact">
                <div className="tool-output-header">
                  <span>Unicode</span>
                  <button className="tool-copy-btn" onClick={() => handleCopy('codec-uni', codecOutput.unicode)}>
                    {copiedKey == 'codec-uni' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <pre>{codecOutput.unicode || '等待...'}</pre>
              </div>
            </div>
          </div>
        </ModuleShell>
      );
    }

    if (activeModule === 'regex') {
      return (
        <ModuleShell title="正则表达式筛选" subtitle="从混杂文本提取域名、URL、IP" onBack={() => setActiveModule('')}>
          <div className="tool-split-grid">
            <div className="tool-card">
              <div className="tool-card-header">
                <div className="tool-card-icon"><Regex size={18} /></div>
                <div>
                  <h3>原始数据</h3>
                  <p>粘贴待处理文本，选择要提取的类型</p>
                </div>
              </div>
              <textarea
                className="tool-textarea"
                placeholder="粘贴原始数据，例如 domain:baidu.com;google.com, url:http://baidu.com ..."
                value={regexInput}
                onChange={(e) => setRegexInput(e.target.value)}
                rows={10}
              />
              <div className="tool-action-row">
                <button className="tool-btn" onClick={handleRegexExtractAll}><Wand2 size={14} /> 一键筛选</button>
                <button className="tool-btn" onClick={handleRegexClear}>清空</button>
              </div>
            </div>
            <div className="tool-card">
              <div className="tool-card-header">
                <div className="tool-card-icon"><Check size={18} /></div>
                <div>
                  <h3>筛选结果</h3>
                  <p>合并去重后集中展示</p>
                </div>
              </div>
              <div className="tool-output-box">
                <div className="tool-output-header">
                  <span>结果 D:{regexResult.domains.length} U:{regexResult.urls.length} IP:{regexResult.ips.length}</span>
                  <button className="tool-copy-btn" onClick={() => handleCopy('regex', regexOutput)}>
                    {copiedKey == 'regex' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <pre>{regexOutput || '暂无结果'}</pre>
              </div>
            </div>
          </div>
        </ModuleShell>
      );
    }

    if (activeModule === 'format') {
      return (
        <ModuleShell title="格式化工具" subtitle="JSON 格式化与 curl 命令整理" onBack={() => setActiveModule('')}>
          <div className="tool-split-grid">
            <div className="tool-card">
              <div className="tool-card-header">
                <div className="tool-card-icon"><Braces size={18} /></div>
                <div>
                  <h3>JSON 格式化</h3>
                  <p>快速格式化与压缩，便于查看与复制</p>
                </div>
              </div>
              <textarea
                className="tool-textarea"
                placeholder="粘贴 JSON 内容..."
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                rows={10}
              />
              <div className="tool-action-row">
                <button className="tool-btn" onClick={() => handleJsonFormat(true)}>格式化 JSON</button>
                <button className="tool-btn" onClick={() => handleJsonFormat(false)}>压缩 JSON</button>
                <button className="tool-btn" onClick={handleJsonClear}>清空</button>
              </div>
              {jsonError && <div className="tool-error">{jsonError}</div>}
              <div className="tool-output-box compact">
                <div className="tool-output-header">
                  <span>JSON 结果</span>
                  <button className="tool-copy-btn" onClick={() => handleCopy('json', jsonOutput)}>
                    {copiedKey == 'json' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <pre>{jsonOutput || '等待格式化结果...'}</pre>
              </div>
            </div>
            <div className="tool-card">
              <div className="tool-card-header">
                <div className="tool-card-icon"><RefreshCw size={18} /></div>
                <div>
                  <h3>curl 命令格式化</h3>
                  <p>生成 Bash 与 Windows CMD 的单行命令</p>
                </div>
              </div>
              <textarea
                className="tool-textarea"
                placeholder="粘贴从浏览器复制出来的 curl 命令..."
                value={curlInput}
                onChange={(e) => setCurlInput(e.target.value)}
                rows={10}
              />
              <div className="tool-action-row">
                <button className="tool-btn" onClick={handleCurlFormat}>生成单行命令</button>
                <button className="tool-btn" onClick={handleCurlClear}>清空</button>
              </div>
              <div className="tool-output-box compact">
                <div className="tool-output-header">
                  <span>Bash 单行</span>
                  <button className="tool-copy-btn" onClick={() => handleCopy('curl-bash', curlBashOutput)}>
                    {copiedKey == 'curl-bash' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <pre>{curlBashOutput || '等待 Bash 结果...'}</pre>
              </div>
              <div className="tool-output-box compact">
                <div className="tool-output-header">
                  <span>CMD 单行</span>
                  <button className="tool-copy-btn" onClick={() => handleCopy('curl-cmd', curlCmdOutput)}>
                    {copiedKey == 'curl-cmd' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <pre>{curlCmdOutput || '等待 CMD 结果...'}</pre>
              </div>
            </div>
          </div>
        </ModuleShell>
      );
    }

    if (activeModule === 'time') {
      return (
        <ModuleShell title="时间戳转换" subtitle="秒级 / 毫秒级时间戳与日期互转" onBack={() => setActiveModule('')}>
          <div className="tool-split-grid">
            <div className="tool-card">
              <div className="tool-card-header">
                <div className="tool-card-icon"><Clock3 size={18} /></div>
                <div>
                  <h3>时间戳 ➔ 时间</h3>
                  <p>输入 10 位或 13 位时间戳</p>
                </div>
              </div>
              <div className="tool-input-group">
                <input
                  className="tool-input"
                  type="text"
                  value={timestampInput}
                  onChange={(e) => setTimestampInput(e.target.value)}
                  placeholder="例如: 1712476800000"
                />
                <div className="tool-action-row">
                  <button className="tool-btn primary" onClick={handleTimestampToDate}>转换</button>
                  <button className="tool-btn" onClick={handleFillNowTimestamp}>填入当前</button>
                </div>
              </div>
              <div className="tool-output-box">
                <div className="tool-output-header">
                  <span>本地时间</span>
                  <button className="tool-copy-btn" onClick={() => handleCopy('time-date', timestampOutput)}>
                    {copiedKey == 'time-date' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <pre>{timestampOutput || '等待转换...'}</pre>
              </div>
            </div>

            <div className="tool-card">
              <div className="tool-card-header">
                <div className="tool-card-icon"><Clock3 size={18} /></div>
                <div>
                  <h3>时间 ➔ 时间戳</h3>
                  <p>选择或输入本地日期时间</p>
                </div>
              </div>
              <div className="tool-input-group">
                <input
                  className="tool-input"
                  type="datetime-local"
                  step="1"
                  value={dateTimeInput}
                  onChange={(e) => setDateTimeInput(e.target.value)}
                />
                <div className="tool-action-row">
                  <button className="tool-btn primary" onClick={handleDateToTimestamp}>转换</button>
                  <button className="tool-btn" onClick={handleFillNowDate}>填入当前</button>
                </div>
              </div>
              <div className="tool-output-box">
                <div className="tool-output-header">
                  <span>时间戳 (ms / s)</span>
                  <button className="tool-copy-btn" onClick={() => handleCopy('time-stamp', dateTimeOutput)}>
                    {copiedKey == 'time-stamp' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <pre>{dateTimeOutput || '等待转换...'}</pre>
              </div>
            </div>
          </div>
          {timeError && <div className="tool-error" style={{marginTop: '16px'}}>{timeError}</div>}
        </ModuleShell>
      );
    }

    return (
      <>
        <div className="tools-section-head">
          <div>
            <div className="tools-section-eyebrow">模块导航</div>
            <h2>选择一个工具开始处理</h2>
          </div>
          <p>点击模块进入详情页，快速完成处理并复制结果。</p>
        </div>

        <div className="tools-module-grid">
          {moduleMeta.map((item, index) => (
            <button key={item.id} className="tools-module-card" onClick={() => setActiveModule(item.id)}>
              <div className="tools-module-card-top">
                <div className="tools-module-icon">{item.icon}</div>
                <span className="tools-module-index">{String(index + 1).padStart(2, '0')}</span>
              </div>
              <div className="tools-module-text">
                <h3>{item.title}</h3>
                <p>{item.subtitle}</p>
                <div className="tools-mini-tags">
                  {item.features?.map(f => (
                    <span key={f} className="tools-mini-tag">{f}</span>
                  ))}
                </div>
              </div>
              <div className="tools-module-card-foot">
                <span>进入工具</span>
                <span className="tools-module-card-arrow">→</span>
              </div>
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="tools-page">
      {renderModuleContent()}
    </div>
  );
}

export default Tools;
