import React, { useState, useEffect, useRef } from 'react';
import { Home, Fingerprint, Search, Loader2, FolderGit2, CheckCircle2, Play, RefreshCw, Cpu, ShieldAlert, Activity, Clipboard, Check, ArrowLeft, Globe, Database, Server, MapPin, Tag, Download, Upload, CloudDownload, HardDrive, HelpCircle, Info, Trash2, LayoutGrid, Folder, ChevronRight, ChevronDown, Plus, Edit, Pin, Palette, Clock } from 'lucide-react';
import './App.css';

const AssetsHome = () => (
  <div className="v15-home-dashboard">
    <div className="v15-hero-section">
      <div className="v15-hero-content">
        <h1 className="v15-hero-title">下一代资产情报分析引擎</h1>
        <p className="v15-hero-subtitle">基于大模型驱动的自动化资产梳理、风险评估与深度关联分析。</p>
        <div className="v15-hero-badges">
          <span className="v15-badge"><Activity size={14} /> 实时监控预留</span>
          <span className="v15-badge"><ShieldAlert size={14} /> 风险感知预留</span>
        </div>
      </div>
      <div className="v15-hero-graphic">
        <div className="v15-cyber-circle">
          <div className="v15-cyber-inner">AI</div>
        </div>
      </div>
    </div>
  </div>
);

const getActionNoticeMeta = (variant) => {
  if (variant === 'success') {
    return {
      title: '同步完成',
      icon: <CheckCircle2 size={16} />
    };
  }

  if (variant === 'error') {
    return {
      title: '操作失败',
      icon: <ShieldAlert size={16} />
    };
  }

  return {
    title: '处理中',
    icon: <Loader2 size={16} className="spinning" />
  };
};

const ActionNoticeToast = ({ notice }) => {
  if (!notice) return null;

  const meta = getActionNoticeMeta(notice.variant);

  return (
    <div className={`v15-action-notice ${notice.variant}`} role="status" aria-live="polite">
      <div className="v15-action-notice-icon">
        {meta.icon}
      </div>
      <div className="v15-action-notice-copy">
        <strong>{meta.title}</strong>
        <span>{notice.text}</span>
      </div>
    </div>
  );
};

const FaviconImage = ({ host }) => {
  const [src, setSrc] = useState(null);
  const { ipcRenderer } = window.require('electron');

  useEffect(() => {
    if (!host) return;
    let isMounted = true;
    const loadFavicon = async () => {
      try {
        const cached = await ipcRenderer.invoke('get-favicon', { host });
        if (cached?.success && cached.dataUrl && isMounted) {
          setSrc(cached.dataUrl);
          return;
        }

        const googleUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${host}`;
        const resp = await fetch(googleUrl);
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (isMounted) {
            const base64 = reader.result;
            setSrc(base64);
            ipcRenderer.invoke('save-favicon', { host, dataUrl: base64 });
          }
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        if (isMounted) setSrc(null);
      }
    };
    loadFavicon();
    return () => { isMounted = false; };
  }, [host]);

  return (
    <div className="v15-favicon-box">
      {src ? <img src={src} alt="" /> : <Globe size={14} className="text-dim" />}
    </div>
  );
};

const FingerprintLibrary = ({ onViewDetails, isOffline = false, canUseRemoteFeatures = false, refreshToken = 0 }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayMode, setDisplayMode] = useState('grid'); // 'grid' or 'folder'
  const [expandedFolders, setExpandedFolders] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [itemSyncingStatus, setItemSyncingStatus] = useState({});
  const [actionNotice, setActionNotice] = useState(null);
  const noticeTimerRef = useRef(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [categoryManagerVisible, setCategoryManagerVisible] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null); // ID of item whose category is being edited
  const [activePaletteId, setActivePaletteId] = useState(null); // ID of item whose palette is open
  const [categories, setCategories] = useState(() => {
    const saved = localStorage.getItem('fofa_categories');
    return saved ? JSON.parse(saved) : ["邮服", "vpn", "php", "java", "asp"];
  });
  const [newCategory, setNewCategory] = useState('');
  const [newProject, setNewProject] = useState({ projectName: '', category: '', remark: '', url: '', country: '', taskPriority: '3', days: 0 });
  const { ipcRenderer } = window.require('electron');
  const remoteAccessMessage = isOffline
    ? '当前网络不可用，云端功能暂不可用，但本地数据仍可正常查看'
    : '请先登录后再使用云端同步、新增和删除功能';

  const presetColors = [
    { name: '默认', value: '' },
    { name: '红色', value: '#f85149' },
    { name: '蓝色', value: '#58a6ff' },
    { name: '绿色', value: '#2ea043' },
    { name: '紫色', value: '#bc8cff' },
    { name: '橙色', value: '#ffa657' }
  ];

  useEffect(() => {
    localStorage.setItem('fofa_categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActivePaletteId(null);
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const pushActionNotice = (variant, text) => {
    setActionNotice({ variant, text, key: Date.now() });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setActionNotice(null);
    }, 2600);
  };

  // Modal states
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmOkText, setConfirmOkText] = useState('确定');
  const [confirmCancelText, setConfirmCancelText] = useState('取消');
  const [confirmOnOk, setConfirmOnOk] = useState(() => () => { });
  const [confirmOnCancel, setConfirmOnCancel] = useState(null);
  const [confirmOnExtra, setConfirmOnExtra] = useState(null);
  const [confirmShowCancel, setConfirmShowCancel] = useState(true);
  const [confirmExtraText, setConfirmExtraText] = useState('');
  const [confirmShowExtra, setConfirmShowExtra] = useState(false);
  const [confirmExtraClass, setConfirmExtraClass] = useState('danger');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmVariant, setConfirmVariant] = useState('info');

  const openModal = ({
    title,
    message,
    okText = '确定',
    cancelText = '取消',
    extraText = '',
    showCancel = true,
    showExtra = false,
    extraClass = 'danger',
    variant = 'info',
    onOk = () => { },
    onCancel = null,
    onExtra = null,
  }) => {
    setConfirmTitle(title || '');
    setConfirmMessage(message || '');
    setConfirmVariant(variant);
    setConfirmOkText(okText);
    setConfirmCancelText(cancelText);
    setConfirmExtraText(extraText);
    setConfirmShowCancel(showCancel);
    setConfirmShowExtra(showExtra);
    setConfirmExtraClass(extraClass);
    setConfirmOnOk(() => onOk);
    setConfirmOnCancel(() => onCancel);
    setConfirmOnExtra(() => onExtra);
    setConfirmVisible(true);
  };

  const ensureRemoteAccess = () => {
    if (canUseRemoteFeatures) return true;
    openModal({
      title: '云端功能不可用',
      message: remoteAccessMessage,
      variant: 'error',
      showCancel: false
    });
    return false;
  };

  useEffect(() => {
    fetchFingerprints();
  }, []);

  useEffect(() => {
    if (!refreshToken) return;
    fetchFingerprints(false);
  }, [refreshToken]);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const fetchFingerprints = async (forceSync = false) => {
    setLoading(true);
    setError(null);
    try {
      const localRes = await ipcRenderer.invoke('get-fofa-projects');
      if (localRes.success && localRes.rows.length > 0 && !forceSync) {
        setData(localRes.rows);
      } else if (forceSync || localRes.rows.length === 0) {
        await handleCloudSync();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCloudSync = async () => {
    if (!ensureRemoteAccess()) return;
    if (false) {
      openModal({ title: '离线版本', message: '当前为离线版本，云端同步不可用', variant: 'error', showCancel: false });
      return;
    }
    if (isCloudSyncing) return;

    openModal({
      title: '云端同步确认',
      message: '即将同步云数据，覆盖本地数据，是否进行？',
      variant: 'info',
      onOk: async () => {
        setIsCloudSyncing(true);
        pushActionNotice('info', '正在拉取云端指纹库数据...');
        try {
          const token = localStorage.getItem('token');
          const syncRes = await ipcRenderer.invoke('sync-fofa-project-list', { token });
          if (syncRes.success) {
            await ipcRenderer.invoke('apply-fofa-future-to-now');
            const finalRes = await ipcRenderer.invoke('get-fofa-projects');
            if (finalRes.success) {
              setData(finalRes.rows);
              pushActionNotice('success', `云端同步完成，已更新 ${finalRes.rows?.length || 0} 条规则`);
            }
          } else {
            pushActionNotice('error', syncRes.error || '云端同步失败');
            openModal({
              title: '同步失败',
              message: '同步过程中发生错误: ' + syncRes.error,
              variant: 'error',
              showCancel: false
            });
          }
        } catch (e) {
          pushActionNotice('error', e.message || '云端同步异常');
          openModal({
            title: '同步异常',
            message: e.message,
            variant: 'error',
            showCancel: false
          });
        } finally {
          setIsCloudSyncing(false);
        }
      }
    });
  };

  const handleDataBackup = async () => {
    setIsBackingUp(true);
    try {
      const backupResult = await ipcRenderer.invoke('backup-fofa-now-to-past');
      if (backupResult.success) {
        openModal({
          title: '数据备份完成',
          message: '已完成本地指纹库快照备份。\n是否导出指纹库配置以便在其他客户端导入？',
          variant: 'success',
          okText: '导出配置',
          cancelText: '不导出',
          showCancel: true,
          onOk: async () => {
            const exportResult = await ipcRenderer.invoke('export-fofa-data');
            if (exportResult.success && !exportResult.canceled) {
              openModal({
                title: '导出成功',
                message: `成功导出 ${exportResult.count} 条指纹规则。\n文件路径：${exportResult.path}`,
                variant: 'success',
                okText: '知道了',
                showCancel: false
              });
            } else if (!exportResult.success && !exportResult.canceled) {
              openModal({
                title: '导出失败',
                message: `原因：${exportResult.error}`,
                variant: 'error',
                okText: '知道了',
                showCancel: false
              });
            }
          }
        });
      } else {
        openModal({
          title: '数据备份失败',
          message: '原因：' + backupResult.error,
          variant: 'error',
          okText: '知道了',
          showCancel: false
        });
      }
    } catch (e) {
      openModal({ title: '备份异常', message: e.message, variant: 'error', showCancel: false });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDataImport = async () => {
    try {
      const res = await ipcRenderer.invoke('import-fofa-data');
      if (res.success) {
        openModal({
          title: '导入成功',
          message: `已成功导入并覆盖 ${res.count} 条指纹规则。\n说明：该操作仅恢复指纹库列表，不包含详细资产数据。`,
          showCancel: false,
          variant: 'success'
        });
        fetchFingerprints();
      } else if (!res.canceled) {
        openModal({
          title: '导入失败',
          message: res.error,
          variant: 'error',
          showCancel: false
        });
      }
    } catch (e) {
      openModal({ title: '导入异常', message: e.message, variant: 'error', showCancel: false });
    }
  };

  const handleDeleteFingerprint = async (projectId) => {
    if (!ensureRemoteAccess()) return;
    if (false) {
      openModal({ title: '离线版本', message: '当前为离线版本，删除指纹规则不可用', variant: 'error', showCancel: false });
      return;
    }
    openModal({
      title: '确认删除',
      message: `确定要删除该指纹规则 (ID: ${projectId}) 及其关联的所有资产数据吗？\n此操作不可撤销。`,
      variant: 'error',
      okText: '确认删除',
      onOk: async () => {
        try {
          const res = await ipcRenderer.invoke('delete-task', { projectId });
          if (res.success) {
            setData(prev => prev.filter(item => item.id !== projectId));
          } else {
            openModal({ title: '删除失败', message: res.error, variant: 'error', showCancel: false });
          }
        } catch (e) {
          openModal({ title: '删除异常', message: e.message, variant: 'error', showCancel: false });
        }
      }
    });
  };

  const handleSingleFofaCloudSync = async (projectId) => {
    if (!ensureRemoteAccess()) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    setItemSyncingStatus(prev => ({ ...prev, [projectId]: 'syncing' }));
    pushActionNotice('info', `正在同步 FOFA 任务 ${projectId}...`);
    try {
      const syncRes = await ipcRenderer.invoke('sync-fofa-task-detail', { projectId, token, force: true });
      if (!syncRes?.success) {
        setItemSyncingStatus(prev => ({ ...prev, [projectId]: 'error' }));
        pushActionNotice('error', syncRes?.error || '指定 FOFA 任务云同步失败');
        openModal({
          title: '云同步失败',
          message: syncRes?.error || '指定 FOFA 任务云同步失败',
          variant: 'error',
          showCancel: false
        });
        return;
      }
      setItemSyncingStatus(prev => ({ ...prev, [projectId]: 'done' }));
      pushActionNotice('success', `FOFA 任务 ${projectId} 同步完成`);
    } catch (e) {
      setItemSyncingStatus(prev => ({ ...prev, [projectId]: 'error' }));
      pushActionNotice('error', e?.message || '指定 FOFA 任务云同步异常');
      openModal({
        title: '云同步异常',
        message: e?.message || '指定 FOFA 任务云同步异常',
        variant: 'error',
        showCancel: false
      });
    }
  };

  const performLocalDeleteFingerprint = async (projectId) => {
    try {
      const res = await ipcRenderer.invoke('delete-task', { projectId });
      if (!res?.success) {
        openModal({
          title: '删除失败',
          message: res?.error || '本地删除失败，请稍后重试',
          variant: 'error',
          showCancel: false
        });
        return false;
      }
      setData(prev => prev.filter(item => item.id !== projectId));
      return true;
    } catch (e) {
      openModal({
        title: '删除异常',
        message: e?.message || '本地删除时发生异常',
        variant: 'error',
        showCancel: false
      });
      return false;
    }
  };

  const confirmDeleteFingerprint = (projectId, mode) => {
    const isCloudDelete = mode === 'cloud';
    openModal({
      title: isCloudDelete ? '确认本地和云端删除' : '确认本地删除',
      message: isCloudDelete
        ? `确定要删除该 FOFA 规则 (ID: ${projectId}) 吗？\n这会先删除云端任务，再清理本地缓存数据。\n此操作不可撤销。`
        : `确定要删除该 FOFA 规则 (ID: ${projectId}) 的本地缓存数据吗？\n云端规则将保留。\n此操作不可撤销。`,
      variant: 'error',
      okText: '确认删除',
      showCancel: true,
      onOk: async () => {
        if (isCloudDelete) {
          if (!canUseRemoteFeatures) {
            openModal({
              title: '云端删除不可用',
              message: remoteAccessMessage,
              variant: 'error',
              showCancel: false
            });
            return;
          }
          const token = localStorage.getItem('token');
          try {
            const remoteResult = await ipcRenderer.invoke('delete-task-remote', { projectId, token });
            if (!remoteResult?.success) {
              openModal({
                title: '云端删除失败',
                message: remoteResult?.error || remoteResult?.msg || '云端删除失败，请稍后重试',
                variant: 'error',
                showCancel: false
              });
              return;
            }
          } catch (e) {
            openModal({
              title: '云端删除异常',
              message: e?.message || '调用云端删除接口时发生异常',
              variant: 'error',
              showCancel: false
            });
            return;
          }
        }

        const ok = await performLocalDeleteFingerprint(projectId);
        if (!ok) return;

        openModal({
          title: '删除成功',
          message: isCloudDelete
            ? '已完成云端删除，并清理本地缓存数据'
            : '已删除本地缓存数据，云端规则保留',
          variant: 'success',
          showCancel: false
        });
      }
    });
  };

  const startDeleteFingerprintFlow = async (projectId) => {
    if (canUseRemoteFeatures) {
      openModal({
        title: '选择删除方式',
        message: `请选择该 FOFA 规则 (ID: ${projectId}) 的删除方式。\n本地删除仅清理当前设备缓存；本地和云删除会同时删除云端规则。`,
        variant: 'info',
        okText: '本地删除',
        cancelText: '取消',
        extraText: '本地云删除',
        showCancel: true,
        showExtra: true,
        extraClass: 'danger',
        onOk: () => confirmDeleteFingerprint(projectId, 'local'),
        onExtra: () => confirmDeleteFingerprint(projectId, 'cloud')
      });
      return;
    }

    openModal({
      title: '选择删除方式',
      message: `当前仅可执行本地删除。\n该 FOFA 规则 (ID: ${projectId}) 的云端删除需要联网并登录后才能使用。`,
      variant: 'info',
      okText: '本地删除',
      cancelText: '取消',
      showCancel: true,
      onOk: () => confirmDeleteFingerprint(projectId, 'local')
    });
  };

  const toggleFolder = (folderName) => {
    setExpandedFolders(prev => {
      const next = { ...prev, [folderName]: !prev[folderName] };
      return next;
    });
  };

  const handleAddRule = () => {
    if (!ensureRemoteAccess()) return;
    if (false) {
      openModal({ title: '离线版本', message: '当前网络不可用，离线版本不支持新增 FOFA 任务', variant: 'error', showCancel: false });
      return;
    }
    setNewProject({ projectName: '', category: '', remark: '', url: '', country: '', taskPriority: '3', days: 0 });
    setAddModalVisible(true);
  };

  const submitAddRule = async () => {
    if (!ensureRemoteAccess()) return;
    if (false) {
      openModal({ title: '离线版本', message: '当前网络不可用，离线版本不支持新增 FOFA 任务', variant: 'error', showCancel: false });
      return;
    }
    if (!newProject.projectName || !newProject.url) {
      openModal({ title: '参数缺失', message: '项目名称和 FOFA 语法不能为空', variant: 'error', showCancel: false });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await ipcRenderer.invoke('add-fofa-task', { ...newProject, token });
      if (res.success) {
        setAddModalVisible(false);
        openModal({ title: '创建成功', message: '任务已成功创建，请刷新列表查看', variant: 'success', showCancel: false });
        fetchFingerprints(true);
      } else {
        openModal({ title: '创建失败', message: res.error, variant: 'error', showCancel: false });
      }
    } catch (e) {
      openModal({ title: '异常', message: e.message, variant: 'error', showCancel: false });
    }
  };

  const handleEditRule = (item) => {
    // This is no longer used but kept for compatibility if needed
  };

  const handleTogglePin = async (projectId) => {
    try {
      const res = await ipcRenderer.invoke('toggle-fofa-pin', { projectId });
      if (res.success) {
        setData(prev => prev.map(item => item.id === projectId ? { ...item, isPinned: res.isPinned } : item).sort((a, b) => (b.isPinned || 0) - (a.isPinned || 0)));
      }
    } catch (e) {
      console.error('Pin error:', e);
    }
  };

  const handleSetColor = async (projectId, color) => {
    try {
      const res = await ipcRenderer.invoke('set-fofa-color', { projectId, color });
      if (res.success) {
        setData(prev => prev.map(item => item.id === projectId ? { ...item, colorTag: color } : item));
      }
    } catch (e) {
      console.error('Color error:', e);
    }
  };

  const handleUpdateCategory = async (projectId, category) => {
    try {
      const res = await ipcRenderer.invoke('update-fofa-category', { projectId, category });
      if (res.success) {
        setData(prev => prev.map(item => item.id === projectId ? { ...item, category } : item));
        setEditingItemId(null);
      }
    } catch (e) {
      console.error('Update category error:', e);
    }
  };

  const filteredData = data.filter(item => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (item.projectName || '').toLowerCase().includes(term) ||
      (item.remark || '').toLowerCase().includes(term) ||
      (item.url || '').toLowerCase().includes(term) ||
      String(item.id).includes(term)
    );
  });

  const totalRules = filteredData.length;
  const runningRules = filteredData.filter(item => !(item.step || '').includes('完成')).length;
  const completedRules = filteredData.filter(item => (item.step || '').includes('完成')).length;
  const pinnedRules = filteredData.filter(item => item.isPinned).length;
  const totalMatchedAssets = filteredData.reduce((sum, item) => sum + (Number(item.subNum) || 0), 0);

  // Group data by category
  const groupedData = filteredData.reduce((acc, item) => {
    const category = item.category || '未分类';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  const sortedCategories = Object.keys(groupedData).sort((a, b) => {
    if (a === '未分类') return 1;
    if (b === '未分类') return -1;
    return a.localeCompare(b);
  });

  const renderFingerprintCard = (item) => (
    <div key={item.id} className={`v15-fp-card ${item.isPinned ? 'pinned' : ''}`}>
      <div className="v15-fp-card-top">
        <div className="v15-fp-name-group">
          <div className="v15-fp-id-row">
            <div className="v15-fp-id">ID: {item.id}</div>
            <div className="v15-fp-item-actions">
              <button
                className={`v15-fp-pin-btn ${item.isPinned ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleTogglePin(item.id); }}
                title={item.isPinned ? "取消置顶" : "置顶指纹"}
              >
                <Pin size={12} fill={item.isPinned ? "#58a6ff" : "none"} />
              </button>
              <button
                className="v15-fp-tag-btn"
                onClick={(e) => { e.stopPropagation(); setEditingItemId(editingItemId === item.id ? null : item.id); }}
                title="修改类别"
              >
                <Tag size={12} />
              </button>
              <button
                className="v15-fp-tag-btn"
                onClick={(e) => { e.stopPropagation(); handleSingleFofaCloudSync(item.id); }}
                title="云同步当前 FOFA 任务"
              >
                <CloudDownload size={12} className={itemSyncingStatus[item.id] === 'syncing' ? 'spinning' : ''} />
              </button>
              <button
                className="v15-fp-delete-btn"
                onClick={(e) => { e.stopPropagation(); startDeleteFingerprintFlow(item.id); }}
                title={isOffline ? '离线版本不可删除指纹规则' : '删除指纹及数据'}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          <div className="v15-fp-name">
            <FolderGit2 size={16} className="text-cyan" />
            <span title={item.projectName}>{item.projectName}</span>
          </div>
        </div>
        <div className={`v15-fp-status-badge ${item.step?.includes('完成') ? 'done' : 'running'}`}>
          {item.step?.includes('完成') ? <CheckCircle2 size={12} /> : <Play size={12} className="spinning-slow" />}
          {item.step || '未知'}
        </div>
      </div>

      <div className="v15-fp-card-mid">
        <div className="v15-fp-syntax-box">
          <div className="syntax-label">FOFA 语法</div>
          <code className="syntax-code" title={item.remark || item.url}>{item.remark || item.url || '-'}</code>
          <button
            className="v15-copy-btn"
            onClick={(e) => { e.stopPropagation(); handleCopy(item.remark || item.url, item.id); }}
            title="复制语法"
          >
            {copiedId === item.id ? <Check size={14} /> : <Clipboard size={14} />}
          </button>
        </div>

        <div className="v15-fp-meta-info">
          <div className="meta-item">
            <Tag size={12} className="text-dim" />
            {editingItemId === item.id ? (
              <select
                className="v15-inline-select"
                autoFocus
                value={item.category || ''}
                onChange={(e) => handleUpdateCategory(item.id, e.target.value)}
                onBlur={() => setEditingItemId(null)}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="">未分类</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            ) : (
              <span
                className="meta-val category-tag clickable"
                onClick={(e) => { e.stopPropagation(); setEditingItemId(item.id); }}
                title="点击修改分类"
              >
                {item.category || '未分类'}
              </span>
            )}
          </div>
          <div className="meta-item">
            <Clock size={12} className="text-dim" />
            <span className="meta-val" title={`添加时间: ${item.createTime || '未知'}`}>
              {item.createTime ? item.createTime.split(' ')[0] : '未知'}
            </span>
          </div>
        </div>
      </div>

      <div className="v15-fp-card-bot">
   
        <button className="v15-detail-link-btn" onClick={() => onViewDetails(item.id)}>
          查看资产数据 { '('+(item.subNum || 0) +")"} <Play size={12} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="v15-fp-container">
      <div className="v15-fp-header-bar">
        <ActionNoticeToast notice={actionNotice} />
        <div className="v15-fp-title-area">
          <div className="v15-title-with-badge">
            <h2>指纹规则库</h2>
            <span className="v15-fp-count">{filteredData.length} 条规则</span>

            <button className="v15-add-btn" onClick={handleAddRule} title={isOffline ? '离线版本不可新增 FOFA 任务' : '新增规则'} disabled={isOffline}>
              <Plus size={16} />
              <span>新增</span>
            </button>
          </div>
          <div className="v15-view-toggle">
            <button
              className={`toggle-btn ${displayMode === 'grid' ? 'active' : ''}`}
              onClick={() => setDisplayMode('grid')}
              title="网格视图"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`toggle-btn ${displayMode === 'folder' ? 'active' : ''}`}
              onClick={() => setDisplayMode('folder')}
              title="文件夹视图"
            >
              <Folder size={16} />
            </button>
          </div>

        </div>
        <div className="v15-fp-actions">
          <div className="v15-search-pill">
            <Search size={14} />
            <input
              type="text"
              placeholder="检索规则名称、语法或 ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="v6-actions">
            <button className={`v6-cloud-sync-btn ${isCloudSyncing ? 'syncing' : ''}`} onClick={handleCloudSync} title={isOffline ? '离线版本不可云端同步' : '云端同步'} disabled={isOffline}>
              <CloudDownload size={16} className={isCloudSyncing ? 'spinning' : ''} />
              <span>{isCloudSyncing ? '同步中...' : '云端同步'}</span>
            </button>

            <div className="v6-help-tooltip-wrapper">
              <HelpCircle size={16} className="v6-help-icon" />
              <div className="v6-help-tooltip">同步指纹库元数据至本地数据库</div>
            </div>

            <button className={`v6-refresh-btn ${isBackingUp ? 'refreshing' : ''}`} onClick={handleDataBackup} style={{ background: '#238636', border: 'none' }}>
              <HardDrive size={16} className={isBackingUp ? 'spinning' : ''} />
              <span>数据备份</span>
            </button>

            <button className="v6-import-btn" onClick={handleDataImport}>
              <Upload size={16} />
              <span>数据导入</span>
            </button>
          </div>
        </div>
      </div>



      {error && <div className="v15-error-banner"><ShieldAlert size={16} /> {error}</div>}

      {addModalVisible && (
        <div className="v10-modal-overlay">
          <div className="v10-modal info add-task-modal">
            <div className="modal-header">
              <div className="modal-title">新增 FOFA 任务</div>
            </div>
            <div className="modal-body">
              <div className="v15-form-group">
                <label>项目名称 <span className="text-red">*</span></label>
                <input
                  type="text"
                  placeholder="请输入任务名称，例如: test"
                  value={newProject.projectName}
                  onChange={e => setNewProject({ ...newProject, projectName: e.target.value })}
                />
              </div>
              <div className="v15-form-group">
                <label>FOFA 语法 <span className="text-red">*</span></label>
                <textarea
                  placeholder='请输入 FOFA 查询语法，例如: domain="hiseven.com"'
                  value={newProject.url}
                  onChange={e => setNewProject({ ...newProject, url: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="v15-form-group">
                <label>监控国家/地区 (可选)</label>
                <input
                  type="text"
                  placeholder='例如: us 或 us,cn (逗号隔开)'
                  value={newProject.country || ''}
                  onChange={e => setNewProject({ ...newProject, country: e.target.value })}
                />
              </div>
              <div className="v15-form-group">
                <label>指纹类别</label>
                <div className="v15-category-select-group">
                  <select
                    value={newProject.category || ''}
                    onChange={e => {
                      if (e.target.value === '__manage__') {
                        setCategoryManagerVisible(true);
                      } else {
                        setNewProject({ ...newProject, category: e.target.value });
                      }
                    }}
                  >
                    <option value="">未选择类别</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__manage__" style={{ color: '#58a6ff', fontWeight: 'bold' }}>+ 新增/编辑类别...</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-btn primary" onClick={submitAddRule}>
                立即创建
              </button>
              <button className="modal-btn ghost" onClick={() => setAddModalVisible(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryManagerVisible && (
        <div className="v10-modal-overlay">
          <div className="v10-modal info category-manager-modal">
            <div className="modal-header">
              <div className="modal-title">管理指纹类别</div>
            </div>
            <div className="modal-body">
              <div className="v15-add-cat-form">
                <input
                  type="text"
                  placeholder="输入新类别名称..."
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCategory.trim()) {
                      if (!categories.includes(newCategory.trim())) {
                        setCategories([...categories, newCategory.trim()]);
                        setNewCategory('');
                      }
                    }
                  }}
                />
                <button
                  className="v15-cat-add-btn"
                  onClick={() => {
                    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
                      setCategories([...categories, newCategory.trim()]);
                      setNewCategory('');
                    }
                  }}
                >
                  添加
                </button>
              </div>
              <div className="v15-cat-list">
                {categories.map(cat => (
                  <div key={cat} className="v15-cat-item">
                    <span>{cat}</span>
                    <button onClick={() => {
                      openModal({
                        title: '删除类别',
                        message: `确定要删除类别 "${cat}" 吗？`,
                        variant: 'info',
                        onOk: () => {
                          setCategories(categories.filter(c => c !== cat));
                        }
                      });
                    }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-btn primary" onClick={() => setCategoryManagerVisible(false)}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="v15-fp-content-area">
        {loading && data.length === 0 ? (
          <div className="v15-loading-overlay">
            <Loader2 size={40} className="spinning text-blue" />
            <span>读取本地指纹库...</span>
          </div>
        ) : (
          <>
            {displayMode === 'grid' ? (
              <div className="v15-fp-grid">
                {filteredData.map(item => renderFingerprintCard(item))}
              </div>
            ) : (
              <div className="v15-folder-view">
                {sortedCategories.map(cat => (
                  <div key={cat} className="v15-category-group">
                    <div className="v15-folder-header" onClick={() => toggleFolder(cat)}>
                      <div className="folder-icon-box">
                        {expandedFolders[cat] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <Folder size={20} className={expandedFolders[cat] ? 'text-blue' : 'text-dim'} fill={expandedFolders[cat] ? 'rgba(88, 166, 255, 0.2)' : 'transparent'} />
                      </div>
                      <div className="folder-info">
                        <span className="folder-name">{cat}</span>
                        <span className="folder-count">{groupedData[cat].length} Rules</span>
                      </div>
                    </div>
                    {expandedFolders[cat] && (
                      <div className="v15-folder-content">
                        <div className="v15-fp-grid mini">
                          {groupedData[cat].map(item => renderFingerprintCard(item))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {!loading && filteredData.length === 0 && !error && (
          <div className="v15-empty-board">
            <Fingerprint size={48} className="empty-icon" />
            <p>未检索到相关指纹规则</p>
          </div>
        )}
      </div>

      {confirmVisible && (
        <div className="v10-modal-overlay">
          <div className={`v10-modal ${confirmVariant}`}>
            <div className="modal-header">
              <div className="modal-title">{confirmTitle || '确认操作'}</div>
            </div>
            <div className="modal-body">
              <pre className="modal-message">{confirmMessage}</pre>
            </div>
            <div className="modal-actions">
              <button
                className="modal-btn primary"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmVisible(false);
                  setConfirmBusy(true);
                  try {
                    await confirmOnOk();
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
              >
                {confirmOkText}
              </button>
              {confirmShowExtra && (
                <button
                  className={`modal-btn ${confirmExtraClass}`}
                  disabled={confirmBusy}
                  onClick={async () => {
                    setConfirmVisible(false);
                    if (!confirmOnExtra) return;
                    setConfirmBusy(true);
                    try {
                      await confirmOnExtra();
                    } finally {
                      setConfirmBusy(false);
                    }
                  }}
                >
                  {confirmExtraText}
                </button>
              )}
              {confirmShowCancel && (
                <button
                  className="modal-btn ghost"
                  disabled={confirmBusy}
                  onClick={async () => {
                    setConfirmVisible(false);
                    if (!confirmOnCancel) return;
                    setConfirmBusy(true);
                    try {
                      await confirmOnCancel();
                    } finally {
                      setConfirmBusy(false);
                    }
                  }}
                >
                  {confirmCancelText}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FofaTaskDetails = ({ projectId, onBack, isOffline = false, canUseRemoteFeatures = false, refreshToken = 0 }) => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDomainAssetsOnly, setShowDomainAssetsOnly] = useState(false);
  const [showIpAssetsOnly, setShowIpAssetsOnly] = useState(false);
  const [pageNum, setPageNum] = useState(1);
  const pageSize = 50;
  const { ipcRenderer, shell } = window.require('electron');
  const exportMenuRef = React.useRef(null);
  const noticeTimerRef = React.useRef(null);
  const remoteAccessMessage = isOffline
    ? '当前网络不可用，云端功能暂不可用，但本地数据仍可正常查看'
    : '请先登录后再使用云端同步功能';

  // Modal states
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmOkText, setConfirmOkText] = useState('确定');
  const [confirmCancelText, setConfirmCancelText] = useState('取消');
  const [confirmOnOk, setConfirmOnOk] = useState(() => () => { });
  const [confirmShowCancel, setConfirmShowCancel] = useState(true);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmVariant, setConfirmVariant] = useState('info');

  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportFields, setExportFields] = useState(['host', 'ip', 'port', 'protocol', 'title', 'domain', 'server', 'fingerprint', 'countryName', 'regionName', 'cityName']);
  const allAvailableFields = [
    { id: 'host', label: 'Host' },
    { id: 'ip', label: 'IP' },
    { id: 'port', label: '端口' },
    { id: 'protocol', label: '协议' },
    { id: 'title', label: '标题' },
    { id: 'domain', label: '主域名' },
    { id: 'server', label: '服务端' },
    { id: 'fingerprint', label: '指纹' },
    { id: 'countryName', label: '国家' },
    { id: 'regionName', label: '省份' },
    { id: 'cityName', label: '城市' }
  ];

  const openModal = ({
    title,
    message,
    okText = '确定',
    cancelText = '取消',
    showCancel = true,
    variant = 'info',
    onOk = () => { },
  }) => {
    setConfirmTitle(title || '');
    setConfirmMessage(message || '');
    setConfirmVariant(variant);
    setConfirmOkText(okText);
    setConfirmCancelText(cancelText);
    setConfirmShowCancel(showCancel);
    setConfirmOnOk(() => onOk);
    setConfirmVisible(true);
  };

  const ensureRemoteAccess = () => {
    if (canUseRemoteFeatures) return true;
    openModal({
      title: '云端功能不可用',
      message: remoteAccessMessage,
      variant: 'error',
      showCancel: false
    });
    return false;
  };

  const normalizeHostField = (value) => {
    let raw = String(value || '').trim();
    if (!raw) return '';

    try {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
        return new URL(raw).host || '';
      }
    } catch { }

    raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    raw = raw.replace(/^[^@]+@/, '');
    raw = raw.split(/[/?#]/)[0];
    return raw.trim().replace(/\.$/, '');
  };

  const getFilteredHostTypes = () => {
    if (showDomainAssetsOnly === showIpAssetsOnly) return [];
    const next = [];
    if (showDomainAssetsOnly) next.push('domain');
    if (showIpAssetsOnly) next.push('ip');
    return next;
  };

  const buildQueryPayload = ({ currentPage = pageNum, currentPageSize = pageSize, filtered = true } = {}) => ({
    projectId,
    pageNum: currentPage,
    pageSize: currentPageSize,
    searchTerm: searchTerm.trim(),
    hostTypes: filtered ? getFilteredHostTypes() : []
  });

  useEffect(() => {
    loadData();
  }, [projectId, pageNum, showDomainAssetsOnly, showIpAssetsOnly]);

  useEffect(() => {
    if (!refreshToken || !projectId) return;
    loadData(false);
  }, [refreshToken, projectId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const pushActionNotice = (variant, text) => {
    setActionNotice({ variant, text, key: Date.now() });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setActionNotice(null);
    }, 2600);
  };

  const loadData = async (isSync = false) => {
    if (isSync) {
      if (!ensureRemoteAccess()) return;
      openModal({
        title: '云端同步确认',
        message: '即将同步云数据，覆盖本地数据，是否进行？',
        variant: 'info',
        okText: '立即同步',
        onOk: async () => {
          setSyncing(true);
          pushActionNotice('info', `正在拉取任务 ${projectId} 的云端资产...`);
          try {
            const token = localStorage.getItem('token');
            const syncRes = await ipcRenderer.invoke('sync-fofa-task-detail', { projectId, token });
            if (syncRes.success) {
              const res = await ipcRenderer.invoke('get-fofa-task-data', buildQueryPayload());
              if (res.success) {
                setData(res.rows || []);
                setTotal(res.total || 0);
                pushActionNotice('success', `云端拉取完成，当前共 ${res.total || 0} 条资产`);
              }
            } else {
              pushActionNotice('error', syncRes.error || '云端同步失败');
              openModal({
                title: '同步失败',
                message: syncRes.error,
                variant: 'error',
                showCancel: false
              });
            }
          } catch (e) {
            console.error('Sync FOFA detail error:', e);
            pushActionNotice('error', e.message || '云端同步异常');
          } finally {
            setSyncing(false);
          }
        }
      });
      return;
    }

    setLoading(true);
    try {
      const res = await ipcRenderer.invoke('get-fofa-task-data', buildQueryPayload());
      if (res.success) {
        setData(res.rows || []);
        setTotal(res.total || 0);
      }
    } catch (e) {
      console.error('Load FOFA data error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      setPageNum(1);
      loadData();
    }
  };

  const handleExportTxt = async () => {
    try {
      // 获取全量数据进行导出
      const res = await ipcRenderer.invoke('get-fofa-task-data', buildQueryPayload({ currentPage: 1, currentPageSize: 100000, filtered: true }));

      if (!res.success || !res.rows || res.rows.length === 0) {
        openModal({ title: '导出失败', message: '没有可导出的资产数据', variant: 'error', showCancel: false });
        return;
      }

      const hosts = res.rows.map(r => r.host || r.ip).filter(Boolean).join('\n');
      const saveRes = await ipcRenderer.invoke('save-export-file', {
        content: hosts,
        defaultPath: `fofa_hosts_${projectId}_${new Date().getTime()}.txt`,
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
      });

      if (saveRes.success) {
        openModal({ title: '导出成功', message: `成功导出 ${res.rows.length} 条 Host 数据`, variant: 'success', showCancel: false });
      }
    } catch (e) {
      openModal({ title: '导出异常', message: e.message, variant: 'error', showCancel: false });
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await ipcRenderer.invoke('get-fofa-task-data', buildQueryPayload({
        currentPage: 1,
        currentPageSize: 100000,
        filtered: true
      }));

      if (!res.success || !res.rows || res.rows.length === 0) {
        openModal({ title: '导出失败', message: '没有可导出的资产数据', variant: 'error', showCancel: false });
        return;
      }

      // 构造 CSV 内容
      const headers = exportFields.map(f => allAvailableFields.find(af => af.id === f)?.label || f).join(',');
      const rows = res.rows.map(row => {
        return exportFields.map(field => {
          let val = field === 'host'
            ? normalizeHostField(row.host || row.ip)
            : (row[field] || '');
          // 处理 CSV 里的逗号和引号
          val = val.toString().replace(/"/g, '""');
          if (val.includes(',') || val.includes('\n') || val.includes('"')) {
            val = `"${val}"`;
          }
          return val;
        }).join(',');
      }).join('\n');

      const csvContent = `\uFEFF${headers}\n${rows}`; // 添加 BOM 头解决 Excel 中文乱码

      const saveRes = await ipcRenderer.invoke('save-export-file', {
        content: csvContent,
        defaultPath: `fofa_assets_${projectId}_${new Date().getTime()}.csv`,
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
      });

      if (saveRes.success) {
        setExportModalVisible(false);
        openModal({ title: '导出成功', message: `成功导出 ${res.rows.length} 条资产数据`, variant: 'success', showCancel: false });
      }
    } catch (e) {
      openModal({ title: '导出异常', message: e.message, variant: 'error', showCancel: false });
    }
  };

  return (
    <div className="v15-details-view">
      <div className="v15-details-header">
        <div className="v15-header-left">
          <button className="v15-back-btn" onClick={onBack} title="返回指纹库">
            <ArrowLeft size={18} />
          </button>
          <div className="v15-header-title">
            <h3>资产明细</h3>
            <span className="v15-header-sub">任务 ID: {projectId} • 共 {total} 条记录</span>
          </div>
        </div>
        <div className="v15-header-right">
          <div className="v15-search-pill">
            <Search size={14} color="#8b949e" />
            <input
              type="text"
              placeholder="搜索 IP, Host, 标题..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={handleSearch}
            />
          </div>
          <div className="v15-asset-filter-group">
            <button
              type="button"
              className={`v15-asset-filter-btn ${showDomainAssetsOnly ? 'active' : ''}`}
              onClick={() => {
                setShowDomainAssetsOnly(prev => !prev);
                setPageNum(1);
              }}
            >
              <span className={`v15-asset-filter-check ${showDomainAssetsOnly ? 'checked' : ''}`}>√</span>
              <span>域名资产</span>
            </button>
            <button
              type="button"
              className={`v15-asset-filter-btn ${showIpAssetsOnly ? 'active' : ''}`}
              onClick={() => {
                setShowIpAssetsOnly(prev => !prev);
                setPageNum(1);
              }}
            >
              <span className={`v15-asset-filter-check ${showIpAssetsOnly ? 'checked' : ''}`}>√</span>
              <span>IP 资产</span>
            </button>
          </div>
          <button className={`v6-cloud-sync-btn ${syncing ? 'syncing' : ''}`} onClick={() => !isOffline && loadData(true)} title={isOffline ? '离线版本不可同步云端' : '同步云端'} disabled={isOffline} style={{ height: '40px' }}>
            <CloudDownload size={16} className={syncing ? 'spinning' : ''} />
            <span>{syncing ? '同步中...' : '同步云端'}</span>
          </button>

          <div className="v15-export-dropdown" ref={exportMenuRef}>
            <button className={`v15-export-btn ${exportMenuOpen ? 'active' : ''}`} onClick={() => setExportMenuOpen(!exportMenuOpen)}>
              <Download size={16} />
              <span>数据导出</span>
              <ChevronDown size={14} className={`v15-chevron ${exportMenuOpen ? 'open' : ''}`} />
            </button>
            <div className={`v15-export-menu ${exportMenuOpen ? 'show' : ''}`}>
              <div className="menu-item" onClick={() => { handleExportTxt(); setExportMenuOpen(false); }}>导出 Host (TXT)</div>
              <div className="menu-item" onClick={() => { setExportModalVisible(true); setExportMenuOpen(false); }}>导出自定义 (CSV)</div>
            </div>
          </div>
        </div>
      </div>

      <ActionNoticeToast notice={actionNotice} />

      {exportModalVisible && (
        <div className="v10-modal-overlay">
          <div className="v10-modal info export-config-modal">
            <div className="modal-header">
              <div className="modal-title">导出字段配置 (CSV)</div>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '16px', color: '#8b949e', fontSize: '13px' }}>请选择需要导出的数据列：</p>
              <div className="v15-field-grid">
                {allAvailableFields.map(field => (
                  <label key={field.id} className="field-checkbox">
                    <input
                      type="checkbox"
                      checked={exportFields.includes(field.id)}
                      onChange={() => {
                        if (exportFields.includes(field.id)) {
                          setExportFields(exportFields.filter(f => f !== field.id));
                        } else {
                          setExportFields([...exportFields, field.id]);
                        }
                      }}
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-btn primary" onClick={handleExportCsv} disabled={exportFields.length === 0}>
                开始导出
              </button>
              <button className="modal-btn ghost" onClick={() => setExportModalVisible(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="v15-details-content">
        {loading ? (
          <div className="v15-loading-state">
            <Loader2 size={40} className="spinning" color="#58a6ff" />
            <p>正在读取资产库...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="v15-empty-state">
            <Database size={48} opacity={0.2} />
            <p>暂无资产数据</p>
            {!searchTerm && (
              <button className={`v15-sync-now-btn ${syncing ? 'syncing' : ''}`} onClick={() => !isOffline && loadData(true)} disabled={isOffline || syncing}>
                {syncing ? <Loader2 size={14} className="spinning" /> : <CloudDownload size={14} />}
                <span>{syncing ? '拉取中...' : '从云端拉取'}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="v15-asset-list">
            {/* 表头 */}
            <div className="v15-asset-row header" style={{ background: 'rgba(255,255,255,0.03)', fontWeight: 800, color: '#8b949e', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              <div>图标</div>
              <div>主机与标题</div>
              <div>地理位置</div>
              <div>服务信息</div>
              <div>指纹标签</div>
            </div>

            {data.map((item, idx) => (
              <div key={idx} className="v15-asset-row">
                <FaviconImage host={normalizeHostField(item.host || item.ip) || item.ip} />

                <div className="v15-asset-main-info">
                  <div className="v15-asset-host" onClick={() => {
                    const host = item.host || item.ip || '';
                    const cleanHost = normalizeHostField(host) || host;
                    const url = host.startsWith('http') ? host : `http://${cleanHost}`;
                    shell.openExternal(url);
                  }}>
                    {normalizeHostField(item.host || item.ip) || item.ip || '-'}
                  </div>
                  <div className="v15-asset-title" title={item.title}>{item.title || '无标题'}</div>
                </div>

                <div className="v15-asset-location">
                  <MapPin size={14} color="#8b949e" />
                  <span>{item.countryName || '-'} {item.regionName}</span>
                </div>

                <div className="v15-asset-server-info">
                  <div className="ip-port">{item.ip}:{item.port}</div>
                  <div className="server-name" title={item.server}>{item.server || '-'}</div>
                </div>

                <div className="v15-asset-fps">
                  {(item.fingerprint || '').split(/[;,]/).filter(Boolean).slice(0, 3).map((fp, i) => (
                    <span key={i} className="v15-mini-fp" title={fp.trim()}>{fp.trim()}</span>
                  ))}
                  {(item.fingerprint || '').split(/[;,]/).filter(Boolean).length > 3 && (
                    <span className="text-dim" style={{ fontSize: '10px' }}>+更多</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {total > pageSize && (
        <div className="v15-details-footer">
          <div className="v15-pagination">
            <button disabled={pageNum <= 1} onClick={() => setPageNum(p => p - 1)}>上一页</button>
            <span>{pageNum} / {Math.ceil(total / pageSize)}</span>
            <button disabled={pageNum >= Math.ceil(total / pageSize)} onClick={() => setPageNum(p => p + 1)}>下一页</button>
          </div>
        </div>
      )}

      {confirmVisible && (
        <div className="v10-modal-overlay">
          <div className={`v10-modal ${confirmVariant}`}>
            <div className="modal-header">
              <div className="modal-title">{confirmTitle || '确认操作'}</div>
            </div>
            <div className="modal-body">
              <pre className="modal-message">{confirmMessage}</pre>
            </div>
            <div className="modal-actions">
              <button
                className="modal-btn primary"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmVisible(false);
                  setConfirmBusy(true);
                  try {
                    await confirmOnOk();
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
              >
                {confirmOkText}
              </button>
              {confirmShowCancel && (
                <button className="modal-btn ghost" onClick={() => setConfirmVisible(false)}>
                  {confirmCancelText}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Assets = ({ isOffline = false, canUseRemoteFeatures = false, refreshToken = 0 }) => {
  const [activeView, setActiveView] = useState('home');
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  return (
    <div className="v15-assets-wrapper">
      {/* 独立的背景层，确保不干扰点击 */}
      <div className="v15-global-bg"></div>

      <div className="v15-assets-top-nav">
        <div className="v15-nav-brand">
          <Cpu size={20} className="brand-icon" />
          <span>资产情报中心</span>
        </div>
        <div className="v15-nav-links">
          <button className={`v15-nav-btn ${activeView === 'home' && !selectedProjectId ? 'active' : ''}`} onClick={() => { setActiveView('home'); setSelectedProjectId(null); }}>
            <Home size={14} />
            <span>情报大盘</span>
          </button>
          <button className={`v15-nav-btn ${activeView === 'fingerprint' || selectedProjectId ? 'active' : ''}`} onClick={() => { setActiveView('fingerprint'); setSelectedProjectId(null); }}>
            <Fingerprint size={14} />
            <span>指纹规则库</span>
          </button>
        </div>
      </div>

      <div className="v15-assets-main">
        {selectedProjectId ? (
          <FofaTaskDetails projectId={selectedProjectId} isOffline={isOffline} canUseRemoteFeatures={canUseRemoteFeatures} refreshToken={refreshToken} onBack={() => setSelectedProjectId(null)} />
        ) : (
          <>
            {activeView === 'home' && <AssetsHome />}
            {activeView === 'fingerprint' && <FingerprintLibrary isOffline={isOffline} canUseRemoteFeatures={canUseRemoteFeatures} refreshToken={refreshToken} onViewDetails={(id) => setSelectedProjectId(id)} />}
          </>
        )}
      </div>
    </div>
  );
};

export default Assets;
