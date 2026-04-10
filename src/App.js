import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  CloudOff,
  Database,
  Edit3,
  Home,
  ListTodo,
  LogOut,
  MapPin,
  Minus,
  RefreshCcw,
  RotateCw,
  Save,
  Server,
  Settings2,
  ShieldAlert,
  Square,
  Tag,
  Terminal,
  Wrench,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';
import Login from './Login';
import Tasks from './Tasks';
import Assets from './Assets';
import Tools from './Tools';
import { getNodeStatus, logout } from './api';
import './App.css';

const { ipcRenderer } = window.require('electron');

const defaultNodeConfig = {
  apiBaseUrl: 'http://192.168.0.61:8088',
  aiNodeUrl: '',
  scanNodeConfig: ''
};

const normalizeNodeRows = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.list)) return res.list;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.nodes)) return res.nodes;
  if (Array.isArray(res?.data?.nodes)) return res.data.nodes;
  if (Array.isArray(res?.data?.list)) return res.data.list;
  if (Array.isArray(res?.data?.rows)) return res.data.rows;
  if (Array.isArray(res?.data?.result)) return res.data.result;
  if (Array.isArray(res?.rows)) return res.rows;
  if (Array.isArray(res?.result)) return res.result;
  return [];
};

const getNodeResponseCode = (res) => {
  if (res?.code !== undefined && res?.code !== null && res?.code !== '') return Number(res.code);
  if (res?.data?.code !== undefined && res?.data?.code !== null && res?.data?.code !== '') return Number(res.data.code);
  return null;
};

const getNodeResponseMessage = (res) => {
  return res?.msg || res?.message || res?.error || res?.data?.msg || res?.data?.message || '';
};

const formatPercent = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(1)}%` : '--';
};

const formatNetworkLoad = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return '--';
  if (num >= 1024 * 1024 * 1024) return `${(num / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (num >= 1024 * 1024) return `${(num / 1024 / 1024).toFixed(2)} MB`;
  if (num >= 1024) return `${(num / 1024).toFixed(2)} KB`;
  return `${num} B`;
};

const formatCount = (value) => {
  const num = Number(value) || 0;
  return num.toLocaleString('zh-CN');
};

const NODE_API_KEYS = [
  'fofa.keys',
  'shodan.keys',
  'securitytrails.keys',
  'dnsdumpster.keys'
];

const getDeepValue = (source, path) => {
  if (!source || typeof source !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  return String(path || '').split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object' && Object.prototype.hasOwnProperty.call(acc, key)) {
      return acc[key];
    }
    return undefined;
  }, source);
};

const normalizeNodeApiValues = (value) => {
  if (Array.isArray(value)) {
    return value.map(item => String(item ?? '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [String(value).trim()].filter(Boolean);
};

const getNodeApiPlatformMeta = (key) => {
  const platform = String(key || '').split('.')[0].toLowerCase();
  const mapping = {
    fofa: { label: 'FOFA', short: 'F', className: 'fofa' },
    shodan: { label: 'Shodan', short: 'S', className: 'shodan' },
    securitytrails: { label: 'SecurityTrails', short: 'ST', className: 'securitytrails' },
    dnsdumpster: { label: 'DNSDumpster', short: 'DD', className: 'dnsdumpster' }
  };
  return mapping[platform] || { label: platform || 'Platform', short: 'P', className: 'default' };
};

const normalizeNodeApiRows = (payload) => {
  const rows = normalizeNodeRows(payload);
  return rows.map((row, index) => {
    const configSource = row?.config && typeof row.config === 'object' ? row.config : row;
    const url = String(
      row?.url ||
      row?.nodeIp ||
      row?.nodeUrl ||
      row?.node_url ||
      row?.baseUrl ||
      row?.base_url ||
      row?.node_ip ||
      row?.ip ||
      ''
    ).trim();

    return {
      id: row?.id || row?.node_id || row?.nodeId || row?.node_ip || row?.ip || `node-${index + 1}`,
      name: String(row?.name || row?.nodeName || row?.node_name || row?.node_id || `节点 ${index + 1}`),
      url,
      nodeIp: String(row?.nodeIp || row?.node_ip || row?.nodeUrl || row?.node_url || row?.url || '').trim(),
      raw: row,
      items: NODE_API_KEYS.map((key) => ({
        key,
        values: normalizeNodeApiValues(getDeepValue(configSource, key))
      }))
    };
  });
};

const isTextInput = (element) => {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(element.type || 'text');
};

const findEditableTarget = (target) => {
  if (!(target instanceof HTMLElement)) return null;
  if (isTextInput(target)) return target;
  if (target.isContentEditable) return target;
  return target.closest('input, textarea, [contenteditable="true"]');
};

const getContextSelectionSnapshot = (target) => {
  if (isTextInput(target)) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    return {
      text: target.value.slice(start, end).trim(),
      start,
      end
    };
  }

  const selection = window.getSelection?.();
  return {
    text: String(selection?.toString?.() || '').trim(),
    start: null,
    end: null
  };
};

const selectAllInElement = (element) => {
  if (!element) return;
  if (isTextInput(element)) {
    element.focus();
    element.select();
    return;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }
};

const HomeDashboard = ({ refreshToken = 0 }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({
    taskCount: 0,
    taskDataTotal: 0,
    fingerprintRuleTotal: 0,
    fofaFingerprintDataTotal: 0,
    uniqueIpTotal: 0,
    regionStats: [],
    fingerprintCategoryStats: []
  });

  const barChartRef = useRef(null);
  const pieChartRef = useRef(null);
  const barChartInstance = useRef(null);
  const pieChartInstance = useRef(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await ipcRenderer.invoke('get-home-dashboard-summary');
        if (!mounted) return;
        if (res?.success) {
          setSummary({
            taskCount: res.taskCount || 0,
            taskDataTotal: res.taskDataTotal || 0,
            fingerprintRuleTotal: res.fingerprintRuleTotal || 0,
            fofaFingerprintDataTotal: res.fofaFingerprintDataTotal || 0,
            uniqueIpTotal: res.uniqueIpTotal || 0,
            regionStats: Array.isArray(res.regionStats) ? res.regionStats : [],
            fingerprintCategoryStats: Array.isArray(res.fingerprintCategoryStats) ? res.fingerprintCategoryStats : []
          });
        } else {
          setError(res?.error || '读取首页概览失败');
        }
      } catch (err) {
        if (mounted) setError(err?.message || '读取首页概览失败');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [refreshToken]);

  useEffect(() => {
    if (loading || !window.Chart) return;

    // 清理旧实例
    if (barChartInstance.current) barChartInstance.current.destroy();
    if (pieChartInstance.current) pieChartInstance.current.destroy();

    // 柱状图：地区 IP 统计
    if (barChartRef.current && summary.regionStats.length > 0) {
      const ctx = barChartRef.current.getContext('2d');
      barChartInstance.current = new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels: summary.regionStats.slice(0, 10).map(s => s.name),
          datasets: [{
            label: 'IP 数量',
            data: summary.regionStats.slice(0, 10).map(s => s.value),
            backgroundColor: 'rgba(56, 139, 253, 0.6)',
            borderColor: '#58a6ff',
            borderWidth: 1,
            borderRadius: 999,
            barThickness: 16,
            maxBarThickness: 18,
            hoverBackgroundColor: 'rgba(56, 139, 253, 0.8)'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(13, 17, 23, 0.9)',
              titleColor: '#f0f6fc',
              bodyColor: '#8b949e',
              borderColor: 'rgba(125, 196, 255, 0.2)',
              borderWidth: 1
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(96, 165, 250, 0.08)' },
              ticks: { color: '#8b949e', font: { size: 11 } }
            },
            y: {
              grid: { color: 'rgba(96, 165, 250, 0.06)' },
              ticks: { color: '#c9d1d9', font: { size: 12, weight: '600' } }
            }
          }
        },
        plugins: [{
          id: 'v21-bar-value-labels',
          afterDatasetsDraw(chart) {
            const { ctx } = chart;
            const meta = chart.getDatasetMeta(0);
            ctx.save();
            ctx.fillStyle = '#dbeafe';
            ctx.font = '600 11px "Segoe UI"';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            meta.data.forEach((bar, index) => {
              const value = chart.data.datasets[0].data[index];
              ctx.fillText(String(value), bar.x + 10, bar.y);
            });
            ctx.restore();
          }
        }]
      });
    }

    // 饼图：指纹占比
    if (pieChartRef.current && summary.fingerprintCategoryStats.length > 0) {
      const ctx = pieChartRef.current.getContext('2d');
      const topStats = summary.fingerprintCategoryStats.slice(0, 6);
      const otherCount = summary.fingerprintCategoryStats.slice(6).reduce((sum, s) => sum + s.dataCount, 0);
      
      const labels = topStats.map(s => s.name);
      const data = topStats.map(s => s.dataCount);
      if (otherCount > 0) {
        labels.push('其他');
        data.push(otherCount);
      }

      pieChartInstance.current = new window.Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: [
              'rgba(56, 139, 253, 0.7)',
              'rgba(63, 185, 80, 0.7)',
              'rgba(163, 113, 247, 0.7)',
              'rgba(238, 153, 0, 0.7)',
              'rgba(248, 81, 73, 0.7)',
              'rgba(0, 210, 255, 0.7)',
              'rgba(139, 148, 158, 0.7)'
            ],
            borderColor: 'rgba(13, 17, 23, 1)',
            borderWidth: 2,
            hoverOffset: 10
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#8b949e', font: { size: 11 }, padding: 15, usePointStyle: true, pointStyle: 'circle' }
            },
            tooltip: {
              backgroundColor: 'rgba(13, 17, 23, 0.9)',
              titleColor: '#f0f6fc',
              bodyColor: '#8b949e',
              borderColor: 'rgba(125, 196, 255, 0.2)',
              borderWidth: 1
            }
          }
        }
      });
    }
  }, [loading, summary]);

  return (
    <div className="v21-exe-dashboard">
      {/* 1. 顶部紧凑型工具栏风格统计 */}
      <div className="v21-stat-bar">
        <div className="v21-stat-item">
          <div className="v21-stat-icon blue"><ListTodo size={16} /></div>
          <div className="v21-stat-content">
            <span className="v21-stat-label">任务数量</span>
            <span className="v21-stat-value">{formatCount(summary.taskCount)}</span>
          </div>
        </div>
        <div className="v21-stat-divider"></div>
        <div className="v21-stat-item">
          <div className="v21-stat-icon green"><Database size={16} /></div>
          <div className="v21-stat-content">
            <span className="v21-stat-label">任务数据</span>
            <span className="v21-stat-value">{formatCount(summary.taskDataTotal)}</span>
          </div>
        </div>
        <div className="v21-stat-divider"></div>
        <div className="v21-stat-item">
          <div className="v21-stat-icon purple"><Bot size={16} /></div>
          <div className="v21-stat-content">
            <span className="v21-stat-label">指纹总量</span>
            <span className="v21-stat-value">{formatCount(summary.fingerprintRuleTotal)}</span>
          </div>
        </div>
        <div className="v21-stat-divider"></div>
        <div className="v21-stat-item">
          <div className="v21-stat-icon cyan"><Server size={16} /></div>
          <div className="v21-stat-content">
            <span className="v21-stat-label">IP 总量</span>
            <span className="v21-stat-value">{formatCount(summary.uniqueIpTotal)}</span>
          </div>
        </div>
      </div>

      <div className="v21-dashboard-content">
        <div className="v21-grid-top">
          {/* 2. 左侧：地区分布（Widget 风格） */}
          <section className="v21-widget">
            <div className="v21-widget-header">
              <div className="v21-widget-title">
                <MapPin size={14} />
                <span>地区分布概览</span>
              </div>
              <div className="v21-widget-actions">
                <span className="v21-badge">TOP 10</span>
              </div>
            </div>
            <div className="v21-widget-body chart-box">
              {loading ? (
                <div className="v21-loading-placeholder">正在同步数据...</div>
              ) : (
                <div className="v21-canvas-wrapper">
                  <canvas ref={barChartRef}></canvas>
                </div>
              )}
            </div>
          </section>

          {/* 3. 右侧：指纹分类（Widget 风格） */}
          <section className="v21-widget">
            <div className="v21-widget-header">
              <div className="v21-widget-title">
                <Activity size={14} />
                <span>指纹分类占比</span>
              </div>
            </div>
            <div className="v21-widget-body chart-box">
              {loading ? (
                <div className="v21-loading-placeholder">正在计算分布...</div>
              ) : (
                <div className="v21-fingerprint-overview">
                  {summary.fingerprintCategoryStats.length > 0 ? (
                    summary.fingerprintCategoryStats.slice(0, 6).map((item, index) => (
                      <div key={index} className="v21-fingerprint-overview-item">
                        <div className="v21-fingerprint-overview-head">
                          <div className="v21-fingerprint-overview-name">
                            <span className="v21-fingerprint-overview-dot"></span>
                            <span>{item.name}</span>
                          </div>
                          <span className="v21-fingerprint-overview-value">{formatCount(item.dataCount)}</span>
                        </div>
                        <div className="v21-fingerprint-overview-bar">
                          <div
                            className="v21-fingerprint-overview-fill"
                            style={{ width: `${Math.min(100, (item.dataCount / (summary.fofaFingerprintDataTotal || 1)) * 100)}%` }}
                          ></div>
                        </div>
                        <div className="v21-fingerprint-overview-meta">
                          <span>指纹数量 {formatCount(item.ruleCount)}</span>
                          <span>数据占比 {Math.max(1, Math.round((item.dataCount / (summary.fofaFingerprintDataTotal || 1)) * 100))}%</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="v21-loading-placeholder">暂无分类统计数据</div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* 4. 下方：指纹详细列表（表格风格） */}
        <section className="v21-widget v21-full-widget">
          <div className="v21-widget-header">
            <div className="v21-widget-title">
              <Terminal size={14} />
              <span>FOFA 指纹数据详细汇总</span>
            </div>
            <div className="v21-widget-info">
              共计 {summary.fingerprintCategoryStats.length} 个核心分类
            </div>
          </div>
          <div className="v21-widget-body no-padding">
            <div className="v21-table-container">
              <table className="v21-exe-table">
                <thead>
                  <tr>
                    <th className="v21-col-rank">#</th>
                    <th>指纹分类</th>
                    <th className="text-right">规则数</th>
                    <th className="text-right">数据量</th>
                    <th>数据热度</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.fingerprintCategoryStats.length > 0 ? (
                    summary.fingerprintCategoryStats.map((item, index) => (
                      <tr key={index}>
                        <td><span className="v21-rank-num">{index + 1}</span></td>
                        <td>
                          <div className="v21-cat-cell">
                            <Tag size={12} className="v21-cat-tag" />
                            <span>{item.name}</span>
                          </div>
                        </td>
                        <td className="text-right v21-mono">{formatCount(item.ruleCount)}</td>
                        <td className="text-right v21-mono v21-highlight">{formatCount(item.dataCount)}</td>
                        <td>
                          <div className="v21-heat-bar">
                            <div 
                              className="v21-heat-fill" 
                              style={{ width: `${Math.min(100, (item.dataCount / (summary.fofaFingerprintDataTotal || 1)) * 100)}%` }}
                            ></div>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="v21-empty-state">暂无分类统计数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [systemStatus, setSystemStatus] = useState('IDLE');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [backendOffline, setBackendOffline] = useState(false);
  const [manualOffline, setManualOffline] = useState(false);
  const [syncOverlayVisible, setSyncOverlayVisible] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncStage, setSyncStage] = useState('等待同步启动');
  const [syncPercent, setSyncPercent] = useState(0);
  const [syncRefreshToken, setSyncRefreshToken] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);

  const [showNodeModal, setShowNodeModal] = useState(false);
  const [nodeTab, setNodeTab] = useState('status');
  const [nodeStatusLoading, setNodeStatusLoading] = useState(false);
  const [nodeSaving, setNodeSaving] = useState(false);
  const [nodeApiLoading, setNodeApiLoading] = useState(false);
  const [nodeApiSyncing, setNodeApiSyncing] = useState(false);
  const [nodeApiSaving, setNodeApiSaving] = useState(false);
  const [nodeStatusError, setNodeStatusError] = useState('');
  const [nodeConfigError, setNodeConfigError] = useState('');
  const [nodeApiError, setNodeApiError] = useState('');
  const [nodeApiNotice, setNodeApiNotice] = useState('');
  const [scanNodes, setScanNodes] = useState([]);
  const [nodeApiNodes, setNodeApiNodes] = useState([]);
  const [nodeConfig, setNodeConfig] = useState(defaultNodeConfig);
  const [editingNodeApi, setEditingNodeApi] = useState(null);
  const [editingNodeApiValue, setEditingNodeApiValue] = useState('');
  const nodeModalOpenedAtRef = useRef(0);
  const hasAutoSyncedRef = useRef(false);
  const contextMenuTargetRef = useRef(null);
  const contextMenuSelectionRef = useRef({ text: '', start: null, end: null });
  const [aiNodeStatus, setAiNodeStatus] = useState({
    online: false,
    message: '未检测',
    checkedUrl: '',
    statusCode: '',
    success: true
  });

  useEffect(() => {
    ipcRenderer.invoke('get-ip').then(setLocalIp);
  }, []);

  useEffect(() => {
    let mounted = true;

    const syncOnlineStatus = async () => {
      try {
        const res = await ipcRenderer.invoke('check-backend-online');
        console.log('[App] check-backend-online response =', res);
        if (!mounted) return;
        setBackendOffline(!(res?.success && res?.online));
      } catch (err) {
        console.error('[App] check-backend-online failed =', err);
        if (mounted) setBackendOffline(true);
      }
    };

    syncOnlineStatus();
    const timer = setInterval(syncOnlineStatus, 5000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const closeMenu = () => {
      contextMenuTargetRef.current = null;
      contextMenuSelectionRef.current = { text: '', start: null, end: null };
      setContextMenu(null);
    };

    const handleContextMenu = (event) => {
      const editableTarget = findEditableTarget(event.target);
      const selectionSnapshot = getContextSelectionSnapshot(editableTarget);
      const selectionText = selectionSnapshot.text;
      const isEditable = Boolean(editableTarget);

      if (!isEditable && !selectionText) return;

      event.preventDefault();
      contextMenuTargetRef.current = editableTarget;
      contextMenuSelectionRef.current = selectionSnapshot;

      const width = 176;
      const height = isEditable ? 170 : 118;
      const x = Math.min(window.innerWidth - width - 12, Math.max(12, event.clientX));
      const y = Math.min(window.innerHeight - height - 12, Math.max(12, event.clientY));

      setContextMenu({
        x,
        y,
        isEditable,
        hasSelection: Boolean(
          isEditable
            ? ((editableTarget.selectionStart ?? 0) !== (editableTarget.selectionEnd ?? 0))
            : selectionText
        )
      });
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, []);

  useEffect(() => {
    const handleConnectivityLost = () => {
      setBackendOffline(true);
    };
    const handleConnectivityRestored = () => {
      setBackendOffline(false);
    };
    window.addEventListener('app-connectivity-lost', handleConnectivityLost);
    window.addEventListener('app-connectivity-restored', handleConnectivityRestored);
    return () => {
      window.removeEventListener('app-connectivity-lost', handleConnectivityLost);
      window.removeEventListener('app-connectivity-restored', handleConnectivityRestored);
    };
  }, []);

  const isOffline = backendOffline || manualOffline;
  const canUseRemoteFeatures = isLoggedIn && !isOffline;
  const isSyncBlocking = syncInProgress && syncOverlayVisible && activeTab !== 'tools';
  const showTopSyncProgress = syncInProgress && (!syncOverlayVisible || activeTab === 'tools');

  useEffect(() => {
    if (isOffline) {
      setShowLoginModal(false);
    }
  }, [isOffline]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsLoggedIn(false);
      setUserData(null);
      setSyncInProgress(false);
      setSyncOverlayVisible(false);
      hasAutoSyncedRef.current = false;
      return;
    }

    const now = new Date();
    let storedUser = {};
    try {
      storedUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
    } catch {
      storedUser = {};
    }

    setUserData({
      username: storedUser.username || 'targetuser',
      lastLoginDate: storedUser.lastLoginDate || now.toLocaleDateString(),
      lastLoginTime: storedUser.lastLoginTime || now.toLocaleTimeString(),
      ip: localIp
    });
    setIsLoggedIn(true);
    fetchSystemStatus();
  }, [localIp]);

  useEffect(() => {
    if (!isLoggedIn || isOffline || hasAutoSyncedRef.current) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    hasAutoSyncedRef.current = true;
    runInitialSync(token);
  }, [isLoggedIn, isOffline]);

  const fetchSystemStatus = async () => {
    setSystemStatus('OPERATIONAL');
  };

  const handleLoginSuccess = (data) => {
    const now = new Date();
    const nextUser = {
      ...data,
      lastLoginDate: now.toLocaleDateString(),
      lastLoginTime: now.toLocaleTimeString(),
      ip: localIp
    };
    setUserData(nextUser);
    localStorage.setItem('auth_user', JSON.stringify({
      username: nextUser.username || 'targetuser',
      lastLoginDate: nextUser.lastLoginDate,
      lastLoginTime: nextUser.lastLoginTime
    }));
    setIsLoggedIn(true);
    setShowLoginModal(false);
    fetchSystemStatus();
  };

  const runInitialSync = async (token) => {
    if (!token || isOffline) return;

    const updateProgress = (current, total, stageText) => {
      setSyncStage(stageText);
      setSyncPercent(Math.max(3, Math.min(100, Math.round((current / total) * 100))));
    };

    setSyncInProgress(true);
    setSyncOverlayVisible(true);
    setSyncStage('正在校验云端同步链路');
    setSyncPercent(3);
    setSystemStatus('SYNCING...');

    try {
      updateProgress(0, 2, '正在同步任务列表');
      const taskListRes = await ipcRenderer.invoke('sync-project-list', { token });
      if (!taskListRes?.success) throw new Error(taskListRes?.error || '任务列表同步失败');
      await ipcRenderer.invoke('apply-future-to-now');

      updateProgress(1, 2, '任务列表已同步到本地数据库');
      const fofaListRes = await ipcRenderer.invoke('sync-fofa-project-list', { token });
      if (!fofaListRes?.success) throw new Error(fofaListRes?.error || 'FOFA 规则同步失败');
      await ipcRenderer.invoke('apply-fofa-future-to-now');
      updateProgress(2, 2, 'FOFA 列表已同步到本地数据库');

      setSyncPercent(100);
      setSyncStage('首次登录同步完成，系统已就绪');
      setSyncRefreshToken((value) => value + 1);
      setSystemStatus('OPERATIONAL');
      setTimeout(() => {
        setSyncOverlayVisible(false);
        setSyncInProgress(false);
      }, 500);
    } catch (error) {
      console.error('[App] initial sync failed =', error);
      setSyncStage(error?.message || '首次登录同步失败');
      setSystemStatus('SYNC FAILED');
      setTimeout(() => {
        setSyncOverlayVisible(false);
        setSyncInProgress(false);
      }, 900);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('auth_user');
      setIsLoggedIn(false);
      hasAutoSyncedRef.current = false;
      setSyncInProgress(false);
      setSyncOverlayVisible(false);
      setUserData(null);
      setSystemStatus('IDLE');
    }
  };

  const loadNodeConfig = async () => {
    const res = await ipcRenderer.invoke('get-config');
    console.log('[App] get-config response =', res);
    if (!res?.success) {
      throw new Error(res?.error || '读取节点配置失败');
    }
    const cfg = { ...defaultNodeConfig, ...(res?.config || {}) };
    localStorage.setItem('apiBaseUrl', cfg.apiBaseUrl || defaultNodeConfig.apiBaseUrl);
    setNodeConfig(cfg);
    return cfg;
  };

  const loadNodeStatus = async (configOverride) => {
    setNodeStatusLoading(true);
    setNodeStatusError('');
    try {
      const cfg = configOverride || nodeConfig || defaultNodeConfig;
      console.group('[App] loadNodeStatus');
      console.log('node config =', cfg);

      const [scanRes, aiRes] = await Promise.all([
        getNodeStatus(),
        ipcRenderer.invoke('check-node-online', { url: cfg.aiNodeUrl || '' })
      ]);

      const normalizedRows = normalizeNodeRows(scanRes);
      const responseCode = getNodeResponseCode(scanRes);

      console.log('scan node raw response =', scanRes);
      console.log('scan node normalized rows =', normalizedRows);
      console.log('scan node rows count =', normalizedRows.length);
      console.log('ai node response =', aiRes);
      console.groupEnd();

      if (scanRes?.success === false || responseCode === 500) {
        throw new Error(getNodeResponseMessage(scanRes) || '扫描节点状态获取失败');
      }

      setScanNodes(normalizedRows);
      setAiNodeStatus(
        aiRes?.success === false
          ? {
            online: false,
            message: aiRes?.error || 'AI 节点检测失败',
            checkedUrl: cfg.aiNodeUrl || '',
            statusCode: '',
            success: false
          }
          : {
            online: !!aiRes?.online,
            message: aiRes?.message || (aiRes?.online ? '在线' : '离线'),
            checkedUrl: aiRes?.checkedUrl || cfg.aiNodeUrl || '',
            statusCode: aiRes?.statusCode || '',
            success: true
          }
      );
    } catch (err) {
      console.error('[App] loadNodeStatus failed =', err);
      setNodeStatusError(err?.message || '节点状态加载失败');
      setScanNodes([]);
      setAiNodeStatus({
        online: false,
        message: '检测失败',
        checkedUrl: (configOverride || nodeConfig || defaultNodeConfig).aiNodeUrl || '',
        statusCode: '',
        success: false
      });
    } finally {
      setNodeStatusLoading(false);
    }
  };

  const loadNodeApiConfigs = async () => {
    if (!canUseRemoteFeatures) return;
    setNodeApiLoading(true);
    setNodeApiError('');
    setNodeApiNotice('');
    try {
      const token = localStorage.getItem('token');
      const res = await ipcRenderer.invoke('get-all-node-api-configs', { token });
      if (!res?.success) {
        throw new Error(res?.error || '获取节点 API 配置失败');
      }
      setNodeApiNodes(normalizeNodeApiRows(res.data));
    } catch (err) {
      console.error('[App] loadNodeApiConfigs failed =', err);
      setNodeApiError(err?.message || '获取节点 API 配置失败');
    } finally {
      setNodeApiLoading(false);
    }
  };

  const handleSyncAllNodeKeys = async () => {
    if (!canUseRemoteFeatures) return;
    setNodeApiSyncing(true);
    setNodeApiError('');
    setNodeApiNotice('');
    try {
      const token = localStorage.getItem('token');
      const res = await ipcRenderer.invoke('sync-all-node-keys', { token });
      if (!res?.success) {
        throw new Error(res?.error || '同步所有节点失败');
      }
      await loadNodeApiConfigs();
      setNodeApiNotice('所有节点 API 已同步完成');
    } catch (err) {
      console.error('[App] handleSyncAllNodeKeys failed =', err);
      setNodeApiError(err?.message || '同步所有节点失败');
    } finally {
      setNodeApiSyncing(false);
    }
  };

  const startEditNodeApi = (node, item) => {
    setEditingNodeApi({
      nodeId: node.id,
      url: node.url,
      key: item.key
    });
    setEditingNodeApiValue((item.values || []).join(','));
  };

  const cancelEditNodeApi = () => {
    setEditingNodeApi(null);
    setEditingNodeApiValue('');
  };

  const saveNodeApiValue = async () => {
    if (!editingNodeApi?.url || !editingNodeApi?.key) return;
    setNodeApiSaving(true);
    setNodeApiError('');
    setNodeApiNotice('');
    try {
      const token = localStorage.getItem('token');
      const payload = {
        url: editingNodeApi.url,
        key: editingNodeApi.key,
        value: editingNodeApiValue
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
      };
      const res = await ipcRenderer.invoke('set-node-key', { token, payload });
      if (!res?.success) {
        throw new Error(res?.error || '保存节点 API 失败');
      }
      await loadNodeApiConfigs();
      setNodeApiNotice(`${editingNodeApi.key} ${'\u5df2\u4fdd\u5b58'}`);
      cancelEditNodeApi();
    } catch (err) {
      console.error('[App] saveNodeApiValue failed =', err);
      setNodeApiError(err?.message || '保存节点 API 失败');
    } finally {
      setNodeApiSaving(false);
    }
  };

  const openNodeModal = async () => {
    nodeModalOpenedAtRef.current = Date.now();
    setShowNodeModal(true);
    setNodeTab(canUseRemoteFeatures ? 'status' : 'config');
    setNodeStatusError('');
    setNodeConfigError('');
    setNodeApiError('');
    setNodeApiNotice('');
    cancelEditNodeApi();
    try {
      await loadNodeConfig();
      if (canUseRemoteFeatures) {
        await loadNodeStatus();
      }
    } catch (err) {
      console.error('[App] openNodeModal failed =', err);
      setNodeStatusError(err?.message || '节点状态加载失败');
    }
  };

  const closeNodeModal = () => {
    cancelEditNodeApi();
    setNodeApiNotice('');
    setShowNodeModal(false);
  };

  useEffect(() => {
    if (!showNodeModal || nodeTab !== 'api' || !canUseRemoteFeatures) return;
    if (nodeApiLoading || nodeApiNodes.length > 0) return;
    loadNodeApiConfigs();
  }, [showNodeModal, nodeTab, canUseRemoteFeatures]);

  const handleNodeOverlayMouseDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (Date.now() - nodeModalOpenedAtRef.current < 300) return;
    closeNodeModal();
  };

  const saveNodeConfig = async () => {
    setNodeSaving(true);
    setNodeConfigError('');
    try {
      const normalizedBaseUrl = String(nodeConfig.apiBaseUrl || '').trim().replace(/\/+$/, '');
      if (!/^https?:\/\/[^/\s]+/i.test(normalizedBaseUrl)) {
        throw new Error('请先填写合法的平台接口总路径');
      }
      console.log('[App] save node config payload =', nodeConfig);
      const res = await ipcRenderer.invoke('set-config', { config: { ...nodeConfig, apiBaseUrl: normalizedBaseUrl } });
      console.log('[App] save node config response =', res);
      if (!res?.success) {
        throw new Error(res?.error || '节点配置保存失败');
      }
      const nextConfig = { ...defaultNodeConfig, ...(res?.config || {}) };
      localStorage.setItem('apiBaseUrl', nextConfig.apiBaseUrl || defaultNodeConfig.apiBaseUrl);
      setNodeConfig(nextConfig);
      await loadNodeStatus(nextConfig);
      setNodeTab('status');
    } catch (err) {
      console.error('[App] saveNodeConfig failed =', err);
      setNodeConfigError(err?.message || '节点配置保存失败');
    } finally {
      setNodeSaving(false);
    }
  };

  const toggleLoginModal = () => {
    if (!isLoggedIn && !isOffline) {
      setShowLoginModal(true);
    }
  };

  const toggleOfflineMode = () => {
    setManualOffline(prev => !prev);
  };

  const canUseNodeServices = !!String(nodeConfig.apiBaseUrl || '').trim();

  const winMin = () => ipcRenderer.send('window-min');
  const winMax = () => ipcRenderer.send('window-max');
  const winClose = () => ipcRenderer.send('window-close');
  const winReload = () => ipcRenderer.send('window-reload');
  const winDevTools = () => ipcRenderer.send('window-devtools');

  const handleContextMenuAction = async (action) => {
    const target = contextMenuTargetRef.current;
    const selection = window.getSelection?.();
    const liveSelectedText = String(selection?.toString?.() || '');
    const savedSelection = contextMenuSelectionRef.current;

    try {
      if (action === 'copy') {
        let text = liveSelectedText || savedSelection.text;
        if (target && isTextInput(target)) {
          const liveText = target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0);
          text = liveText || savedSelection.text;
        }
        if (text) await navigator.clipboard.writeText(text);
      }

      if (action === 'cut' && target && isTextInput(target)) {
        const start = savedSelection.start ?? target.selectionStart ?? 0;
        const end = savedSelection.end ?? target.selectionEnd ?? 0;
        const text = target.value.slice(start, end);
        if (text) {
          await navigator.clipboard.writeText(text);
          target.setRangeText('', start, end, 'start');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      if (action === 'paste' && target) {
        const text = await navigator.clipboard.readText();
        if (isTextInput(target)) {
          const start = target.selectionStart ?? 0;
          const end = target.selectionEnd ?? 0;
          target.focus();
          target.setRangeText(text, start, end, 'end');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (target instanceof HTMLElement && target.isContentEditable) {
          target.focus();
          document.execCommand('insertText', false, text);
        }
      }

      if (action === 'selectAll') {
        if (target) {
          selectAllInElement(target);
        } else {
          document.execCommand('selectAll');
        }
      }
    } catch (error) {
      console.error('[App] context menu action failed =', error);
    } finally {
      setContextMenu(null);
    }
  };

  const tabs = [
    { id: 'home', name: '首页', icon: <Home size={20} /> },
    { id: 'tasks', name: '任务', icon: <ListTodo size={20} /> },
    { id: 'assets', name: '资产', icon: <ShieldAlert size={20} /> },
    { id: 'tools', name: '工具', icon: <Wrench size={20} /> }
  ];

  const displaySystemStatus = isOffline ? '离线版本' : (systemStatus === 'OPERATIONAL' ? '运行中' : systemStatus);

  return (
    <div className="app-container">
      <div className="title-bar">
        <div className="user-info-mini">
          <RefreshCcw size={12} className={!isOffline && systemStatus === 'SYNCING...' ? 'spinning' : ''} />
          <span>节点: {isOffline ? '本地模式' : displaySystemStatus}</span>
          {isOffline && <span className="offline-mini-badge"><CloudOff size={12} /> 本地模式</span>}
        </div>

        {showTopSyncProgress && (
          <div className="title-sync-indicator" title={syncStage}>
            <div className="title-sync-meta">
              <span className="title-sync-label">同步中</span>
              <span className="title-sync-stage">{syncStage}</span>
              <span className="title-sync-percent">{syncPercent}%</span>
            </div>
            <div className="title-sync-track">
              <div className="title-sync-bar" style={{ width: `${syncPercent}%` }}></div>
            </div>
          </div>
        )}

        <div className="window-controls">
          <button
            onClick={toggleOfflineMode}
            title={manualOffline ? '退出手动离线模式' : '进入手动离线模式'}
            className={`win-btn network-btn ${isOffline ? 'offline' : 'online'}`}
          >
            {isOffline ? <WifiOff size={14} /> : <Wifi size={14} />}
          </button>
          <button onClick={winDevTools} title="开发者模式" className="win-btn"><Terminal size={14} /></button>
          <button onClick={winReload} title="重载" className="win-btn"><RotateCw size={14} /></button>
          <button onClick={winMin} title="最小化" className="win-btn"><Minus size={14} /></button>
          <button onClick={winMax} title="最大化" className="win-btn"><Square size={12} /></button>
          <button onClick={winClose} title="关闭" className="win-btn close"><X size={14} /></button>
        </div>
      </div>

      <div className="main-layout">
        <aside className="sidebar">
          <div className={`sidebar-logo-clickable ${isOffline ? 'disabled' : ''}`} onClick={toggleLoginModal} title={isOffline ? '当前可查看本地数据，联网后可登录使用在线功能' : '打开登录'}>
            <div className={`logo-icon ${isLoggedIn ? 'logged-in' : ''}`}></div>
          </div>

          {isLoggedIn && userData && (
            <div className="sidebar-profile">
              <div className="user-avatar">
                <img src="https://api.dicebear.com/7.x/bottts/svg?seed=targetuser" alt="avatar" />
              </div>
              <div className="user-details">
                <span className="user-name">{userData.username}</span>
                <div className="user-meta-group">
                  <span className="user-meta-time">{userData.lastLoginDate}</span>
                  <span className="user-meta-time">{userData.lastLoginTime}</span>
                </div>
                <span className="user-meta-ip">{userData.ip}</span>
              </div>
            </div>
          )}

          <nav className="sidebar-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                disabled={syncInProgress && tab.id !== 'tools'}
                title={tab.id === 'tasks' ? '任务' : tab.name}
              >
                <div className="nav-icon-wrapper">
                  {tab.icon}
                </div>
                <span className="nav-label">{tab.name}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer" style={syncInProgress ? { pointerEvents: 'none', opacity: 0.45 } : undefined}>
            <button className={`node-button ${isOffline ? 'offline' : ''}`} onClick={(e) => { e.stopPropagation(); openNodeModal(); }} title="节点">
              <Server size={18} />
              <span className="node-button-label">节点</span>
            </button>
            {isLoggedIn && (
              <button className="logout-button" onClick={handleLogout} title={isOffline ? '本地模式下不可退出登录' : '退出系统'} disabled={isOffline}>
                <LogOut size={20} />
              </button>
            )}
          </div>
        </aside>

        <main className="content-area">
          <div className="content-header">
            <h2 className="content-title">
              {tabs.find(t => t.id === activeTab)?.name}
            </h2>
            {isOffline && (
              <div className="offline-status-banner">
                <CloudOff size={16} />
                <span className="offline-status-dot"></span>
                <span>{manualOffline ? '当前为手动本地模式，在线功能已暂停，但本地任务、资产和 FOFA 数据仍可继续查看' : '当前网络不可用，在线功能暂不可用，但本地任务、资产和 FOFA 数据仍可正常查看'}</span>
              </div>
            )}
          </div>
          <div className="content-body">
            {activeTab === 'home' ? (
              <HomeDashboard refreshToken={syncRefreshToken} />
            ) : activeTab === 'tasks' ? (
              <Tasks isOffline={isOffline} canUseRemoteFeatures={canUseRemoteFeatures} refreshToken={syncRefreshToken} />
            ) : activeTab === 'assets' ? (
              <Assets isOffline={isOffline} canUseRemoteFeatures={canUseRemoteFeatures} refreshToken={syncRefreshToken} />
            ) : activeTab === 'tools' ? (
              <Tools />
            ) : (
              <div className="empty-state">
                <div className="tech-placeholder">
                  <div className="scanner-line"></div>
                  <p>{isOffline ? '当前为本地模式，可继续查看本地数据' : '系统已授权，正在运行...'}</p>
                </div>
              </div>
            )}
          </div>
          {isSyncBlocking && (
            <div className="initial-sync-overlay">
              <div className="initial-sync-panel">
                <div className="initial-sync-ring">
                  <RefreshCcw size={28} className="spinning" />
                </div>
                <div className="initial-sync-text">
          <h3>首次登录同步中</h3>
          <p>{syncStage}</p>
        </div>
        <button className="initial-sync-dismiss" onClick={() => setSyncOverlayVisible(false)} title="收起同步面板">
          <X size={16} />
        </button>
        <div className="initial-sync-progress">
          <div className="initial-sync-progress-bar" style={{ width: `${syncPercent}%` }}></div>
        </div>
        <div className="initial-sync-meta">
          <span>{syncPercent}%</span>
          <span>工具箱可继续使用，其他功能同步完成后恢复</span>
        </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <Login isOffline={isOffline} onLoginSuccess={handleLoginSuccess} onClose={() => setShowLoginModal(false)} />
          </div>
        </div>
      )}

      {contextMenu && (
        <div className="web-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(e) => e.preventDefault()}>
          {contextMenu.isEditable && (
            <button
              className="web-context-menu-item"
              disabled={!contextMenu.hasSelection}
              onClick={() => handleContextMenuAction('cut')}
            >
              剪切
            </button>
          )}
          <button
            className="web-context-menu-item"
            disabled={!contextMenu.hasSelection}
            onClick={() => handleContextMenuAction('copy')}
          >
            复制
          </button>
          {contextMenu.isEditable && (
            <button className="web-context-menu-item" onClick={() => handleContextMenuAction('paste')}>
              粘贴
            </button>
          )}
          <div className="web-context-menu-separator"></div>
          <button className="web-context-menu-item" onClick={() => handleContextMenuAction('selectAll')}>
            全选
          </button>
        </div>
      )}

      {showNodeModal && (
        <div className="v10-modal-overlay" onMouseDown={handleNodeOverlayMouseDown}>
          <div className="v10-modal info node-center-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">节点中心</div>
        </div>
            <div className="modal-body">
              <div className="node-center-tabs">
                <button className={`node-center-tab ${nodeTab === 'status' ? 'active' : ''}`} onClick={() => setNodeTab('status')}>
                  <Activity size={14} />
                  <span>节点状态</span>
                </button>
                <button className={`node-center-tab ${nodeTab === 'config' ? 'active' : ''}`} onClick={() => setNodeTab('config')}>
                  <Settings2 size={14} />
                  <span>节点配置</span>
                </button>
                <button
                  className={`node-center-tab ${nodeTab === 'api' ? 'active' : ''}`}
                  onClick={() => canUseRemoteFeatures && setNodeTab('api')}
                  disabled={!canUseRemoteFeatures}
                  title={canUseRemoteFeatures ? '节点 API 管理' : '仅在线情况下可用'}
                >
                  <Database size={14} />
                  <span>节点API管理</span>
                </button>
              </div>

              {nodeTab === 'status' ? (
                <div className="node-center-panel">
                  <div className="node-center-toolbar">
                    <div className="node-center-hint">{canUseNodeServices ? '扫描节点展示多个节点状态，AI 节点只判断是否在线' : '请先在节点配置里设置平台接口总路径'}</div>
                    <button className="node-refresh-btn" onClick={() => loadNodeStatus()} disabled={nodeStatusLoading || !canUseNodeServices}>
                      <RefreshCcw size={14} className={nodeStatusLoading ? 'spinning' : ''} />
                      <span>刷新状态</span>
                    </button>
                  </div>

                  {nodeStatusError && <div className="node-error-banner">{nodeStatusError}</div>}



                  <div className="node-status-section">
                    <div className="node-section-title">
                    <Server size={16} />
                    <span>扫描节点</span>
                  </div>
                    {nodeStatusLoading && scanNodes.length === 0 ? (
                      <div className="node-empty-state">{'\u8282\u70b9\u72b6\u6001\u52a0\u8f7d\u4e2d...'}</div>
                    ) : scanNodes.length === 0 ? (
                      <div className="node-empty-state">{'\u672a\u83b7\u53d6\u5230\u626b\u63cf\u8282\u70b9\u6570\u636e\uff0c\u8bf7\u67e5\u770b\u63a7\u5236\u53f0\u65e5\u5fd7'}</div>
                    ) : (
                      <div className={`node-status-grid-shell ${nodeStatusLoading ? 'is-loading' : ''}`}>
                        {nodeStatusLoading && (
                          <div className="node-status-grid-overlay">
                            <RefreshCcw size={16} className="spinning" />
                            <span>{'\u5237\u65b0\u8282\u70b9\u72b6\u6001\u4e2d...'}</span>
                          </div>
                        )}
                        <div className="node-status-grid">
                          {scanNodes.map((node, index) => {
                            const isIdle = String(node.status || '').includes('\u7a7a\u95f2') || String(node.status || '').toLowerCase().includes('idle');
                            return (
                              <div className="node-status-card" key={node.node_id || node.node_ip || index}>
                                <div className="node-card-head">
                                  <div>
                                    <div className="node-card-name">{node.node_ip || `\u626b\u63cf\u8282\u70b9 ${index + 1}`}</div>
                                    <div className="node-card-sub">{node.node_id || '\u672a\u8fd4\u56de\u8282\u70b9\u7f16\u53f7'}</div>
                                  </div>
                                  <span className={`node-status-pill ${isIdle ? 'online' : 'busy'}`}>
                                    {node.status || '\u672a\u77e5'}
                                  </span>
                                </div>
                                <div className="node-card-metrics">
                                  <div className="node-metric">
                                    <span className="label">{'\u8fd0\u884c\u4efb\u52a1'}</span>
                                    <span className="value">{node.running_tasks ?? 0}</span>
                                  </div>
                                  <div className="node-metric">
                                    <span className="label">{'CPU \u4f7f\u7528\u7387'}</span>
                                    <span className="value">{formatPercent(node.cpu_usage)}</span>
                                  </div>
                                  <div className="node-metric">
                                    <span className="label">{'\u5185\u5b58\u4f7f\u7528\u7387'}</span>
                                    <span className="value">{formatPercent(node.memory_usage)}</span>
                                  </div>
                                  <div className="node-metric">
                                    <span className="label">{'\u7f51\u7edc\u8d1f\u8f7d'}</span>
                                    <span className="value">{formatNetworkLoad(node.network_load)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="node-status-section">
                    <div className="node-section-title">
                      <Bot size={16} />
                      <span>AI 节点</span>
                    </div>
                    <div className={`node-status-card ${aiNodeStatus.online ? 'online' : 'offline'}`}>
                      <div className="node-card-head">
                        <div>
                          <div className="node-card-name">AI 服务</div>
                          <div className="node-card-sub">{aiNodeStatus.checkedUrl || '未配置检测地址'}</div>
                        </div>
                        <span className={`node-status-pill ${aiNodeStatus.online ? 'online' : 'offline'}`}>
                          {aiNodeStatus.online ? '在线' : '离线'}
                        </span>
                      </div>
                      <div className="node-card-metrics single">
                        <div className="node-metric">
                          <span className="label">检测结果</span>
                          <span className="value">{aiNodeStatus.message || '--'}</span>
                        </div>
                        <div className="node-metric">
                          <span className="label">状态码</span>
                          <span className="value">{aiNodeStatus.statusCode || '--'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : nodeTab === 'api' ? (
                <div className="node-center-panel">
                  <div className="node-center-toolbar">
                    <div className="node-center-hint">查询所有扫描节点的 API 配置，支持同步全部节点，且每个平台 key 只能单独修改。</div>
                    <div className="node-api-toolbar-actions">
                      <button className="node-refresh-btn sync-all" onClick={handleSyncAllNodeKeys} disabled={nodeApiSyncing || nodeApiLoading || !canUseRemoteFeatures}>
                        <RotateCw size={14} className={nodeApiSyncing ? 'spinning' : ''} />
                        <span>{nodeApiSyncing ? '同步中...' : '同步所有节点'}</span>
                      </button>
                      <button className="node-refresh-btn" onClick={loadNodeApiConfigs} disabled={nodeApiLoading || !canUseRemoteFeatures}>
                        <RefreshCcw size={14} className={nodeApiLoading ? 'spinning' : ''} />
                        <span>{nodeApiLoading ? '加载中...' : '刷新列表'}</span>
                      </button>
                    </div>
                  </div>

                  {nodeApiError && <div className="node-error-banner">{nodeApiError}</div>}
                  {nodeApiNotice && <div className="node-success-banner">{nodeApiNotice}</div>}

                  {nodeApiLoading && nodeApiNodes.length === 0 ? (
                    <div className="node-empty-state">节点 API 配置加载中...</div>
                  ) : nodeApiNodes.length === 0 ? (
                    <div className="node-empty-state">未获取到节点 API 配置数据</div>
                  ) : (
                    <div className={`node-api-grid-shell ${nodeApiLoading ? 'is-loading' : ''}`}>
                      {nodeApiLoading && (
                        <div className="node-api-grid-overlay">
                          <RefreshCcw size={16} className="spinning" />
                          <span>刷新节点 API 中...</span>
                        </div>
                      )}
                    <div className="node-api-grid">
                      {nodeApiNodes.map((node) => (
                        <div className="node-api-card" key={node.id}>
                          <div className="node-card-head">
                            <div>
                              <div className="node-card-name">{node.name}</div>
                              <div className="node-card-sub node-api-address">{node.nodeIp || node.url || '\u672a\u8fd4\u56de\u8282\u70b9\u5730\u5740'}</div>
                            </div>
                            <span className="node-status-pill online">在线节点</span>
                          </div>

                          <div className="node-api-list">
                            {node.items.map((item) => {
                              const isEditing = editingNodeApi?.nodeId === node.id && editingNodeApi?.key === item.key;
                              const platformMeta = getNodeApiPlatformMeta(item.key);
                              return (
                                <div className="node-api-item" key={`${node.id}-${item.key}`}>
                                  <div className="node-api-item-head">
                                    <div className="node-api-item-title">
                                      <span className={`node-api-platform-badge ${platformMeta.className}`}>{platformMeta.short}</span>
                                      <div className="node-api-title-copy">
                                        <span className="node-api-platform-name">{platformMeta.label}</span>
                                      </div>
                                    </div>
                                    {!isEditing && (
                                      <button className="node-api-edit-btn" onClick={() => startEditNodeApi(node, item)} title="修改该平台 key">
                                        <Edit3 size={14} />
                                      </button>
                                    )}
                                  </div>

                                  {isEditing ? (
                                    <div className="node-api-editing">
                                      <input
                                        type="text"
                                        value={editingNodeApiValue}
                                        placeholder="多个 key 用逗号分隔"
                                        onChange={(e) => setEditingNodeApiValue(e.target.value)}
                                      />
                                      <div className="node-api-edit-actions">
                                        <button className="node-api-mini-btn primary" onClick={saveNodeApiValue} disabled={nodeApiSaving}>
                                          {nodeApiSaving ? '保存中...' : '保存'}
                                        </button>
                                        <button className="node-api-mini-btn" onClick={cancelEditNodeApi} disabled={nodeApiSaving}>
                                          取消
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="node-api-values">
                                      {item.values.length > 0 ? item.values.map((value, index) => (
                                        <span className="node-api-value-chip" key={`${item.key}-${index}-${value}`}>{value}</span>
                                      )) : (
                                        <span className="node-api-empty-text">未配置</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="node-center-panel">
                  <div className="node-config-grid">
                    <div className="v15-form-group">
                      <label>平台接口总路径</label>
                      <input
                        type="text"
                        placeholder="例如: http://127.0.0.1:8000"
                        value={nodeConfig.apiBaseUrl || ''}
                        onChange={e => setNodeConfig(prev => ({ ...prev, apiBaseUrl: e.target.value }))}
                      />

                    </div>
                    <div className="v15-form-group">
                      <label>AI 节点地址</label>
                      <input
                        type="text"
                        placeholder="例如: http://127.0.0.1:8000/health"
                        value={nodeConfig.aiNodeUrl || ''}
                        onChange={e => setNodeConfig(prev => ({ ...prev, aiNodeUrl: e.target.value }))}
                      />
                    </div>
                    <div className="v15-form-group">
                      <label>扫描节点配置</label>
                      <textarea
                        rows={4}
                        placeholder="预留配置项，当前先保留此区域"
                        value={nodeConfig.scanNodeConfig || ''}
                        onChange={e => setNodeConfig(prev => ({ ...prev, scanNodeConfig: e.target.value }))}
                      />
                    </div>
                  </div>
                  {nodeConfigError && <div className="node-error-banner">{nodeConfigError}</div>}
                </div>
              )}
            </div>
            <div className="modal-actions">
              {nodeTab === 'config' ? (
                <button className="modal-btn primary" onClick={saveNodeConfig} disabled={nodeSaving}>
                  <Save size={14} />
                  <span>{nodeSaving ? '保存中...' : '保存配置'}</span>
                </button>
              ) : nodeTab === 'api' ? (
                <button className="modal-btn primary" onClick={loadNodeApiConfigs} disabled={nodeApiLoading || nodeApiSyncing}>
                  <RefreshCcw size={14} className={nodeApiLoading ? 'spinning' : ''} />
                  <span>{nodeApiLoading ? '加载中...' : '刷新节点API'}</span>
                </button>
              ) : (
                <button className="modal-btn primary" onClick={() => loadNodeStatus()} disabled={nodeStatusLoading}>
                  <RefreshCcw size={14} className={nodeStatusLoading ? 'spinning' : ''} />
                  <span>{nodeStatusLoading ? '刷新中...' : '刷新状态'}</span>
                </button>
              )}
              <button className="modal-btn ghost" onClick={closeNodeModal} disabled={nodeSaving || nodeStatusLoading || nodeApiSaving || nodeApiSyncing}>
                关闭
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default App;
