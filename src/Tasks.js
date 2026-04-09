import React, { useMemo, useRef, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  FolderGit2,
  Activity,
  Globe,
  Database,
  Loader2,
  RefreshCw,
  ChevronRight,
  Server,
  Search,
  LayoutGrid,
  List as ListIcon,
  Play,
  CheckCircle2,
  Clock,
  Eye,
  Edit3,
  Trash2,
  RotateCcw,
  Square,
  CloudDownload,
  HardDrive,
  HelpCircle,
  Upload,
  ArrowLeft,
  Home,
  X,
  History,
  Trash,
  Info,
  ExternalLink,
  ShieldCheck,
  Zap,
  Plus,
  Link2,
  Copy
} from 'lucide-react';

const { ipcRenderer } = window.require('electron');

let __echartsPromise = null;
const loadEcharts = () => {
  if (window.echarts) return Promise.resolve(window.echarts);
  if (__echartsPromise) return __echartsPromise;
  __echartsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.echarts);
    script.onerror = () => reject(new Error('echarts_load_failed'));
    document.head.appendChild(script);
  });
  return __echartsPromise;
};

let __worldCountryNameMapsPromise = null;
const loadWorldCountryNameMaps = () => {
  if (__worldCountryNameMapsPromise) return __worldCountryNameMapsPromise;
  __worldCountryNameMapsPromise = (async () => {
    const enUrl = 'https://cdn.jsdelivr.net/gh/stefangabos/world_countries@master/data/countries/en/world.json';
    const zhUrl = 'https://cdn.jsdelivr.net/gh/stefangabos/world_countries@master/data/countries/zh/world.json';
    const [enRes, zhRes] = await Promise.all([fetch(enUrl), fetch(zhUrl)]);
    const [enList, zhList] = await Promise.all([enRes.json(), zhRes.json()]);
    const byAlpha2 = new Map();
    for (const it of enList || []) {
      if (!it?.alpha2 || !it?.name) continue;
      const k = String(it.alpha2).toLowerCase();
      byAlpha2.set(k, { en: String(it.name) });
    }
    for (const it of zhList || []) {
      if (!it?.alpha2 || !it?.name) continue;
      const k = String(it.alpha2).toLowerCase();
      const prev = byAlpha2.get(k) || {};
      byAlpha2.set(k, { ...prev, zh: String(it.name) });
    }
    const zhToEn = {};
    const enToZh = {};
    for (const v of byAlpha2.values()) {
      if (v.zh && v.en) {
        zhToEn[v.zh] = v.en;
        enToZh[v.en] = v.zh;
      }
    }
    return { zhToEn, enToZh };
  })();
  return __worldCountryNameMapsPromise;
};

const parseProjectTargets = (rawValue) => {
  return String(rawValue || '')
    .split(/[;\n\r,，；]+/)    .map((item) => item.trim())
    .filter(Boolean);
};

function StableKeepFocus({ children }) {
  return children;
}

const Tasks = ({ isOffline = false, canUseRemoteFeatures = false, refreshToken = 0 }) => {
  const [loading, setLoading] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [projects, setProjects] = useState([]); // The original full list of projects
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 默认为列表视图
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(null); // 例如, 'running', 'completed', 'idle'
  const [syncingStatus, setSyncingStatus] = useState({}); // projectId -> 状态 ('同步中', '完成', '错误')
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [taskActionStatus, setTaskActionStatus] = useState({});
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmOnOk, setConfirmOnOk] = useState(() => () => { });
  const [confirmOnCancel, setConfirmOnCancel] = useState(null);
  const [confirmOnExtra, setConfirmOnExtra] = useState(null);
  const [confirmVariant, setConfirmVariant] = useState('info'); // 'info' | 'success' | 'danger'
  const [confirmOkText, setConfirmOkText] = useState('确定');
  const [confirmCancelText, setConfirmCancelText] = useState('取消');
  const [confirmShowCancel, setConfirmShowCancel] = useState(true);
  const [confirmExtraText, setConfirmExtraText] = useState('');
  const [confirmShowExtra, setConfirmShowExtra] = useState(false);
  const [confirmExtraClass, setConfirmExtraClass] = useState('danger');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState('create'); // 'create' | 'edit'
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskFormErrors, setTaskFormErrors] = useState({});
  const [taskForm, setTaskForm] = useState({
    id: null,
    projectName: '',
    url: '',
    remark: '',
    taskPriority: '3',
    days: 0
  });
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProject, setDetailProject] = useState(null);
  const [detailTab, setDetailTab] = useState('home'); // 'home' | 'fofa' | 'related' | 'ai'
  const [openingDetailId, setOpeningDetailId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailRows, setDetailRows] = useState([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailPageNum, setDetailPageNum] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(100);
  const [detailStats, setDetailStats] = useState(null);
  const [relatedAssetRows, setRelatedAssetRows] = useState([]);
  const [relatedAssetLoading, setRelatedAssetLoading] = useState(false);
  const [relatedAssetError, setRelatedAssetError] = useState(null);
  const [fofaSearchTerm, setFofaSearchTerm] = useState('');
  const [fofaTargetFilter, setFofaTargetFilter] = useState('');
  const [domainDetailVisible, setDomainDetailVisible] = useState(false);
  const [domainDetailLoading, setDomainDetailLoading] = useState(false);
  const [domainDetailRows, setDomainDetailRows] = useState([]);
  const [domainDetailTitle, setDomainDetailTitle] = useState('');
  const [ipAggregationRows, setIpAggregationRows] = useState([]);
  const [ipAggregationLoading, setIpAggregationLoading] = useState(false);
  const [ipAggregationError, setIpAggregationError] = useState(null);
  const [ipSearchTerm, setIpSearchTerm] = useState('');
  const [portSearchTerm, setPortSearchTerm] = useState('');
  const [ipTargetFilter, setIpTargetFilter] = useState('');
  const [ipSearchApplied, setIpSearchApplied] = useState({ ip: '', port: '', target: '' });
  const [ipDetailVisible, setIpDetailVisible] = useState(false);
  const [ipDetailLoading, setIpDetailLoading] = useState(false);
  const [ipDetailRows, setIpDetailRows] = useState([]);
  const [ipDetailTitle, setIpDetailTitle] = useState('');
  const [countryStatsRows, setCountryStatsRows] = useState([]);
  const [countryStatsAllRows, setCountryStatsAllRows] = useState([]);
  const [countryStatsLoading, setCountryStatsLoading] = useState(false);
  const [countryStatsError, setCountryStatsError] = useState(null);
  const [countrySearchTerm, setCountrySearchTerm] = useState('');
  const [countryTargetFilter, setCountryTargetFilter] = useState('');
  const [countrySearchApplied, setCountrySearchApplied] = useState({ country: '', target: '' });
  const [countryDetailVisible, setCountryDetailVisible] = useState(false);
  const [countryDetailLoading, setCountryDetailLoading] = useState(false);
  const [countryDetailRows, setCountryDetailRows] = useState([]);
  const [countryDetailTitle, setCountryDetailTitle] = useState('');
  const [fingerprintStatsRows, setFingerprintStatsRows] = useState([]);
  const [fingerprintStatsLoading, setFingerprintStatsLoading] = useState(false);
  const [fingerprintStatsError, setFingerprintStatsError] = useState(null);
  const [fpSearchTerm, setFpSearchTerm] = useState('');
  const [fpCategoryFilter, setFpCategoryFilter] = useState('');
  const [fpTargetFilter, setFpTargetFilter] = useState('');
  const [fpSearchApplied, setFpSearchApplied] = useState({ name: '', category: '', target: '' });
  const [fpDetailVisible, setFpDetailVisible] = useState(false);
  const [fpDetailLoading, setFpDetailLoading] = useState(false);
  const [fpDetailRows, setFpDetailRows] = useState([]);
  const [fpDetailTitle, setFpDetailTitle] = useState('');
  const [targetsTooltip, setTargetsTooltip] = useState(null);
  const targetsTooltipCloseTimerRef = useRef(null);
  const detailContentRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const remoteAccessMessage = isOffline
    ? '当前网络不可用，云端功能暂不可用，但本地数据仍可正常查看'
    : '请先登录后再使用云端同步、新增、编辑和删除功能';

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
    fetchProjects();
  }, []);
  useEffect(() => {
    if (!refreshToken) return;
    fetchProjects(true);
  }, [refreshToken]);

  useEffect(() => {
    setTotal(projects.length);
  }, [projects]);

  useEffect(() => {
    const mainEl = document.querySelector('.content-area');
    if (!mainEl) return;
    const prevOverflowY = mainEl.style.overflowY;
    const prevOverflowX = mainEl.style.overflowX;
    if (detailVisible) {
      mainEl.style.overflowY = 'hidden';
      mainEl.style.overflowX = 'hidden';
    } else {
      mainEl.style.overflowY = prevOverflowY || '';
      mainEl.style.overflowX = prevOverflowX || '';
    }
    return () => {
      mainEl.style.overflowY = prevOverflowY || '';
      mainEl.style.overflowX = prevOverflowX || '';
    };
  }, [detailVisible]);

  const openModal = ({
    title,
    message,
    variant = 'info',
    okText = '确定',
    cancelText = '取消',
    extraText = '',
    showCancel = true,
    showExtra = false,
    extraClass = 'danger',
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

  const performLocalDeleteTask = async (projectId) => {
    const previousProjects = projects;
    const hadSyncedDetail = localStorage.getItem(`synced_detail_${projectId}`);
    const previousStatus = syncingStatus[projectId];

    setProjects(prev => prev.filter(p => p.id !== projectId));
    localStorage.removeItem(`synced_detail_${projectId}`);
    setSyncingStatus(prev => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });

    try {
      const result = await ipcRenderer.invoke('delete-task', { projectId });
      if (!result?.success) {
        setProjects(previousProjects);
        if (hadSyncedDetail !== null) {
          localStorage.setItem(`synced_detail_${projectId}`, hadSyncedDetail);
        }
        setSyncingStatus(prev => {
          const next = { ...prev };
          if (previousStatus !== undefined) next[projectId] = previousStatus;
          else delete next[projectId];
          return next;
        });
        openModal({
          title: '删除失败',
          message: result?.error || '本地删除失败，请稍后重试',
          variant: 'error',
          showCancel: false
        });
        fetchProjects(true);
        return false;
      }
      return true;
    } catch (err) {
      setProjects(previousProjects);
      if (hadSyncedDetail !== null) {
        localStorage.setItem(`synced_detail_${projectId}`, hadSyncedDetail);
      }
      setSyncingStatus(prev => {
        const next = { ...prev };
        if (previousStatus !== undefined) next[projectId] = previousStatus;
        else delete next[projectId];
        return next;
      });
      openModal({
        title: '删除异常',
        message: err?.message || '本地删除时发生异常',
        variant: 'error',
        showCancel: false
      });
      fetchProjects(true);
      return false;
    }
  };

  const confirmDeleteTask = (projectId, mode) => {
    const isCloudDelete = mode === 'cloud';
    openModal({
      title: isCloudDelete ? '确认本地和云端删除' : '确认本地删除',
      message: isCloudDelete
        ? `确定要删除该任务 (ID: ${projectId}) 吗？\n这会先删除云端任务，再清理本地缓存数据。\n此操作不可撤销。`
        : `确定要删除该任务 (ID: ${projectId}) 的本地缓存数据吗？\n云端任务将会保留。\n此操作不可撤销。`,
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
          } catch (err) {
            openModal({
              title: '云端删除异常',
              message: err?.message || '调用云端删除接口时发生异常',
              variant: 'error',
              showCancel: false
            });
            return;
          }
        }

        const ok = await performLocalDeleteTask(projectId);
        if (!ok) return;

        openModal({
          title: '删除成功',
          message: isCloudDelete
            ? '已完成云端删除，并清理本地缓存数据'
            : '已删除本地缓存数据，云端任务保留',
          variant: 'success',
          showCancel: false
        });
      }
    });
  };

  const startDeleteTaskFlow = async (projectId) => {
    if (canUseRemoteFeatures) {
      openModal({
        title: '选择删除方式',
        message: `请选择该任务 (ID: ${projectId}) 的删除方式。\n本地删除仅清理当前设备缓存；本地和云删除会同时删除云端任务。`,
        variant: 'info',
        okText: '本地删除',
        cancelText: '取消',
        extraText: '本地和云删除',
        showCancel: true,
        showExtra: true,
        extraClass: 'danger',
        onOk: () => confirmDeleteTask(projectId, 'local'),
        onExtra: () => confirmDeleteTask(projectId, 'cloud')
      });
      return;
    }

    openModal({
      title: '选择删除方式',
      message: `当前仅可执行本地删除。\n该任务 (ID: ${projectId}) 的云端删除需要联网并登录后才能使用。`,
      variant: 'info',
      okText: '本地删除',
      cancelText: '取消',
      showCancel: true,
      onOk: () => confirmDeleteTask(projectId, 'local')
    });
  };

  const loadTaskDetail = async (projectId, pageNum = 1, pageSize = detailPageSize, searchTerm = fofaSearchTerm, targetFilter = fofaTargetFilter, silent = false) => {
    if (!silent) setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await ipcRenderer.invoke('get-task-data', {
        projectId,
        pageNum,
        pageSize,
        searchTerm,
        targetFilter
      });
      if (res?.success) {
        setDetailRows(res.rows || []);
        setDetailTotal(res.total || 0);
        setDetailPageNum(pageNum);
      } else {
        setDetailRows([]);
        setDetailTotal(0);
        setDetailPageNum(pageNum);
        setDetailError(res?.error || '读取任务详情失败');
      }
    } catch (e) {
      setDetailRows([]);
      setDetailTotal(0);
      setDetailPageNum(pageNum);
      setDetailError('读取任务详情失败');
    } finally {
      if (!silent) setDetailLoading(false);
    }
  };

  const loadRelatedAssets = async (projectId, silent = false) => {
    if (!projectId) return;
    if (!silent) setRelatedAssetLoading(true);
    setRelatedAssetError(null);
    try {
      const res = await ipcRenderer.invoke('get-task-related-assets', { projectId });
      if (res?.success) {
        setRelatedAssetRows(res.rows || []);
      } else {
        setRelatedAssetRows([]);
        setRelatedAssetError(res?.error || '读取关联资产失败');
      }
    } catch (e) {
      setRelatedAssetRows([]);
      setRelatedAssetError('读取关联资产失败');
    } finally {
      if (!silent) setRelatedAssetLoading(false);
    }
  };

  const loadDomainDetail = async (domain) => {
    if (!detailProject?.id || !domain) return;
    setDomainDetailLoading(true);
    setDomainDetailTitle(`域名资产详情: ${domain}`);
    setDomainDetailVisible(true);
    try {
      const res = await ipcRenderer.invoke('get-domain-detail-data', { 
        projectId: detailProject.id, 
        domain 
      });
      if (res?.success) {
        setDomainDetailRows(res.rows || []);
      } else {
        setDomainDetailRows([]);
      }
    } catch (e) {
      console.error('加载域详细信息错误:', e);
      setDomainDetailRows([]);
    } finally {
      setDomainDetailLoading(false);
    }
  };

  const loadIpAggregation = async (projectId, silent = false) => {
    if (!projectId) return;
    if (!silent) setIpAggregationLoading(true);
    setIpAggregationError(null);
    try {
      const res = await ipcRenderer.invoke('get-task-ip-aggregation', { projectId });
      if (res?.success) {
        setIpAggregationRows(res.rows || []);
      } else {
        setIpAggregationRows([]);
        setIpAggregationError(res?.error || '读取IP聚合失败');
      }
    } catch (e) {
      setIpAggregationRows([]);
      setIpAggregationError('读取IP聚合失败');
    } finally {
      if (!silent) setIpAggregationLoading(false);
    }
  };

  const loadIpDetail = async (ip) => {
    if (!detailProject?.id || !ip) return;
    setIpDetailLoading(true);
    setIpDetailTitle(`IP资产详情: ${ip}`);
    setIpDetailVisible(true);
    try {
      const res = await ipcRenderer.invoke('get-ip-detail-data', { 
        projectId: detailProject.id, 
        ip 
      });
      if (res?.success) {
        setIpDetailRows(res.rows || []);
      } else {
        setIpDetailRows([]);
      }
    } catch (e) {
      console.error('加载ip详细信息错误:', e);
      setIpDetailRows([]);
    } finally {
      setIpDetailLoading(false);
    }
  };

  const loadCountryStats = async (projectId, silent = false) => {
    if (!projectId) return;
    if (!silent) setCountryStatsLoading(true);
    setCountryStatsError(null);
    try {
      const res = await ipcRenderer.invoke('get-task-country-stats', { projectId });
      if (res?.success) {
        setCountryStatsRows(res.rows || []);
        setCountryStatsAllRows(res.allRows || []);
      } else {
        setCountryStatsRows([]);
        setCountryStatsAllRows([]);
        setCountryStatsError(res?.error || '读取国家统计失败');
      }
    } catch (e) {
      setCountryStatsRows([]);
      setCountryStatsAllRows([]);
      setCountryStatsError('读取国家统计失败');
    } finally {
      if (!silent) setCountryStatsLoading(false);
    }
  };

  const loadCountryDetail = async (country) => {
    if (!detailProject?.id || !country) return;
    setCountryDetailLoading(true);
    setCountryDetailTitle(`国家/地区资产详情: ${country}`);
    setCountryDetailVisible(true);
    try {
      const res = await ipcRenderer.invoke('get-country-detail-data', { 
        projectId: detailProject.id, 
        country 
      });
      if (res?.success) {
        setCountryDetailRows(res.rows || []);
      } else {
        setCountryDetailRows([]);
      }
    } catch (e) {
      console.error('加载国家/地区详细信息错误:', e);
      setCountryDetailRows([]);
    } finally {
      setCountryDetailLoading(false);
    }
  };

  const loadFingerprintStats = async (projectId, silent = false) => {
    if (!projectId) return;
    if (!silent) setFingerprintStatsLoading(true);
    setFingerprintStatsError(null);
    try {
      const res = await ipcRenderer.invoke('get-task-fingerprint-stats', { projectId });
      if (res?.success) {
        setFingerprintStatsRows(res.rows || []);
      } else {
        setFingerprintStatsRows([]);
        setFingerprintStatsError(res?.error || '读取指纹统计失败');
      }
    } catch (e) {
      setFingerprintStatsRows([]);
      setFingerprintStatsError('读取指纹统计失败');
    } finally {
      if (!silent) setFingerprintStatsLoading(false);
    }
  };

  const loadFingerprintDetail = async (fingerprint) => {
    if (!detailProject?.id || !fingerprint) return;
    setFpDetailLoading(true);
    setFpDetailTitle(`指纹资产详情: ${fingerprint}`);
    setFpDetailVisible(true);
    try {
      const res = await ipcRenderer.invoke('get-fingerprint-detail-data', { 
        projectId: detailProject.id, 
        fingerprint 
      });
      if (res?.success) {
        setFpDetailRows(res.rows || []);
      } else {
        setFpDetailRows([]);
      }
    } catch (e) {
      console.error('加载指纹详细信息错误:', e);
      setFpDetailRows([]);
    } finally {
      setFpDetailLoading(false);
    }
  };

  const openDetail = async (project) => {
    if (!project) return;
    const mainEl = document.querySelector('.content-area');
    if (mainEl) {
      mainEl.dataset.tasksScrollTop = String(mainEl.scrollTop || 0);
    }
    setOpeningDetailId(project.id);
    setDetailProject(project);
    setDetailTab('home');
    setDetailVisible(true);
    setDetailOpen(false);
    requestAnimationFrame(() => setDetailOpen(true));

    try {
      const [, stats] = await Promise.all([
        loadTaskDetail(project.id, 1, detailPageSize),
        ipcRenderer.invoke('get-task-stats', { projectId: project.id })
      ]);
      if (stats?.success) setDetailStats(stats);
      else setDetailStats(null);
    } catch {
      setDetailStats(null);
    } finally {
      setOpeningDetailId(null);
    }
  };

  const closeDetail = () => {
    setOpeningDetailId(null);
    setDetailOpen(false);
    setTimeout(() => {
      setDetailVisible(false);
      setDetailProject(null);
      setDetailRows([]);
      setDetailTotal(0);
      setDetailPageNum(1);
      setDetailError(null);
      setRelatedAssetRows([]);
      setRelatedAssetError(null);
      setDetailTab('home');
      requestAnimationFrame(() => {
        const mainEl = document.querySelector('.content-area');
        const savedScrollTop = Number(mainEl?.dataset?.tasksScrollTop || 0);
        if (mainEl && Number.isFinite(savedScrollTop)) {
          mainEl.scrollTop = savedScrollTop;
        }
      });
    }, 220);
  };

  const clearTargetsTooltipCloseTimer = () => {
    if (targetsTooltipCloseTimerRef.current) {
      clearTimeout(targetsTooltipCloseTimerRef.current);
      targetsTooltipCloseTimerRef.current = null;
    }
  };

  const scheduleTargetsTooltipClose = () => {
    clearTargetsTooltipCloseTimer();
    targetsTooltipCloseTimerRef.current = setTimeout(() => {
      setTargetsTooltip(null);
    }, 120);
  };

  const openTargetsTooltip = (event, project, targets) => {
    clearTargetsTooltipCloseTimer();
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = Math.min(220, Math.max(140, Math.floor(window.innerWidth * 0.24)));
    const left = Math.min(
      window.innerWidth - tooltipWidth - 16,
      Math.max(16, rect.left + rect.width / 2 - tooltipWidth / 2)
    );
    const top = Math.max(16, rect.top - 12);
    setTargetsTooltip({
      key: `${project?.id || 'project'}-${targets.join('|')}`,
      targets,
      style: {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${tooltipWidth}px`,
        transform: 'translateY(-100%)'
      }
    });
  };

  const renderProjectTargets = (project) => {
    const targets = parseProjectTargets(project?.url);
    if (targets.length <= 1) {
      return <span className="v9-target-tag">{targets[0] || project?.url || '-'}</span>;
    }

    return (
      <div className="v9-url-with-eye">
        <span className="v9-target-tag">{`${targets[0]}...`}</span>
        <div
          className="eye-tooltip-wrapper"
          onMouseEnter={(event) => openTargetsTooltip(event, project, targets)}
          onMouseLeave={scheduleTargetsTooltipClose}
        >
          <Eye size={16} className="v9-eye-icon" />
        </div>
      </div>
    );
  };

  useEffect(() => {
    return () => clearTargetsTooltipCloseTimer();
  }, []);

  const switchDetailTab = (tab, loader = null) => {
    setDetailTab(tab);
    if (loader && detailProject?.id) loader(detailProject.id);
    try {
      detailContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { }
  };

  const detailBusyText =
    detailLoading ? '正在加载任务详情...' :
      relatedAssetLoading ? '正在加载关联资产...' :
        ipAggregationLoading ? '正在聚合 IP 数据...' :
          countryStatsLoading ? '正在统计国家分布...' :
            fingerprintStatsLoading ? '正在分析指纹资产...' :
              '';
  const detailBusy = Boolean(detailBusyText);

  useEffect(() => {
    if (!detailVisible || detailTab != 'related' || !detailProject?.id) return;
    loadRelatedAssets(detailProject.id);
  }, [detailVisible, detailTab, detailProject?.id]);

  useEffect(() => {
    if (!detailVisible || detailTab != 'related' || !detailProject?.id) return;
    loadRelatedAssets(detailProject.id);
  }, [detailVisible, detailTab, detailProject?.id]);

  useEffect(() => {
    if (!detailVisible) return;
    let disposed = false;
    let ro = null;
    let el = null;
    let raf = 0;
    let mainEl = null;
    const bind = () => {
      if (disposed) return;
      el = detailContentRef.current;
      if (!el) {
        raf = window.requestAnimationFrame(bind);
        return;
      }
      mainEl = document.querySelector('.content-area');
      const getScroller = () => {
        if (mainEl && mainEl.scrollHeight - mainEl.clientHeight > 2) return mainEl;
        if (el && el.scrollHeight - el.clientHeight > 2) return el;
        return mainEl || el;
      };
      const fn = () => {
        const sc = getScroller();
        if (!sc) return;
        const t = sc.scrollTop || 0;
        const remain = (sc.scrollHeight || 0) - (sc.clientHeight || 0) - t;
        setShowScrollTop(t > 220);
        setShowScrollBottom(remain > 220);
      };
      fn();
      el.addEventListener('scroll', fn, { passive: true });
      if (mainEl) mainEl.addEventListener('scroll', fn, { passive: true });
      if (window.ResizeObserver) {
        ro = new ResizeObserver(() => fn());
        ro.observe(el);
        if (mainEl) ro.observe(mainEl);
      }
      return () => {
        try { el && el.removeEventListener('scroll', fn); } catch { }
        try { mainEl && mainEl.removeEventListener('scroll', fn); } catch { }
        try { ro && ro.disconnect(); } catch { }
      };
    };
    const cleanup = bind();
    return () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      try { cleanup && cleanup(); } catch { }
    };
  }, [detailVisible, detailTab, detailLoading, detailError, detailRows.length]);

  // 监听项目列表变化，自动触发同步详细数据  // 云端同步按钮逻辑：即将同步云数据，覆盖本地数据，是否进行
  const handleCloudSync = async () => {
    if (!ensureRemoteAccess()) return;
    if (false) {
      openModal({
        title: '离线版本',
        message: '当前为离线版本，云端同步不可用',
        variant: 'error',
        showCancel: false
      });
      return;
    }
    if (isCloudSyncing) return;

    openModal({
      title: '云端同步确认',
      message: '即将同步云数据，覆盖本地数据，是否进行？',
      variant: 'info',
      okText: '立即同步',
      cancelText: '暂不同步',
      showCancel: true,
      onOk: async () => {
        setIsCloudSyncing(true);
        const token = localStorage.getItem('token');
        try {
          // 1. 拉取数据到未来表
          const syncResult = await ipcRenderer.invoke('sync-project-list', { token });

          if (syncResult.success) {
            await ipcRenderer.invoke('apply-future-to-now');
            Object.keys(localStorage).forEach(k => {
              if (k.startsWith('synced_detail_')) localStorage.removeItem(k);
            });
            setSyncingStatus({});
            await fetchProjects(false);
          } else {
            openModal({
              title: '云端同步失败',
              message: '从云端拉取数据失败：' + syncResult.error,
              variant: 'error',
              okText: '知道了',
              showCancel: false,
              onOk: () => { },
            });
          }
        } finally {
          setIsCloudSyncing(false);
        }
      },
    });
  };

  // 数据备份按钮逻辑 (原刷新按钮): 备份当前表，并可选择导出配置
  const handleDataBackup = async () => {
    setIsBackingUp(true);
    try {
      const backupResult = await ipcRenderer.invoke('backup-now-to-past');
      if (backupResult.success) {
        openModal({
          title: '数据备份完成',
          message: '已完成本地数据备份。\n是否导出为配置文件以便在其他客户端导入？',
          variant: 'success',
          okText: '导出配置',
          cancelText: '不导出',
          showCancel: true,
          onOk: async () => {
            const exportResult = await ipcRenderer.invoke('export-data');
            openModal({
              title: exportResult.success ? '导出成功' : '导出失败',
              message: exportResult.success
                ? `导出条数：${exportResult.count}\n文件路径：${exportResult.path}`
                : `原因：${exportResult.error}`,
              variant: exportResult.success ? 'success' : 'error',
              okText: '知道了',
              showCancel: false,
              onOk: () => { },
            });
          },
        });
      } else {
        openModal({
          title: '数据备份失败',
          message: '原因：' + backupResult.error,
          variant: 'error',
          okText: '知道了',
          showCancel: false,
          onOk: () => { },
        });
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDataImport = async () => {
    setIsBackingUp(true);
    try {
      const pick = await ipcRenderer.invoke('pick-import-file');
      if (!pick?.success) return;

      const result = await ipcRenderer.invoke('import-data', { importPath: pick.path });
      if (result.success) {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith('synced_detail_')) localStorage.removeItem(k);
        });
        setSyncingStatus({});
        await fetchProjects(false);
        openModal({
          title: '导入成功',
          message: `导入条数：${result.count}\n合并后总数：${result.total}\n\n说明：系统将根据任务 ID 重新拉取并覆盖写入详情数据。`,
          variant: 'success',
          okText: '知道了',
          showCancel: false,
          onOk: () => { },
        });
      } else {
        openModal({
          title: '导入失败',
          message: '原因：' + result.error,
          variant: 'error',
          okText: '知道了',
          showCancel: false,
          onOk: () => { },
        });
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  const triggerTaskDetailSync = async (projectId, token) => {
    setSyncingStatus(prev => ({ ...prev, [projectId]: 'syncing' }));
    try {
      const result = await ipcRenderer.invoke('sync-task-detail', { projectId, token, force: false });
      if (result.success) {
        localStorage.setItem(`synced_detail_${projectId}`, 'true');
        setSyncingStatus(prev => ({ ...prev, [projectId]: 'done' }));
        console.log(`任务 ${projectId} 详细数据已同步到 SQLite 表 "${projectId}".`);
      } else {
        setSyncingStatus(prev => ({ ...prev, [projectId]: 'error' }));
      }
    } catch (err) {
      setSyncingStatus(prev => ({ ...prev, [projectId]: 'error' }));
    }
  };

  const handleDeleteTask = async (projectId) => {
    if (!ensureRemoteAccess()) return;
    if (false) {
      openModal({
        title: '离线版本',
        message: '当前为离线版本，删除任务不可用',
        variant: 'error',
        showCancel: false
      });
      return;
    }
    openModal({
      title: '确认删除任务',
      message: `确定要删除该任务 (ID: ${projectId}) 及其关联的所有资产数据吗？\n此操作不可撤销。`,
      variant: 'error',
      okText: '确认删除',
      onOk: async () => {
        // 乐观更新 UI
        setProjects(prev => prev.filter(p => p.id !== projectId));

        // 清理本地状态?
        localStorage.removeItem(`synced_detail_${projectId}`);
        setSyncingStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[projectId];
          return newStatus;
        });

        try {
          // 通知主进程删除数据库中的记录 and 表?
          const result = await ipcRenderer.invoke('delete-task', { projectId });
          if (!result.success) {
            console.error('从数据库删除任务失败:', result.error);
            // 如果删除失败，可能需要重新获取数据以保证一致性？
            fetchProjects(true);
          }
        } catch (err) {
          console.error('任务删除期间的 IPC 错误:', err);
        }
      }
    });
  };

  const resetTaskForm = () => {
    setTaskForm({
      id: null,
      projectName: '',
      url: '',
      remark: '',
      taskPriority: '3',
      days: 0
    });
  };

  const openCreateTaskModal = () => {
    if (!ensureRemoteAccess()) return;
    if (false) {
      openModal({
        title: '离线版本',
        message: '当前网络不可用，离线版本不支持新建任务',
        variant: 'error',
        showCancel: false
      });
      return;
    }
    resetTaskForm();
    setTaskFormErrors({});
    setTaskModalMode('create');
    setTaskModalVisible(true);
  };

  const openEditRemarkModal = (project) => {
    if (!project) return;
    setTaskForm({
      id: project.id,
      projectName: project.projectName || '',
      url: project.url || '',
      remark: project.remark || '',
      taskPriority: project.taskPriority || '3',
      days: project.days || 0
    });
    setTaskFormErrors({});
    setTaskModalMode('edit');
    setTaskModalVisible(true);
  };

  const closeTaskModal = () => {
    if (taskSaving) return;
    setTaskModalVisible(false);
    setTaskFormErrors({});
    resetTaskForm();
  };

  const refreshProjectsFromRemote = async () => {
    const token = localStorage.getItem('token');
    const syncResult = await ipcRenderer.invoke('sync-project-list', { token });
    if (syncResult?.success) {
      await ipcRenderer.invoke('apply-future-to-now');
    }
    await fetchProjects(false);
  };

  const handleTaskRuntimeAction = async (project) => {
    if (!project?.id) return;
    if (!ensureRemoteAccess()) return;

    const actionMeta = getTaskActionMeta(project);
    openModal({
      title: actionMeta.type === 'stop' ? '停止任务' : '重新扫描',
      message: actionMeta.type === 'stop'
        ? `确定要停止任务 "${project.projectName || `ID ${project.id}`}" 吗？`
        : `确定要重新扫描任务 "${project.projectName || `ID ${project.id}`}" 吗？`,
      variant: 'info',
      okText: '确定',
      cancelText: '取消',
      showCancel: true,
      onOk: async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        setTaskActionStatus(prev => ({ ...prev, [project.id]: actionMeta.type }));
        try {
          const result = actionMeta.type === 'stop'
            ? await ipcRenderer.invoke('stop-project-task', { projectId: project.id, token })
            : await ipcRenderer.invoke('rescan-project-task', { projectId: project.id, token });

          if (!result?.success) {
            openModal({
              title: actionMeta.type === 'stop' ? '停止任务失败' : '重新扫描失败',
              message: result?.error || '操作失败',
              variant: 'error',
              showCancel: false
            });
            return;
          }

          await refreshProjectsFromRemote();
        } catch (error) {
          openModal({
            title: actionMeta.type === 'stop' ? '停止任务异常' : '重新扫描异常',
            message: error?.message || '操作异常',
            variant: 'error',
            showCancel: false
          });
        } finally {
          setTaskActionStatus(prev => {
            const next = { ...prev };
            delete next[project.id];
            return next;
          });
        }
      }
    });
  };

  const normalizeTaskUrlInput = (value) => {
    return String(value || '')
      .replace(/[，；]/g, ',')
      .replace(/[\r\n]+/g, ',')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .join(',');
  };

  const isValidDomain = (value) => {
    const domain = String(value || '').trim().toLowerCase();
    if (!domain || domain.length > 253) return false;
    if (domain.includes('://') || domain.includes('/') || domain.includes(':')) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return false;
    if (!domain.includes('.')) return false;
    return domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
  };

  const validateTaskForm = () => {
    const errors = {};
    const projectName = String(taskForm.projectName || '').trim();
    const normalizedDomains = normalizeTaskUrlInput(taskForm.url);
    const remark = String(taskForm.remark || '').trim();

    if (!projectName) {
      errors.projectName = '任务名称不能为空';
    }

    if (taskModalMode === 'create') {
      if (!normalizedDomains) {
        errors.url = '域名不能为空';
      } else {
        const invalidItems = normalizedDomains
          .split(',')
          .map(item => item.trim())
          .filter(item => item && !isValidDomain(item));

        if (invalidItems.length > 0) {
          errors.url = `以下内容不是合法域名: ${invalidItems.join(', ')}`;
        }
      }
    }

    setTaskFormErrors(errors);
    return { errors, projectName, url: normalizedDomains, remark };
  };

  const submitTaskModal = async () => {
    if (!canUseRemoteFeatures) return ensureRemoteAccess();
    if (false && taskModalMode === 'create') {
      openModal({
        title: '离线版本',
        message: '当前网络不可用，离线版本不支持新建任务',
        variant: 'error',
        showCancel: false
      });
      return;
    }
    const { errors, projectName, url, remark } = validateTaskForm();

    if (Object.keys(errors).length > 0) {
      openModal({
        title: '参数缺失',
        message: errors.url || errors.projectName || (taskModalMode === 'create' ? '任务名称和域名不能为空' : '任务名称不能为空'),
        variant: 'error',
        okText: '知道了',
        showCancel: false
      });
      return;
    }

    setTaskSaving(true);
    try {
      const token = localStorage.getItem('token');
      const payload = taskModalMode === 'create'
        ? { projectName, url, remark, token }
        : {
          id: taskForm.id,
          projectName,
          url,
          remark,
          token
        };
      console.group('[Tasks] submitTaskModal');
      console.log('mode =', taskModalMode);
      console.log('payload =', payload);
      const res = taskModalMode === 'create'
        ? await ipcRenderer.invoke('add-project-task', payload)
        : await ipcRenderer.invoke('update-project-remark', payload);
      console.log('ipc result =', res);
      console.groupEnd();

      if (!res?.success) {
        openModal({
          title: taskModalMode === 'create' ? '新增任务失败' : '修改失败',
          message: res?.error || '请求失败',
          variant: 'error',
          okText: '知道了',
          showCancel: false
        });
        return;
      }

      setTaskModalVisible(false);
      resetTaskForm();
      await refreshProjectsFromRemote();
      openModal({
        title: taskModalMode === 'create' ? '新增任务成功' : '修改成功',
        message: res.msg || '操作已完成',
        variant: 'success',
        okText: '知道了',
        showCancel: false
      });
    } catch (e) {
      try {
        console.error('[Tasks] submitTaskModal exception =', e);
        console.groupEnd();
      } catch { }
      openModal({
        title: taskModalMode === 'create' ? '新增任务异常' : '修改异常',
        message: e.message || '请求失败',
        variant: 'error',
        okText: '知道了',
        showCancel: false
      });
    } finally {
      setTaskSaving(false);
    }
  };


  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 详情页首页图表（纯 React + CSS/SVG）
  const DetailHome = ({ stats, pageRows }) => {
    const total = stats?.total || 0;
    const uniqueIp = stats?.uniqueIp || 0;
    const uniqueHost = stats?.uniqueHost || 0;
    const topCountries = stats?.countries || [];
    const maxCountry = topCountries[0]?.value || 1;
    const cdnYes = stats?.cdn?.yes || 0;
    const cdnNo = stats?.cdn?.no || 0;
    const cdnTotal = cdnYes + cdnNo || 1;
    const cdnPct = Math.round((cdnYes / cdnTotal) * 100);
    const countriesAll = stats?.countriesAll || [];
    const nonCdnTopArr = stats?.nonCdnTop5 || [];
    const donutSize = 150;
    const center = donutSize / 2;
    const r = 36;
    const stroke = 14;
    const C = 2 * Math.PI * r;
    const dash = (cdnYes / cdnTotal) * C;
    return (
      <div className="v11-detail-home">
        <div className="v11-kpi-grid">
          <div className="v11-kpi">
            <div className="v11-kpi-label">本地资产条数</div>
            <div className="v11-kpi-value">{total}</div>
          </div>
          <div className="v11-kpi">
            <div className="v11-kpi-label">去重IP</div>
            <div className="v11-kpi-value">{uniqueIp}</div>
          </div>
          <div className="v11-kpi">
            <div className="v11-kpi-label">Host数</div>
            <div className="v11-kpi-value">{uniqueHost}</div>
          </div>
        </div>

        <ProjectOverviewReport stats={stats} project={detailProject} />

        <div className="v11-chart-grid">
          <div className="v11-chart-card">
            <div className="v11-chart-title">国家/地区分布（Top 8）</div>
            <div className="v11-bars">
              {topCountries.map(({ name, value }) => (
                <div className="v11-bar-row" key={name}>
                  <div className="v11-bar-label">{String(name)}</div>
                  <div className="v11-bar-track">
                    <div className="v11-bar-fill" style={{ width: `${Math.max(8, (value / maxCountry) * 100)}%` }}></div>
                  </div>
                  <div className="v11-bar-value">{value}</div>
                </div>
              ))}
              {topCountries.length === 0 && <div className="v11-detail-empty-sub">暂无数据</div>}
            </div>
          </div>
          <MergedIpTop stats={stats} />
          <CdnStatsChart stats={stats} />
          <EchartsWorldChoropleth countries={countriesAll} />
        </div>
      </div>
    );
  };

  const ProjectOverviewReport = ({ stats, project }) => {
    if (!stats) return null;
    const targets = stats.targets || [];
    const initialUrls = (project?.url || '').split(';').map(u => u.trim()).filter(Boolean);
    const discoveredTargets = targets.filter(t => !initialUrls.includes(t));
    const cdnPct = Math.round((stats.cdn?.yes / (stats.cdn?.yes + stats.cdn?.no || 1)) * 100);
    const topFps = stats.topFingerprints || [];
    const mainTargetsStr = initialUrls.slice(0, 3).join('、') + (initialUrls.length > 3 ? ' 等' : '');

    return (
      <div className="v13-report-card">
        <div className="v13-report-header">
          <div className="v13-report-badge">项目概况小报</div>
          <div className="v13-report-date">{new Date().toLocaleDateString()}</div>
        </div>

        <div className="v13-report-content">
          <p className="v13-report-text">
            本次任务针对 <span className="highlight-blue">{mainTargetsStr || '当前目标'}</span> 展开了资产聚合分析。
            在 FOFA 聚合过程中，系统共识别出 <span className="highlight-white">{stats.total}</span> 条关联资产，
            其中包含 <span className="highlight-white">{stats.uniqueIp}</span> 个去重 IP 和 <span className="highlight-white">{stats.uniqueHost}</span> 个独立 Host。
          </p>

          {discoveredTargets.length > 0 && (
            <p className="v13-report-text">
              <ShieldCheck size={14} className="inline-icon" />
              通过证书和域名关联分析，系统额外识别出
              <span className="highlight-yellow"> {discoveredTargets.slice(0, 5).join('、')}{discoveredTargets.length > 5 ? ' 等' : ''} </span>
              关联目标，这些目标与主资产群组存在较强关联。
            </p>
          )}

          <div className="v13-report-grid">
            <div className="v13-report-stat">
              <div className="label">CDN 覆盖</div>
              <div className="value">{cdnPct}%</div>
              <div className="sub">{stats.cdn?.yes} 个节点已接入 CDN</div>
            </div>
            <div className="v13-report-stat">
              <div className="label">直接暴露</div>
              <div className="value text-orange">{stats.cdn?.no}</div>
            </div>
            <div className="v13-report-stat">
              <div className="label">核心组件</div>
              <div className="value-list">
                {topFps.slice(0, 3).map(f => (
                  <span key={f.name} className="mini-tag">{f.name}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="v13-report-footer">
            <Info size={12} />
            <span>基于本地 SQLite 聚合数据自动生成</span>
          </div>
        </div>
      </div>
    );
  };

  const CdnStatsChart = ({ stats }) => {
    const ref = useRef(null);
    const chartRef = useRef(null);
    const cdnYes = stats?.cdn?.yes || 0;
    const cdnNo = stats?.cdn?.no || 0;
    const total = cdnYes + cdnNo || 1;
    const cdnPct = Math.round((cdnYes / total) * 100);

    useEffect(() => {
      let disposed = false;
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const getLayout = () => {
        const w = ref.current?.clientWidth || 320;
        const h = ref.current?.clientHeight || 170;
        const minDim = Math.max(1, Math.min(w, h));
        const outer = clamp(Math.round(minDim * 0.46), 54, 86);
        const inner = clamp(Math.round(outer * 0.66), 34, 62);
        const pctFont = clamp(Math.round(minDim * 0.17), 16, 26);
        const labelFont = clamp(Math.round(minDim * 0.07), 10, 12);
        const topPct = h <= 150 ? '44%' : '43%';
        const topLabel = h <= 150 ? '63%' : '62%';
        return { outer, inner, pctFont, labelFont, topPct, topLabel };
      };

      const makeOption = () => {
        const layout = getLayout();
        return {
          animation: false,
          backgroundColor: 'transparent',
          tooltip: {
            show: true,
            trigger: 'item',
            backgroundColor: 'rgba(13, 17, 23, 0.92)',
            borderColor: 'rgba(88, 166, 255, 0.28)',
            borderWidth: 1,
            padding: [8, 10],
            textStyle: { color: '#f0f6fc', fontSize: 12 },
            formatter: '{b}: {c} ({d}%)'
          },
          series: [
            {
              name: 'CDN分布',
              type: 'pie',
              radius: [layout.inner, layout.outer],
              center: ['50%', '50%'],
              avoidLabelOverlap: true,
              animation: false,
              stillShowZeroSum: true,
              itemStyle: {
                borderRadius: 10,
                borderColor: '#0d1117',
                borderWidth: 2
              },
              label: { show: false },
              emphasis: { label: { show: false } },
              labelLine: { show: false },
              data: [
                { value: cdnYes, name: '使用CDN', itemStyle: { color: '#58a6ff' } },
                { value: cdnNo, name: '未使用CDN', itemStyle: { color: '#30363d' } }
              ]
            }
          ],
          graphic: [
            {
              type: 'text',
              left: 'center',
              top: layout.topPct,
              style: {
                text: `${cdnPct}%`,
                textAlign: 'center',
                fill: '#f0f6fc',
                fontSize: layout.pctFont,
                fontWeight: 900
              }
            },
            {
              type: 'text',
              left: 'center',
              top: layout.topLabel,
              style: {
                text: 'CDN覆盖率',
                textAlign: 'center',
                fill: '#b7c7d9',
                fontSize: layout.labelFont,
                fontWeight: 700
              }
            }
          ]
        };
      };

      (async () => {
        const echarts = await loadEcharts();
        if (disposed || !ref.current) return;
        const chart = echarts.getInstanceByDom(ref.current) || echarts.init(ref.current);
        chartRef.current = chart;
        chart.setOption(makeOption(), true);
      })();

      const onResize = () => {
        try {
          chartRef.current?.resize();
          chartRef.current?.setOption(makeOption(), true);
        } catch { }
      };
      window.addEventListener('resize', onResize);
      return () => {
        disposed = true;
        window.removeEventListener('resize', onResize);
        chartRef.current?.dispose();
      };
    }, []);

    useEffect(() => {
      try {
        chartRef.current?.setOption(
          {
            series: [
              {
                data: [
                  { value: cdnYes, name: '使用CDN', itemStyle: { color: '#58a6ff' } },
                  { value: cdnNo, name: '未使用CDN', itemStyle: { color: '#30363d' } }
                ]
              }
            ],
            graphic: [{ type: 'text', left: 'center', style: { text: `${cdnPct}%` } }]
          },
          false
        );
      } catch { }
    }, [cdnYes, cdnNo, cdnPct]);

    return (
      <div className="v11-chart-card">
        <div className="v11-chart-title">CDN 深度分析</div>
        <div style={{ height: '176px', width: '100%' }} ref={ref}></div>
        <div className="v11-cdn-meta-grid">
          <div className="v11-cdn-meta-item">
            <span className="label">接入CDN</span>
            <span className="value text-blue">{cdnYes}</span>
          </div>
          <div className="v11-cdn-meta-item has-tooltip">
            <span className="label">直接暴露</span>
            <span className="value text-dim">{cdnNo}</span>
            {stats?.allNonCdnIps?.length > 0 && (
              <div className="v13-ip-tooltip">
                <div className="tooltip-title">去重非CDN IP 列表</div>
                <div className="ip-list">
                  {stats.allNonCdnIps.map(ip => <div key={ip} className="ip-item">{ip}</div>)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const MergedIpTop = ({ stats }) => {
    const ipsTop = stats?.ips || [];
    const nonCdnTop = stats?.nonCdnTop5 || [];
    const nonCdnMap = new Map(nonCdnTop.map(it => [it.ip, it.count]));
    const list = [];
    const [copiedIp, setCopiedIp] = useState('');
    for (const it of nonCdnTop) {
      list.push({ ip: it.ip, count: it.count, noncdn: true, hosts: Array.isArray(it.hosts) ? it.hosts : [] });
    }
    for (const it of ipsTop) {
      if (!nonCdnMap.has(it.name)) {
        list.push({ ip: it.name, count: it.value, noncdn: false });
      }
    }
    const sortedList = list
      .filter(it => Number(it.count) > 0)
      .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
      .slice(0, 5);
    const maxVal = sortedList[0]?.count || 1;
    const copy = async (text) => {
      try {
        await navigator.clipboard.writeText(String(text || ''));
        setCopiedIp(String(text || ''));
        setTimeout(() => setCopiedIp(''), 1500);
      } catch { }
    };
    return (
      <div className="v11-chart-card">
        <div className="v11-chart-title">IP出现次数（合并Top 5）</div>
        <div className="v11-bars">
          {sortedList.map(it => (
            <div className="v11-bar-row" key={it.ip}>
              <div className="v11-bar-label mono" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="v11-ip-copy" onClick={() => copy(it.ip)} title="点击复制">
                  {it.ip}
                </span>
                {copiedIp === it.ip && <span className="v11-copied-tip">已复制</span>}
                {it.noncdn && <span className="v11-badge green">非CDN</span>}
              </div>
              <div className={`v11-bar-track ${it.noncdn ? 'green' : ''}`}>
                <div
                  className="v11-bar-fill"
                  style={{ width: `${Math.max(8, (Number(it.count) / maxVal) * 100)}%` }}
                ></div>
              </div>
              <div className="v11-bar-value">{it.count}</div>
              {it.noncdn && it.hosts && it.hosts.length > 0 && (
                <div className="v11-host-chips">
                  {it.hosts.slice(0, 3).map((h, idx) => (
                    <span key={h + idx} className="v11-host-chip">{h}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {sortedList.length === 0 && <div className="v11-detail-empty-sub">暂无数据</div>}
        </div>
      </div>
    );
  };

  const DetailFofa = ({ rows, pageNum, pageSize, total, onPrev, onNext, onJump, onPageSizeChange, searchTerm, onSearch, targetFilter, onTargetChange, stats, projectId }) => {
    const totalPages = Math.ceil(total / pageSize) || 1;
    const [jumpPage, setJumpPage] = useState(pageNum);
    const [localSearch, setLocalSearch] = useState(searchTerm);
    const [historyVisible, setHistoryVisible] = useState(false);
    const [history, setHistory] = useState([]);
    const historyRef = useRef(null);

    useEffect(() => {
      setJumpPage(pageNum);
    }, [pageNum]);

    useEffect(() => {
      setLocalSearch(searchTerm);
    }, [searchTerm]);

    // 加载历史记录
    const loadHistory = async () => {
      try {
        const res = await ipcRenderer.invoke('get-search-history', { projectId });
        if (res.success) setHistory(res.rows || []);
      } catch { }
    };

    useEffect(() => {
      loadHistory();
    }, [projectId]);

    // 点击外部关闭历史记录
    useEffect(() => {
      const handleGlobalClick = (e) => {
        if (historyRef.current && !historyRef.current.contains(e.target)) {
          setHistoryVisible(false);
        }
      };
      document.addEventListener('mousedown', handleGlobalClick);
      return () => document.removeEventListener('mousedown', handleGlobalClick);
    }, []);

    const handleSearch = (val) => {
      onSearch(val);
      setHistoryVisible(false);
      if (val && val.trim()) {
        ipcRenderer.invoke('add-search-history', { projectId, keyword: val }).then(loadHistory);
      }
    };

    const deleteHistoryItem = async (e, item) => {
      e.stopPropagation();
      openModal({
        title: '删除历史记录',
        message: `确定要删除该条搜索历史吗?`,
        variant: 'info',
        onOk: async () => {
          try {
            await ipcRenderer.invoke('delete-search-history', { projectId, keyword: item });
            loadHistory();
          } catch { }
        }
      });
    };

    return (
      <div className="v11-detail-table-wrap">
        <div className="v11-fofa-sticky-header">
          <div className="v11-fofa-filter-row">
            <div className="v11-fofa-search-container" ref={historyRef}>
              <div className="v11-fofa-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="按下回车搜索 (包含关系)..."
                  value={localSearch}
                  onFocus={() => { loadHistory(); setHistoryVisible(true); }}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(localSearch)}
                />
                {localSearch && (
                  <button className="v11-search-clear" onClick={() => { setLocalSearch(''); handleSearch(''); }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              {historyVisible && history.length > 0 && (
                <div className="v11-search-history">
                  <div className="history-title">搜索历史</div>
                  {history.map((item, i) => (
                    <div key={i} className="history-item" onClick={() => { setLocalSearch(item); handleSearch(item); }}>
                      <History size={12} />
                      <span className="text">{item}</span>
                      <button className="delete-btn" onClick={(e) => deleteHistoryItem(e, item)}>
                        <Trash size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="v11-fofa-select-group">
              <span className="label">目标:</span>
              <select value={targetFilter} onChange={(e) => onTargetChange(e.target.value)}>
                <option value="">全部</option>
                {(stats?.targets || []).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="v11-table-toolbar no-border">
            <div className="v11-table-title">FOFA资产聚合 ({total})</div>
            <div className="v11-table-pager">
              <div className="v11-pager-size-select">
                <span className="label">每页显示:</span>
                <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>

              <div className="v11-pager-controls">
                <button className="v11-pager-btn" disabled={pageNum <= 1} onClick={onPrev}>上一页</button>
                <div className="v11-pager-text">第 {pageNum} / {totalPages} 页</div>
                <button className="v11-pager-btn" disabled={pageNum >= totalPages} onClick={onNext}>下一页</button>
              </div>

              <div className="v11-pager-jump">
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onJump(Number(jumpPage))}
                />
                <button className="v11-jump-btn" onClick={() => onJump(Number(jumpPage))}>跳转</button>
              </div>
            </div>
          </div>
        </div>

        <div className="v11-fofa-list">
          {rows.map((r, idx) => (
            <FofaAssetCard key={r.id ? r.id : idx} asset={r} onIconClick={(h) => handleSearch(h)} />
          ))}
          {rows.length === 0 && (
            <DetailSectionEmpty title="未找到匹配数据" sub="请尝试调整搜索关键词或筛选条件。" />
          )}
        </div>
      </div>
    );
  };

  const FofaAssetCard = ({ asset, onIconClick }) => {
    const [favicon, setFavicon] = useState(null);
    const host = (asset.host || '').toString().trim();
    const openTarget = (host || asset.ip || '').toString().trim();
    const externalUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(openTarget)
      ? openTarget
      : (openTarget ? ('http://' + openTarget) : '');

    useEffect(() => {
      if (!host) return;
      let alive = true;
      (async () => {
        try {
          const cached = await ipcRenderer.invoke('get-favicon', { host });
          if (cached.success && cached.dataUrl) {
            if (alive) setFavicon(cached.dataUrl);
            return;
          }

          const domain = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
          const faviconUrl = 'https://www.google.com/s2/favicons?sz=64&domain_url=' + domain;

          const res = await fetch(faviconUrl);
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64data = reader.result;
            if (alive) setFavicon(base64data);
            await ipcRenderer.invoke('save-favicon', { host, dataUrl: base64data });
          };
          reader.readAsDataURL(blob);
        } catch (e) {
          console.error('Favicon 加载失败:', e);
        }
      })();
      return () => { alive = false; };
    }, [host]);

    const title = (asset.title || asset['title-extra'] || '').toString().trim() || '-';
    const location = [asset.region, asset.city].filter(Boolean).join(' / ') || asset.countryName || '-';
    const fingerprintTags = String(asset.fingerprint || '')
      .split(/[;；]+/)
      .map(item => item.trim())
      .filter(Boolean);

    return (
      <div className="v12-fofa-card">
        <div className="v12-card-main">
          <div className="v12-host-line">
            <div
              className="v12-favicon-wrapper clickable"
              onClick={() => {
                const domain = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
                onIconClick(domain);
              }}
              title="点击查看网站图标"
              style={{ cursor: 'pointer' }}
            >
              {favicon ? <img src={favicon} alt="icon" /> : <Globe size={16} />}
            </div>
            <a
              href={externalUrl || '#'}
              className="v12-host-link"
              onClick={(e) => {
                e.preventDefault();
                if (!externalUrl) return;
                ipcRenderer.send('open-external', externalUrl);
              }}
            >
              {host || asset.ip}
            </a>
            {asset.port && <span className="v12-port-tag">{asset.port}</span>}
            {asset.protocol && <span className="v12-proto-tag">{asset.protocol}</span>}
          </div>

          <div className="v12-info-grid">
            <div className="v12-info-item">
              <span className="label">IP地址</span>
              <span className="value mono">{asset.ip}</span>
            </div>
            <div className="v12-info-item">
              <span className="label">地理位置</span>
              <span className="value">{location}</span>
            </div>
            {asset.server && (
              <div className="v12-info-item">
                <span className="label">服务端</span>
                <span className="value">{asset.server}</span>
              </div>
            )}
            {asset.domain && (
              <div className="v12-info-item">
                <span className="label">主域名</span>
                <span className="value mono">{asset.domain}</span>
              </div>
            )}
          </div>

          <div className="v12-title-section">
            <div className="v12-title-text" title={title}>{title}</div>
          </div>
        </div>

        <div className="v12-card-side">
          <div className="v12-side-title">指纹与组件</div>
          <div className="v12-fingerprints">
            {fingerprintTags.length > 0 ? (
              fingerprintTags.map((fp, i) => (
                <span key={fp + '-' + i} className="v12-fp-tag">{fp}</span>
              ))
            ) : (
              <span className="v12-no-fp">未识别到指纹</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const EchartsWorldChoropleth = ({ countries }) => {
    const ref = useRef(null);
    const chartRef = useRef(null);
    const dataArr = useMemo(() => Array.isArray(countries) ? countries : [], [countries]);
    const [nameMaps, setNameMaps] = useState({ zhToEn: {}, enToZh: {} });

    useEffect(() => {
      let alive = true;
      (async () => {
        try {
          const maps = await loadWorldCountryNameMaps();
          if (alive) setNameMaps(maps || { zhToEn: {}, enToZh: {} });
        } catch {
          if (alive) setNameMaps({ zhToEn: {}, enToZh: {} });
        }
      })();
      return () => { alive = false; };
    }, []);

    useEffect(() => {
      let disposed = false;
      (async () => {
        try {
          const echarts = await loadEcharts();
          if (disposed || !ref.current) return;

          const geoRes = await fetch('https://echarts.apache.org/examples/data/asset/geo/world.json');
          const geoJson = await geoRes.json();
          if (disposed || !ref.current) return;

          echarts.registerMap('world', geoJson);
          const chart = echarts.init(ref.current);
          chartRef.current = chart;

          const normalize = (s) => String(s || '')
            .toLowerCase()
            .replace(/\(.*?\)/g, '')
            .replace(/,.*$/g, '')
            .replace(/['’]/g, '')
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9]+/g, '');

          const geoNames = (geoJson?.features || [])
            .map(feature => String(feature?.properties?.name || '').trim())
            .filter(Boolean);

          const aliasToGeo = {
            'United States of America': 'United States',
            'USA': 'United States',
            'US': 'United States',
            'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
            'Russian Federation': 'Russia',
            'Korea, Republic of': 'South Korea',
            "Korea, Democratic People's Republic of": 'North Korea',
            'Iran, Islamic Republic of': 'Iran',
            'Syrian Arab Republic': 'Syria',
            "Lao People's Democratic Republic": 'Laos',
            'Viet Nam': 'Vietnam',
            'Holy See': 'Vatican',
            'Bolivia, Plurinational State of': 'Bolivia',
            'Venezuela, Bolivarian Republic of': 'Venezuela',
            'Tanzania, United Republic of': 'Tanzania',
            'Moldova, Republic of': 'Moldova',
            'Hong Kong SAR': 'Hong Kong',
            'Hong Kong SAR China': 'Hong Kong',
            'HONGKONG': 'Hong Kong',
            'Hongkong': 'Hong Kong',
            'Hong-kong': 'Hong Kong',
            'Taiwan, Province of China': 'Taiwan',
            'Macau': 'Macao',
            'Macao': 'Macao'
          };

          const geoZhFallback = {
            'United States': '美国',
            'United Kingdom': '英国',
            'Russia': '俄罗斯',
            'South Korea': '韩国',
            'North Korea': '朝鲜',
            'Iran': '伊朗',
            'Syria': '叙利亚',
            'Laos': '老挝',
            'Vietnam': '越南',
            'Vatican': '梵蒂冈',
            'Bolivia': '玻利维亚',
            'Venezuela': '委内瑞拉',
            'Tanzania': '坦桑尼亚',
            'Moldova': '摩尔多瓦',
            'Taiwan': '中国台湾',
            'Macao': '中国澳门',
            'Czech Republic': '捷克',
            'Bosnia and Herz.': '波黑',
            'Dominican Rep.': '多米尼加',
            'Central African Rep.': '中非',
            'S. Sudan': '南苏丹',
            'Dem. Rep. Congo': '刚果（金）',
            'Congo': '刚果（布）',
            'Solomon Is.': '所罗门群岛',
            'Eq. Guinea': '赤道几内亚',
            'eSwatini': '斯威士兰',
            'N. Cyprus': '北塞浦路斯',
            'Palestine': '巴勒斯坦',
            'W. Sahara': '西撒哈拉'
          };

          const normalizedGeoMap = new Map();
          geoNames.forEach((geoName) => {
            normalizedGeoMap.set(normalize(geoName), geoName);
          });
          Object.entries(aliasToGeo).forEach(([alias, geoName]) => {
            normalizedGeoMap.set(normalize(alias), geoName);
          });

          const zhToEn = nameMaps?.zhToEn || {};
          const enToZh = nameMaps?.enToZh || {};
          const zhLabelMap = {};
          geoNames.forEach((geoName) => {
            zhLabelMap[geoName] = enToZh[geoName] || geoZhFallback[geoName] || geoName;
          });

          // 支持常见 Alpha-2/Alpha-3 国家/地区代码
          const codesToGeo = {
            'cn': 'China', 'chn': 'China',
            'hk': 'Hong Kong', 'hkg': 'Hong Kong',
            'mo': 'Macao', 'mac': 'Macao',
            'tw': 'Taiwan', 'twn': 'Taiwan'
          };

          const resolveGeoName = (rawName) => {
            const raw = String(rawName || '').trim();
            if (!raw) return null;
            // 先处理代码形式（如 HK、TW、MO、CN，以及 HKG/TWN/MAC/CHN）
            const directKey = raw.replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (codesToGeo[directKey]) return codesToGeo[directKey];
            const tokenMatches = raw.match(/\b([A-Za-z]{2,3})\b/g);
            if (Array.isArray(tokenMatches)) {
              for (const tk of tokenMatches) {
                const k = tk.toLowerCase();
                if (codesToGeo[k]) return codesToGeo[k];
              }
            }
            let maybeEn = raw;
            if (/[\u4e00-\u9fff]/.test(raw)) {
              // 中文名预处理：去掉前缀“中国”与后缀行政区称谓
              const zhNorm = raw
                .replace(/^中国/, '')
                .replace(/特别行政区|自治区|省|市|地区/g, '')
                .trim();
              maybeEn = zhToEn[zhNorm] || zhToEn[raw] || zhNorm || raw;
              // 处理常见中文变体
              if (/^香港/.test(raw)) maybeEn = 'Hong Kong';
              if (/^澳门/.test(raw)) maybeEn = 'Macao';
              if (/^台湾/.test(raw)) maybeEn = 'Taiwan';
            }
            // 先命中别名，再查 geo 名称
            const aliasHit = normalizedGeoMap.get(normalize(aliasToGeo[maybeEn] || maybeEn));
            return aliasHit || null;
          };

          const valueMap = new Map();
          const aggregateToChina = (geoName) => {
            const n = String(geoName || '').trim();
            if (!n) return null;
            const norm = normalize(n);
            if (
              norm === 'hongkong' ||
              norm === 'hongkongsar' ||
              norm === 'hongkongsarchina' ||
              norm === 'macao' ||
              norm === 'macau' ||
              norm === 'macaosar' ||
              norm === 'macaosarchina' ||
              norm === 'taiwan'
            ) {
              return 'China';
            }
            return geoName;
          };
          dataArr.forEach((item) => {
            const geoName = resolveGeoName(item?.name);
            const value = Number(item?.value || 0);
            if (!geoName || !Number.isFinite(value) || value <= 0) return;
            const aggName = aggregateToChina(geoName);
            if (!aggName) return;
            valueMap.set(aggName, (valueMap.get(aggName) || 0) + value);
          });

          const values = Array.from(valueMap.values()).filter(value => value > 0);
          const max = Math.max(1, ...values);
          const pieceColors = ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8'];
          const steps = [0.2, 0.4, 0.6, 0.8, 1];
          const pieces = steps.map((ratio, index) => {
            const min = index === 0 ? 1 : Math.floor(max * steps[index - 1]) + 1;
            const maxValue = Math.max(min, Math.floor(max * ratio));
            return { min, max: maxValue, label: String(min) + ' - ' + String(maxValue), color: pieceColors[index] };
          });

          const getPieceColor = (value) => {
            const matched = pieces.find(piece => value >= piece.min && value <= piece.max);
            return matched?.color || pieceColors[pieceColors.length - 1];
          };

          const seriesData = geoNames.map((geoName) => {
            const value = valueMap.get(geoName) || 0;
            return {
              name: geoName,
              value,
              itemStyle: {
                areaColor: value > 0 ? getPieceColor(value) : '#11263b',
                borderColor: value > 0 ? 'rgba(147, 197, 253, 0.45)' : 'rgba(96, 165, 250, 0.18)',
                borderWidth: value > 0 ? 0.9 : 0.7
              },
              label: {
                show: value > 0
              }
            };
          });

          chart.setOption({
            animation: false,
            tooltip: {
              trigger: 'item',
              backgroundColor: 'rgba(13, 17, 23, 0.92)',
              borderColor: 'rgba(88, 166, 255, 0.35)',
              borderWidth: 1,
              padding: [10, 14],
              textStyle: { color: '#f0f6fc', fontSize: 13 },
              formatter: (params) => {
                const value = Number(params?.data?.value || 0);
                const label = String(zhLabelMap[params.name] || params.name || '').trim() || '未知地区';
                return '<div style="font-weight:800;margin-bottom:4px;color:#93c5fd;">' + label + '</div><span style="color:#cbd5e1;">数量：</span><span style="font-weight:800;color:#fff;">' + value + '</span>';
              },
            },
            visualMap: {
              show: true,
              type: 'piecewise',
              left: 18,
              bottom: 18,
              orient: 'vertical',
              itemWidth: 18,
              itemHeight: 12,
              itemGap: 8,
              textGap: 10,
              textStyle: { color: '#dbe6f3', fontSize: 12 },
              backgroundColor: 'rgba(13, 17, 23, 0.78)',
              borderColor: 'rgba(96, 165, 250, 0.34)',
              borderWidth: 1,
              padding: [10, 12],
              pieces,
              outOfRange: { color: '#11263b' }
            },
            series: [{
              type: 'map',
              map: 'world',
              roam: true,
              selectedMode: false,
              label: {
                show: true,
                color: '#e6f0ff',
                fontSize: 10,
                lineHeight: 13,
                formatter: (params) => {
                  const value = Number(params?.data?.value || 0);
                  const label = String(zhLabelMap[params.name] || params.name || '').trim();
                  if (!value || !label) return '';
                  return label + '\n' + value;
                },
                textBorderColor: 'rgba(13, 17, 23, 0.95)',
                textBorderWidth: 3
              },
              emphasis: {
                label: {
                  show: true,
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 700,
                  formatter: (params) => {
                    const value = Number(params?.data?.value || 0);
                    const label = String(zhLabelMap[params.name] || params.name || '').trim() || '未知地区';
                    return value > 0 ? (label + '\n' + value) : label;
                  }
                },
                itemStyle: {
                  areaColor: '#38bdf8',
                  borderColor: '#dbeafe',
                  borderWidth: 1.3
                }
              },
              data: seriesData
            }],
          });
        } catch (e) {
          if (ref.current) {
            ref.current.innerHTML = '<div style="padding:16px;color:#8b949e;">世界地图加载失败</div>';
          }
        }
      })();

      const onResize = () => {
        try {
          chartRef.current?.resize();
        } catch { }
      };
      window.addEventListener('resize', onResize);
      return () => {
        disposed = true;
        window.removeEventListener('resize', onResize);
        try {
          chartRef.current?.dispose();
        } catch { }
      };
    }, [JSON.stringify(dataArr), JSON.stringify(nameMaps)]);

    return (
      <div className="v11-chart-card span-3">
        <div className="v11-chart-title">世界区域分布</div>
        <div className="v11-amap-wrap">
          <div ref={ref} className="v11-amap-canvas" />
        </div>
      </div>
    );
  };
  const fetchProjects = async (isSilent = false) => {
    if (!isSilent) setLoading(true);

    setError(null);
    try {
      const localResult = await ipcRenderer.invoke('get-local-projects');

      if (localResult.success) {
        setProjects(localResult.rows || []);
        setTotal(localResult.rows.length);
      } else {
        throw new Error('无法同步且本地数据库无数据');
      }
    } catch (err) {
      setError('数据链路异常，正在尝试读取本地缓存...');
    } finally {
      setLoading(false);
    }
  };

  // Memoized filtering logic
  const filteredProjects = React.useMemo(() => {
    return projects.filter(project => {
      const matchesSearch = project.projectName.toLowerCase().includes(searchTerm.toLowerCase());

      if (!statusFilter) return matchesSearch;

      const matchesStatus =
        (statusFilter === 'running' && project.step?.includes('运行')) ||
        (statusFilter === 'completed' && project.step?.includes('完成')) ||
        (statusFilter === 'idle' && !project.step?.includes('运行') && !project.step?.includes('完成'));

      return matchesSearch && matchesStatus;
    });
  }, [projects, searchTerm, statusFilter]);

  const runningProjectsCount = React.useMemo(
    () => projects.filter(p => p.step?.includes('运行')).length,
    [projects]
  );
  const isTaskSearchActive = Boolean(searchTerm.trim() || statusFilter);

  const getStatusIcon = (step) => {
    if (step?.includes('完成') || step?.includes('done')) return <CheckCircle2 size={18} className="text-success" />;
    if (step?.includes('运行') || step?.includes('running')) return <Play size={18} className="text-running spinning-slow" />;
    return <Clock size={18} className="text-idle" />;
  };

  const isTaskRunning = (project) => {
    const status = String(project?.status || '').trim();
    return status == '1';
  };

  const getTaskActionMeta = (project) => {
    if (isTaskRunning(project)) {
      return {
        type: 'stop',
        title: '停止任务',
        icon: <Square size={14} />
      };
    }

      return {
        type: 'rescan',
        title: '重新探测',
        icon: <RotateCcw size={14} />
      };
  };

  const mapStatusToChinese = (statusText) => {
    if (!statusText) return '待命';
    const mapping = {
      'running': '任务运行中',
      'done': '任务完成',
      'completed': '任务完成',
      'error': '任务异常',
      'stopped': '停止探测',
      'asset': '资产收集',
      'title': '标题探测',
      'fingerprint': '指纹识别',
      'shodan': 'shodan聚合',
      'subdomain': '子域名探测',
      'pending': '等待中',
      'waiting': '等待中'
    };

    // 模糊匹配逻辑
    for (const [en, zh] of Object.entries(mapping)) {
      if (statusText.toLowerCase().includes(en)) return zh;
    }
    return statusText; // 如果没匹配到则返回原值（可能是中文）
  };

  const getStepsStatus = (project) => {
    const steps = [
      { key: 'asset', label: '资产收集' },
      { key: 'title', label: '标题探测' },
      { key: 'fingerprint', label: '指纹识别' },
      { key: 'shodan', label: 'shodan聚合' },
      { key: 'subdomain', label: '子域名探测' }
    ];

    const stepText = project.step?.toLowerCase() || '';

    // Determine status for each step first
    const statuses = steps.map((step, index) => {
    let status = 'idle'; // idle, running, done, error

      if (stepText.includes('完成') || stepText.includes('done')) {
        status = 'done';
      } else if (stepText.includes('运行') || stepText.includes('running')) {
        // This is a hardcoded assumption based on previous logic
        if (index < 2) status = 'done';
        else if (index === 2) status = 'running';
        else status = 'idle';
      } else if (stepText.includes('停止') || stepText.includes('error')) {
        if (index === 0) status = 'done';
        else if (index === 1) status = 'error';
        else status = 'idle';
      }
      return { ...step, status };
    });

    // Post-process to add a special class for the connector animation
    const runningIndex = statuses.findIndex(s => s.status === 'running');
    if (runningIndex > 0) {
      // Add a 'pre-running' class to the step right before the running one
      statuses[runningIndex - 1].status += ' pre-running';
    }

    return statuses;
  };

  const getSyncIndicator = (projectId) => {
    const isSynced = localStorage.getItem('synced_detail_' + projectId);
    const status = syncingStatus[projectId];

    if (status === 'syncing') {
      return (
        <div className="v10-sync-status syncing" title="正在拉取全量数据并备份到本地数据库...">
          <RefreshCw size={14} className="spinning" />
          <span>同步详情中...</span>
        </div>
      );
    }

    if (isSynced || status === 'done') {
      return (
        <div className="v10-sync-status done" title="已成功备份全量数据到本地 SQLite">
          <HardDrive size={14} />
          <span>已同步</span>
        </div>
      );
    }

    return null;
  };

  const DetailSectionEmpty = ({
    title = '暂无匹配数据',
    sub = '请尝试调整筛选条件后重试。'
  }) => (
    <div className="v11-detail-empty v11-detail-empty-block">
      <div className="v11-detail-empty-title">{title}</div>
      <div className="v11-detail-empty-sub">{sub}</div>
    </div>
  );

  const DetailSectionHeader = ({ title, count, children, extra = null }) => (
    <div className="v11-fofa-sticky-header v18-sticky-header">
      {children ? <div className="v18-detail-filter-wrap">{children}</div> : null}
      <div className="v18-detail-toolbar">
        <div className="v18-detail-title-group">
          <div className="v18-detail-title">{count !== undefined ? `${title} (${count})` : title}</div>
        </div>
        {extra ? <div className="v18-detail-extra">{extra}</div> : null}
      </div>
    </div>
  );

  const DetailRelatedAssets = ({ rows, loading: tabLoading, error: tabError }) => {
    if (tabLoading) {
      return (
        <div className="v11-detail-loading">
          <Loader2 className="spinning-icon" size={28} />
          <div className="v11-detail-loading-text">正在整理关联资产...</div>
        </div>
      );
    }

    if (tabError) {
      return (
        <DetailSectionEmpty title="关联资产加载失败" sub={tabError} />
      );
    }

    if (!rows.length) {
      return (
        <DetailSectionEmpty title="暂无关联资产" sub="当前任务表里没有可归并的域名资产数据。" />
      );
    }

    return (
      <div className="v18-related-panel">
        <DetailSectionHeader title="关联资产" count={rows.length} />
        <div className="v18-related-table">
          <div className="v18-related-head">
            <div>目标</div>
            <div>关联域名</div>
            <div>数据来源</div>
          </div>
          <div className="v18-related-body">
            {rows.map((row) => (
              <div key={String(row.relatedDomain) + '-' + String(row.id)} className="v18-related-row">
                <div className="v18-related-targets">
                  <span className="v18-related-target-tag">{row.target}</span>
                </div>
                <div className="v18-related-domain-cell">
                  <span
                    className="v18-related-domain clickable"
                    onClick={() => loadDomainDetail(row.relatedDomain)}
                    title={'点击查看 ' + row.relatedDomain + ' 的详细数据'}
                  >
                    {row.relatedDomain}
                  </span>
                </div>
                <div className="v18-related-source-cell">
                  <div className="v18-related-source-wrapper">
                    <span className="v18-related-source">{row.source}</span>
                    <div className="v18-source-help-icon" title={row.sourceFullRecord ? JSON.stringify(row.sourceFullRecord, null, 2) : '无完整数据'}>
                      <HelpCircle size={14} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderIpAggregationSearchBar = ({ 
    ipSearchTerm, setIpSearchTerm, 
    portSearchTerm, setPortSearchTerm, 
    ipTargetFilter, setIpTargetFilter, 
    handleKeyDown, 
    targets, setIpSearchApplied 
  }) => (
    <div className="v11-fofa-filter-row v18-filter-row">
      <div className="v11-fofa-search" style={{ flex: 1 }}>
        <Search size={16} />
        <input
          type="text"
          placeholder="按回车筛选 IP..."
          value={ipSearchTerm}
          onChange={(e) => setIpSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="v11-fofa-search" style={{ flex: 1 }}>
        <Search size={16} />
        <input
          type="text"
          placeholder="按回车筛选端口..."
          value={portSearchTerm}
          onChange={(e) => setPortSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="v11-fofa-select-group">
        <span className="label">目标:</span>
        <select value={ipTargetFilter} onChange={(e) => {
          setIpTargetFilter(e.target.value);
          setIpSearchApplied(prev => ({ ...prev, target: e.target.value }));
        }}>
          <option value="">全部</option>
          {targets.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
    </div>
  );

  const renderCountryStatsSearchBar = ({ 
    countrySearchTerm, setCountrySearchTerm, 
    countryTargetFilter, setCountryTargetFilter, 
    handleKeyDown, 
    targets, setCountrySearchApplied 
  }) => (
    <div className="v11-fofa-filter-row v18-filter-row">
      <div className="v11-fofa-search" style={{ flex: 1 }}>
        <Search size={16} />
        <input
          type="text"
          placeholder="按回车搜索国家（精确）..."
          value={countrySearchTerm}
          onChange={(e) => setCountrySearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="v11-fofa-select-group">
        <span className="label">目标:</span>
        <select value={countryTargetFilter} onChange={(e) => {
          setCountryTargetFilter(e.target.value);
          setCountrySearchApplied(prev => ({ ...prev, target: e.target.value }));
        }}>
          <option value="">全部</option>
          {targets.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
    </div>
  );

  const renderFingerprintSearchBar = ({ 
    fpSearchTerm, setFpSearchTerm, 
    fpCategoryFilter, setFpCategoryFilter,
    fpTargetFilter, setFpTargetFilter, 
    handleKeyDown, 
    targets, setFpSearchApplied 
  }) => (
    <div className="v18-fp-header">
      <div className="v18-fp-header-search">
        <div className="v11-fofa-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="按回车搜索指纹（模糊）..."
            value={fpSearchTerm}
            onChange={(e) => setFpSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
      <div className="v18-fp-header-select">
        <div className="v11-fofa-select-group">
          <span className="label">分类:</span>
          <select value={fpCategoryFilter} onChange={(e) => {
            setFpCategoryFilter(e.target.value);
            setFpSearchApplied(prev => ({ ...prev, category: e.target.value }));
          }}>
            <option value="">全部</option>
            <option value="Web Server">Web Server</option>
            <option value="Framework/Library">Framework/Library</option>
            <option value="CMS">CMS</option>
            <option value="Security/WAF">Security/WAF</option>
            <option value="DevOps/Tool">DevOps/Tool</option>
            <option value="Database/Cache">Database/Cache</option>
            <option value="Others">Others</option>
          </select>
        </div>
      </div>
      <div className="v18-fp-header-select">
        <div className="v11-fofa-select-group">
          <span className="label">目标:</span>
          <select value={fpTargetFilter} onChange={(e) => {
            setFpTargetFilter(e.target.value);
            setFpSearchApplied(prev => ({ ...prev, target: e.target.value }));
          }}>
            <option value="">全部</option>
            {targets.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="v18-fp-header-actions">
        <button
          className="v11-jump-btn"
          onClick={() => setFpSearchApplied(prev => ({ ...prev, name: fpSearchTerm, category: fpCategoryFilter, target: fpTargetFilter }))}
          title="应用筛选"
        >应用</button>
        <button
          className="v11-jump-btn"
          onClick={() => { setFpSearchTerm(''); setFpCategoryFilter(''); setFpTargetFilter(''); setFpSearchApplied({ name: '', category: '', target: '' }); }}
          title="清空筛选"
        >清空</button>
      </div>
    </div>
  );

  const DetailFingerprintStats = ({
    rows,
    loading: tabLoading,
    error: tabError,
    stats,
    fpSearchTerm,
    setFpSearchTerm,
    fpCategoryFilter,
    setFpCategoryFilter,
    fpTargetFilter,
    setFpTargetFilter,
    fpSearchApplied,
    setFpSearchApplied,
    onOpenFingerprintDetail
  }) => {
    const handleSearch = () => {
      setFpSearchApplied({
        name: fpSearchTerm,
        category: fpCategoryFilter,
        target: fpTargetFilter
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    };

    const filteredRows = useMemo(() => {
      return rows.filter(row => {
        const matchesName = row.name.toLowerCase().includes(fpSearchApplied.name.toLowerCase());
        const matchesCategory = !fpSearchApplied.category || row.category === fpSearchApplied.category;
        const matchesTarget = !fpSearchApplied.target || row.targets.includes(fpSearchApplied.target);
        return matchesName && matchesCategory && matchesTarget;
      });
    }, [rows, fpSearchApplied]);

    if (tabLoading) {
      return (
        <div className="v11-detail-loading">
          <Loader2 className="spinning-icon" size={28} />
          <div className="v11-detail-loading-text">正在分析指纹数据...</div>
        </div>
      );
    }

    if (tabError) {
      return (
        <DetailSectionEmpty title="指纹统计加载失败" sub={tabError} />
      );
    }

    return (
      <div className="v18-related-panel">
        <DetailSectionHeader
          title="指纹统计"
          count={filteredRows.length}
          children={renderFingerprintSearchBar({
            fpSearchTerm,
            setFpSearchTerm,
            fpCategoryFilter,
            setFpCategoryFilter,
            fpTargetFilter,
            setFpTargetFilter,
            handleKeyDown,
            targets: stats?.targets || [],
            setFpSearchApplied
          })}
        />

        <div className="v18-fp-card-grid">
          {filteredRows.map((row) => (
            <div
              key={row.name}
              className="v18-fp-card"
              onClick={() => onOpenFingerprintDetail?.(row.name)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpenFingerprintDetail?.(row.name);
              }}
              title={'点击查看包含指纹 ' + row.name + ' 的详细资产'}
            >
              <div className="v18-fp-card-top">
                <div className="v18-fp-card-name">{row.name}</div>
                <div className="v18-fp-card-count">{row.count}</div>
              </div>
              <div className="v18-fp-card-bot">
                <span className={`v18-fp-category-tag ${row.category.toLowerCase().replace('/', '-')}`}>{row.category}</span>
                <span className="v18-fp-card-meta">{Array.isArray(row.targets) ? `目标 ${row.targets.length}` : ''}</span>
              </div>
            </div>
          ))}
          {filteredRows.length === 0 && (
            <DetailSectionEmpty title="暂无匹配的指纹数据" sub="请尝试调整指纹名称、分类或目标筛选条件。" />
          )}
        </div>
      </div>
    );
  };

  const DetailCountryStats = ({
    rows,
    allRows,
    loading: tabLoading,
    error: tabError,
    stats,
    countrySearchTerm,
    setCountrySearchTerm,
    countryTargetFilter,
    setCountryTargetFilter,
    countrySearchApplied,
    setCountrySearchApplied,
    onOpenCountryDetail
  }) => {
    const handleSearch = () => {
      setCountrySearchApplied({
        country: countrySearchTerm,
        target: countryTargetFilter
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    };

    const filteredRows = useMemo(() => {
      if (countrySearchApplied.country) {
        return allRows.filter(row => {
          const matchesCountry = row.country === countrySearchApplied.country;
          const matchesTarget = !countrySearchApplied.target || row.targets.includes(countrySearchApplied.target);
          return matchesCountry && matchesTarget;
        });
      }

      return rows.filter(row => {
        const matchesTarget = !countrySearchApplied.target || row.targets.includes(countrySearchApplied.target);
        return matchesTarget;
      });
    }, [rows, allRows, countrySearchApplied]);

    if (tabLoading) {
      return (
        <div className="v11-detail-loading">
          <Loader2 className="spinning-icon" size={28} />
          <div className="v11-detail-loading-text">正在统计国家分布...</div>
        </div>
      );
    }

    if (tabError) {
      return (
        <DetailSectionEmpty title="国家统计加载失败" sub={tabError} />
      );
    }

    const maxCount = Math.max(...filteredRows.map(r => r.count), 1);

    return (
      <div className="v18-related-panel">
        <DetailSectionHeader
          title="国家统计"
          count={filteredRows.length}
          extra={<div className="v18-detail-top-note">按资产数量排序</div>}
        >
          {renderCountryStatsSearchBar({
            countrySearchTerm,
            setCountrySearchTerm,
            countryTargetFilter,
            setCountryTargetFilter,
            handleKeyDown,
            targets: stats?.targets || [],
            setCountrySearchApplied
          })}
        </DetailSectionHeader>

        <div className="v18-country-stats-container">
          <div className="v18-bar-chart">
            {filteredRows.map((row) => (
              <div key={row.country} className="v18-bar-item" onClick={() => onOpenCountryDetail?.(row.country)}>
                <div className="v18-bar-label" title={row.country}>{row.country}</div>
                <div className="v18-bar-track">
                  <div 
                    className="v18-bar-fill" 
                    style={{ width: `${(row.count / maxCount) * 100}%` }}
                  >
                    <span className="v18-bar-count">{row.count}</span>
                  </div>
                </div>
              </div>
            ))}
            {filteredRows.length === 0 && (
              <DetailSectionEmpty title="暂无匹配的国家统计数据" sub="请尝试调整国家名称或目标筛选条件。" />
            )}
          </div>
        </div>
      </div>
    );
  };

  const DetailIpAggregation = ({
    rows,
    loading: tabLoading,
    error: tabError,
    stats,
    ipSearchTerm,
    setIpSearchTerm,
    portSearchTerm,
    setPortSearchTerm,
    ipTargetFilter,
    setIpTargetFilter,
    ipSearchApplied,
    setIpSearchApplied,
    onOpenIpDetail
  }) => {
    const handleSearch = () => {
      setIpSearchApplied({
        ip: ipSearchTerm,
        port: portSearchTerm,
        target: ipTargetFilter
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    };

    const filteredRows = useMemo(() => {
      return rows.filter(row => {
        const matchesIp = row.ip.toLowerCase().includes(ipSearchApplied.ip.toLowerCase());
        const matchesPort = row.ports.toLowerCase().includes(ipSearchApplied.port.toLowerCase());
        const matchesTarget = !ipSearchApplied.target || row.targets.includes(ipSearchApplied.target);
        return matchesIp && matchesPort && matchesTarget;
      });
    }, [rows, ipSearchApplied]);

    if (tabLoading) {
      return (
        <div className="v11-detail-loading">
          <Loader2 className="spinning-icon" size={28} />
          <div className="v11-detail-loading-text">正在聚合 IP 资产...</div>
        </div>
      );
    }

    if (tabError) {
      return (
        <DetailSectionEmpty title="IP聚合加载失败" sub={tabError} />
      );
    }

    if (filteredRows.length === 0) {
      return (
        <div className="v18-related-panel">
          <DetailSectionHeader
            title="IP聚合"
            count={0}
            children={renderIpAggregationSearchBar({
              ipSearchTerm,
              setIpSearchTerm,
              portSearchTerm,
              setPortSearchTerm,
              ipTargetFilter,
              setIpTargetFilter,
              handleKeyDown,
              targets: stats?.targets || [],
              setIpSearchApplied
            })}
          />

          <DetailSectionEmpty title="暂无匹配的 IP 聚合数据" sub="请尝试调整 IP、端口或目标筛选条件。" />
        </div>
      );
    }

    return (
      <div className="v18-related-panel">
        <DetailSectionHeader
          title="IP聚合"
          count={filteredRows.length}
          children={renderIpAggregationSearchBar({
            ipSearchTerm,
            setIpSearchTerm,
            portSearchTerm,
            setPortSearchTerm,
            ipTargetFilter,
            setIpTargetFilter,
            handleKeyDown,
            targets: stats?.targets || [],
            setIpSearchApplied
          })}
        />

        <div className="v18-related-table">
          <div className="v18-related-head" style={{ gridTemplateColumns: '1.5fr 2fr 1fr' }}>
            <div>IP</div>
            <div>开放端口</div>
            <div>资产数量</div>
          </div>
          <div className="v18-related-body">
            {filteredRows.map((row) => (
              <div key={row.ip} className="v18-related-row" style={{ gridTemplateColumns: '1.5fr 2fr 1fr' }}>
                <div className="v18-related-domain-cell">
                  <span 
                    className="v18-related-domain clickable" 
                    onClick={() => onOpenIpDetail?.(row.ip)}
                    title={'点击查看 ' + row.ip + ' 的详细资产'}
                  >
                    {row.ip}
                  </span>
                </div>
                <div className="v18-related-source-cell">
                  <span className="v18-related-source" style={{ color: '#f2cc60', fontStyle: 'normal', opacity: 1 }}>
                    {row.ports || '-'}
                  </span>
                </div>
                <div className="v18-related-source-cell">
                  <span className="v18-related-target-tag" style={{ background: 'rgba(63, 185, 80, 0.15)', color: '#3fb950', borderColor: 'rgba(63, 185, 80, 0.3)' }}>
                    {row.assetCount} 个资产
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderDomainDetailModal = () => {
    if (!domainDetailVisible) return null;
    return ReactDOM.createPortal(
      <div className="v10-modal-overlay" onClick={() => setDomainDetailVisible(false)}>
        <div className="v10-modal info v11-detail-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              <Globe size={18} style={{ marginRight: '10px', color: '#58a6ff', verticalAlign: 'middle' }} />
              <span style={{ verticalAlign: 'middle' }}>{domainDetailTitle}</span>
            </div>
            <button className="modal-close" onClick={() => setDomainDetailVisible(false)}><X size={20} /></button>
          </div>
          <div className="modal-body v18-detail-modal-body">
            {domainDetailLoading ? (
              <div className="v11-detail-loading">
                <Loader2 className="spinning-icon" size={28} />
                <div className="v11-detail-loading-text">正在查询详细数据...</div>
              </div>
            ) : domainDetailRows.length === 0 ? (
              <div className="v11-detail-empty">暂无匹配的详细数据</div>
            ) : (
              <div className="v11-fofa-list">
                {domainDetailRows.map((row, idx) => (
                  <FofaAssetCard 
                    key={row.id ? row.id : idx} 
                    asset={row} 
                    onIconClick={() => {}} // 详情弹窗内禁用图标点击跳转
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderIpDetailModal = () => {
    if (!ipDetailVisible) return null;
    return ReactDOM.createPortal(
      <div className="v10-modal-overlay" onClick={() => setIpDetailVisible(false)}>
        <div className="v10-modal info v11-detail-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              <Server size={18} style={{ marginRight: '10px', color: '#58a6ff', verticalAlign: 'middle' }} />
              <span style={{ verticalAlign: 'middle' }}>{ipDetailTitle}</span>
            </div>
            <button className="modal-close" onClick={() => setIpDetailVisible(false)}><X size={20} /></button>
          </div>
          <div className="modal-body v18-detail-modal-body">
            {ipDetailLoading ? (
              <div className="v11-detail-loading">
                <Loader2 className="spinning-icon" size={28} />
                <div className="v11-detail-loading-text">正在查询IP资产详情...</div>
              </div>
            ) : ipDetailRows.length === 0 ? (
              <div className="v11-detail-empty">暂无匹配的详细数据</div>
            ) : (
              <div className="v11-fofa-list">
                {ipDetailRows.map((row, idx) => (
                  <FofaAssetCard 
                    key={row.id ? row.id : idx} 
                    asset={row} 
                    onIconClick={() => {}} 
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderCountryDetailModal = () => {
    if (!countryDetailVisible) return null;
    return ReactDOM.createPortal(
      <div className="v10-modal-overlay" onClick={() => setCountryDetailVisible(false)}>
        <div className="v10-modal info v11-detail-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              <Globe size={18} style={{ marginRight: '10px', color: '#58a6ff', verticalAlign: 'middle' }} />
              <span style={{ verticalAlign: 'middle' }}>{countryDetailTitle}</span>
            </div>
            <button className="modal-close" onClick={() => setCountryDetailVisible(false)}><X size={20} /></button>
          </div>
          <div className="modal-body v18-detail-modal-body">
            {countryDetailLoading ? (
              <div className="v11-detail-loading">
                <Loader2 className="spinning-icon" size={28} />
                <div className="v11-detail-loading-text">正在查询国家资产详情...</div>
              </div>
            ) : countryDetailRows.length === 0 ? (
              <div className="v11-detail-empty">暂无匹配的详细数据</div>
            ) : (
              <div className="v11-fofa-list">
                {countryDetailRows.map((row, idx) => (
                  <FofaAssetCard 
                    key={row.id ? row.id : idx} 
                    asset={row} 
                    onIconClick={() => {}} 
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderFpDetailModal = () => {
    if (!fpDetailVisible) return null;
    return ReactDOM.createPortal(
      <div className="v10-modal-overlay" onClick={() => setFpDetailVisible(false)}>
        <div className="v10-modal info v11-detail-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              <LayoutGrid size={18} style={{ marginRight: '10px', color: '#58a6ff', verticalAlign: 'middle' }} />
              <span style={{ verticalAlign: 'middle' }}>{fpDetailTitle}</span>
            </div>
            <button className="modal-close" onClick={() => setFpDetailVisible(false)}><X size={20} /></button>
          </div>
          <div className="modal-body v18-detail-modal-body">
            {fpDetailLoading ? (
              <div className="v11-detail-loading">
                <Loader2 className="spinning-icon" size={28} />
                <div className="v11-detail-loading-text">正在查询指纹资产详情...</div>
              </div>
            ) : fpDetailRows.length === 0 ? (
              <div className="v11-detail-empty">暂无匹配的详细数据</div>
            ) : (
              <div className="v11-fofa-list">
                {fpDetailRows.map((row, idx) => (
                  <FofaAssetCard 
                    key={row.id ? row.id : idx} 
                    asset={row} 
                    onIconClick={() => {}} 
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const StableDetailFofa = useRef(DetailFofa).current;
  const StableDetailIpAggregation = useRef(DetailIpAggregation).current;
  const StableDetailCountryStats = useRef(DetailCountryStats).current;
  const StableDetailFingerprintStats = useRef(DetailFingerprintStats).current;

  if (loading) {
    return (
      <div className="v6-loading-container">
        <div className="cyber-loader">
          <Loader2 className="spinning-icon" size={48} />
          <div className="loader-text">同步安全任务协议...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`v6-tasks-container ${detailVisible ? 'detail-mode' : ''}`}>
      {/* 顶部工具栏 */}
      <div className="v6-toolbar">
        <div className="v6-search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="搜索任务名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="v6-actions">
          <button className="v15-add-btn" onClick={openCreateTaskModal} title={isOffline ? '离线版本不可新增任务' : '新增任务'} disabled={isOffline}>
            <Plus size={16} />
            <span>新增</span>
          </button>
          <div className="view-switch">
            <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>
              <LayoutGrid size={18} />
            </button>
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
              <ListIcon size={18} />
            </button>
          </div>
          <button className={`v6-cloud-sync-btn ${isCloudSyncing ? 'syncing' : ''}`} onClick={handleCloudSync} title={isOffline ? '离线版本不可云端同步' : '云端同步'} disabled={isOffline}>
            <CloudDownload size={16} className={isCloudSyncing ? 'spinning' : ''} />
            <span>{isCloudSyncing ? '全量同步中...' : '云端同步'}</span>
          </button>
          <div className="v6-help-tooltip-wrapper">
            <HelpCircle size={16} className="v6-help-icon" />
            <div className="v6-help-tooltip">同步最新数据，恢复损坏任务</div>
          </div>
          <button className={`v6-refresh-btn ${isBackingUp ? 'refreshing' : ''}`} onClick={handleDataBackup}>
            <HardDrive size={16} className={isBackingUp ? 'spinning' : ''} />
            <span>{isBackingUp ? '备份中...' : '数据备份'}</span>
          </button>
          <button className={`v6-import-btn ${isBackingUp ? 'syncing' : ''}`} onClick={handleDataImport}>
            <Upload size={16} />
            <span>数据导入</span>
          </button>
        </div>
      </div>

      {error && <div className="v6-error-alert">{error}</div>}

      {taskModalVisible && (
        <div className="v10-modal-overlay" onClick={closeTaskModal}>
          <div className="v10-modal info v16-task-modal" onClick={stop}>
            <div className="modal-header">
              <div className="modal-title">{taskModalMode === 'create' ? '新增任务' : '修改任务'}</div>
            </div>
            <div className="modal-body">
              <div className="v16-task-form">
                <div className="v16-task-form-row">
                  <label>任务名称 <span className="text-red">*</span></label>
                  <input
                    className={taskFormErrors.projectName ? 'error' : ''}
                    type="text"
                    value={taskForm.projectName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setTaskForm(prev => ({ ...prev, projectName: value }));
                      if (taskFormErrors.projectName) {
                        setTaskFormErrors(prev => ({ ...prev, projectName: value.trim() ? '' : '任务名称不能为空' }));
                      }
                    }}
                    placeholder="请输入任务名称"
                    disabled={taskModalMode === 'edit'}
                  />
                  {taskFormErrors.projectName && <div className="v16-task-form-error">{taskFormErrors.projectName}</div>}
                </div>
                <div className="v16-task-form-row">
                  <label>域名 <span className="text-red">*</span></label>
                  <textarea
                    className={taskFormErrors.url ? 'error' : ''}
                    value={taskForm.url}
                    onChange={(e) => {
                      setTaskForm(prev => ({ ...prev, url: e.target.value }));
                      if (taskFormErrors.url) {
                        setTaskFormErrors(prev => ({ ...prev, url: '' }));
                      }
                    }}
                    placeholder="请输入域名，多域名请用逗号隔开"
                    rows={4}
                    disabled={taskModalMode === 'edit'}
                  />
                  {taskFormErrors.url && <div className="v16-task-form-error">{taskFormErrors.url}</div>}
                </div>
                <div className="v16-task-form-row">
                  <label>任务描述</label>
                  <textarea
                    value={taskForm.remark}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, remark: e.target.value }))}
                    placeholder="请输入描述"
                    rows={4}
                  />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-btn primary" disabled={taskSaving} onClick={submitTaskModal}>
                {taskSaving ? '提交中...' : (taskModalMode === 'create' ? '创建任务' : '保存修改')}
              </button>
              <button className="modal-btn ghost" disabled={taskSaving} onClick={closeTaskModal}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 项目展示区域或详情区域 */}
      {!detailVisible ? (
        <div className={`v6-project-content ${viewMode}`}>
          <div className="content-stats">
            <div
              className={`stat-item clickable ${statusFilter === null ? 'active' : ''}`}
              onClick={() => setStatusFilter(null)}
            >
              <div className="stat-icon-wrap">
                <FolderGit2 size={16} />
              </div>
              <div className="stat-texts">
                <span className="stat-label">总任务</span>
                <span className="stat-value">{total}</span>
              </div>
            </div>
            <div
              className={`stat-item clickable ${statusFilter === 'running' ? 'active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'running' ? null : 'running')}
            >
              <div className="stat-icon-wrap running">
                <Play size={16} />
              </div>
              <div className="stat-texts">
                <span className="stat-label">运行中</span>
                <span className="stat-value text-running">{runningProjectsCount}</span>
              </div>
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div className="project-grid-wrapper">
              {filteredProjects.map((project) => (
                <div key={project.id} className={`v6-project-card ${openingDetailId === project.id ? 'is-opening' : ''}`} onClick={() => openDetail(project)}>
                  <div className="v6-card-header">
                    <div className="v6-icon-wrapper">
                      <FolderGit2 size={24} />
                    </div>
                    <div className="v6-header-info">
                      <h4>{project.projectName}</h4>
                      <div className="v10-meta-line">
                        <span className="v6-id">ID: {project.id}</span>
                        {getSyncIndicator(project.id)}
                      </div>
                    </div>
                    <div className="v6-status-indicator">
                      {getStatusIcon(project.step)}
                    </div>
                  </div>

                  <div className="v6-card-body">
                    <div className="v6-target-url-container">
                      <Globe size={14} className="v6-globe-icon" />
                      <div className="v6-target-tags">
                        {parseProjectTargets(project.url).map((url, index) => (
                          <span key={`${project.id}-${index}-${url}`} className="v6-target-tag">{url}</span>
                        ))}
                      </div>
                    </div>

                    <div className="v6-data-stats">
                      <div className="v6-stat-pill">
                        <Database size={12} />
                        <span className="v6-stat-label">FOFA聚合资产</span>
                        <span className="v6-stat-value">{project.subNum}</span>
                      </div>
                    </div>

                    <div className="v6-step-info">
                      <div className="step-label">执行阶段: <span className="step-text-highlight">{mapStatusToChinese(project.step)}</span></div>
                      <div className="v7-stepped-progress">
                        {getStepsStatus(project).map((step, idx) => (
                          <div key={step.key} className={`v7-step-item ${step.status}`}>
                            <div className="step-node"></div>
                            <span className="step-name">{step.label}</span>
                            {idx < 4 && <div className="step-connector"></div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="v6-card-footer">
                    <div className="time-info">
                      <Clock size={12} />
                      <span>{project.createTime}</span>
                    </div>
                    <div className="v9-card-actions">
                      <button className="action-icon-btn" title="修改" onClick={(e) => { stop(e); openEditRemarkModal(project); }}><Edit3 size={14} /></button>
                      <button className="action-icon-btn" title="删除" onClick={(e) => { stop(e); startDeleteTaskFlow(project.id); }}><Trash2 size={14} /></button>
                      <button className="action-icon-btn" title={getTaskActionMeta(project).title} disabled={Boolean(taskActionStatus[project.id])} onClick={(e) => { stop(e); handleTaskRuntimeAction(project); }}>{taskActionStatus[project.id] ? <RefreshCw size={14} className="spinning" /> : getTaskActionMeta(project).icon}</button>
                    </div>
                  </div>
                  {openingDetailId === project.id && (
                    <div className="v6-card-opening-indicator">
                      <Loader2 className="spinning-icon" size={16} />
                      <span>正在打开详情...</span>
                    </div>
                  )}
                  <div className="v6-card-bg-effect"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="v8-list-wrapper">
              <div className="v8-list-header">
                <div className="col-name">任务名称</div>
                <div className="col-target">扫描目标</div>
                <div className="col-stats">资产统计</div>
                <div className="col-progress">执行进度</div>
                <div className="col-time">创建时间</div>
                <div className="col-action">操作</div>
              </div>
              <div className="v8-list-body">
                {filteredProjects.map((project) => (
                  <div key={project.id} className={`v8-list-row ${openingDetailId === project.id ? 'is-opening' : ''}`} onClick={() => openDetail(project)}>
                    <div className="col-name">
                      <div className="v8-row-icon">{getStatusIcon(project.step)}</div>
                      <div className="v8-name-info">
                        <span className="name-text">{project.projectName}</span>
                        <div className="v10-meta-line">
                          <span className="id-text">ID: {project.id}</span>
                          {getSyncIndicator(project.id)}
                        </div>
                      </div>
                    </div>
                    <div className="col-target">{renderProjectTargets(project)}</div>
                    <div className="col-stats">
                      <div className="mini-stat"><span>FOFA聚合资产:</span> {project.subNum}</div>
                    </div>
                    <div className="col-progress">
                      <div className="v8-mini-steps">
                        {getStepsStatus(project).map((step, idx) => (
                          <div key={step.key} className={`mini-step-dot ${step.status}`} title={step.label}></div>
                        ))}
                      </div>
                      <span className="progress-text">{mapStatusToChinese(project.step)}</span>
                    </div>
                    <div className="col-time">{project.createTime}</div>
                    <div className="col-action">
                      <div className="v9-row-actions">
                        <button className="v9-action-btn" title="修改" onClick={(e) => { stop(e); openEditRemarkModal(project); }}><Edit3 size={14} /></button>
                        <button className="v9-action-btn" title={getTaskActionMeta(project).title} disabled={Boolean(taskActionStatus[project.id])} onClick={(e) => { stop(e); handleTaskRuntimeAction(project); }}>{taskActionStatus[project.id] ? <RefreshCw size={14} className="spinning" /> : getTaskActionMeta(project).icon}</button>
                        <button className="v9-action-btn delete" title="删除" onClick={(e) => { stop(e); startDeleteTaskFlow(project.id); }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    {openingDetailId === project.id && (
                      <div className="v8-row-opening-indicator">
                        <Loader2 className="spinning-icon" size={14} />
                        <span>加载详情中...</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredProjects.length === 0 && (
            <div className="v8-empty-results">
              <div className="v8-empty-icon-wrap">
                {isTaskSearchActive ? <Search size={32} className="empty-icon" /> : <FolderGit2 size={32} className="empty-icon" />}
              </div>
              <div className="v8-empty-title">{isTaskSearchActive ? '未找到匹配的任务' : '暂无任务数据'}</div>
              <div className="v8-empty-sub">
                {isTaskSearchActive ? '请调整搜索关键词或筛选条件后重试。' : '当前还没有可展示的任务，创建后会显示在这里。'}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="v6-project-content v11-inline">
          <div className="v11-detail-shell open" onClick={stop}>
            <div className="v11-detail-topbar">
              <div className="v11-topbar-left">
                <button className="v11-back-btn" onClick={closeDetail}>
                  <ArrowLeft size={18} />
                  <span>返回</span>
                </button>
              </div>
              <div className="v11-detail-title">
                <div className="v11-detail-name">{detailProject?.projectName || '任务详情'}</div>
                <div className="v11-detail-sub">ID: {detailProject?.id}</div>
              </div>
              <div className="v11-topbar-right">
                <div className="v11-topbar-jump-slot">
                  <button
                    className={`v11-topbar-jump-btn ${showScrollBottom ? 'visible' : 'hidden'}`}
                    onClick={() => {
                      const mainEl = document.querySelector('.content-area');
                      const el = detailContentRef.current;
                      const sc =
                        (mainEl && mainEl.scrollHeight - mainEl.clientHeight > 2) ? mainEl :
                          (el && el.scrollHeight - el.clientHeight > 2) ? el :
                            mainEl || el;
                      if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
                    }}
                    disabled={!showScrollBottom}
                    aria-hidden={!showScrollBottom}
                    tabIndex={showScrollBottom ? 0 : -1}
                  >到底部</button>
                </div>
                <div className="v11-detail-time">
                  <div className="v11-detail-time-label">数据时间</div>
                  <div className="v11-detail-time-value">{detailProject?.createTime || '-'}</div>
                </div>
              </div>
            </div>

            <div className="v11-detail-body">
              <div className="v11-detail-nav">
                <button className={`v11-nav-item ${detailTab === 'home' ? 'active' : ''}`} onClick={() => switchDetailTab('home')}>
                  <Home size={16} />
                  <span>首页</span>
                </button>
                <button className={`v11-nav-item ${detailTab === 'fofa' ? 'active' : ''}`} onClick={() => switchDetailTab('fofa')}>
                  <Database size={16} />
                  <span>FOFA资产聚合</span>
                </button>
                <button className={`v11-nav-item ${detailTab === 'related' ? 'active' : ''}`} onClick={() => switchDetailTab('related', loadRelatedAssets)}>
                  <Link2 size={16} />
                  <span>关联资产</span>
                </button>
                <button className={`v11-nav-item ${detailTab === 'ip_agg' ? 'active' : ''}`} onClick={() => switchDetailTab('ip_agg', loadIpAggregation)}>
                  <Database size={16} />
                  <span>IP聚合</span>
                </button>
                <button className={`v11-nav-item ${detailTab === 'country_stats' ? 'active' : ''}`} onClick={() => switchDetailTab('country_stats', loadCountryStats)}>
                  <Globe size={16} />
                  <span>国家统计</span>
                </button>
                <button className={`v11-nav-item ${detailTab === 'fingerprint' ? 'active' : ''}`} onClick={() => switchDetailTab('fingerprint', loadFingerprintStats)}>
                  <LayoutGrid size={16} />
                  <span>指纹统计</span>
                </button>
                <button className={`v11-nav-item ${detailTab === 'ai' ? 'active' : ''}`} onClick={() => switchDetailTab('ai')}>
                  <Activity size={16} />
                  <span>AI资产分析</span>
                </button>
              </div>

              <div className="v11-detail-content" ref={detailContentRef}>
                {detailBusy && !detailError && (
                  <div className="v11-detail-busy-mask">
                    <div className="v11-detail-busy-pill">
                      <Loader2 className="spinning-icon" size={16} />
                      <span>{detailBusyText}</span>
                    </div>
                  </div>
                )}
                {detailLoading ? (
                  <div className="v11-detail-loading">
                    <Loader2 className="spinning-icon" size={28} />
                    <div className="v11-detail-loading-text">加载任务详情...</div>
                  </div>
                ) : detailError ? (
                  <div className="v11-detail-empty">
                    <div className="v11-detail-empty-title">暂无详情数据</div>
                    <div className="v11-detail-empty-sub">{detailError}</div>
                  </div>
                ) : detailTab === 'home' ? (
                  <DetailHome stats={detailStats} pageRows={detailRows} />
                ) : detailTab === 'fofa' ? (
                  <StableDetailFofa
                    rows={detailRows}
                    pageNum={detailPageNum}
                    pageSize={detailPageSize}
                    total={detailTotal}
                    stats={detailStats}
                    projectId={detailProject.id}
                    searchTerm={fofaSearchTerm}
                    targetFilter={fofaTargetFilter}
                    onSearch={(s) => {
                      setFofaSearchTerm(s);
                      loadTaskDetail(detailProject.id, 1, detailPageSize, s, fofaTargetFilter);
                    }}
                    onTargetChange={(t) => {
                      setFofaTargetFilter(t);
                      loadTaskDetail(detailProject.id, 1, detailPageSize, fofaSearchTerm, t);
                    }}
                    onPrev={() => loadTaskDetail(detailProject.id, Math.max(1, detailPageNum - 1), detailPageSize, fofaSearchTerm, fofaTargetFilter)}
                    onNext={() => loadTaskDetail(detailProject.id, detailPageNum + 1, detailPageSize, fofaSearchTerm, fofaTargetFilter)}
                    onJump={(p) => loadTaskDetail(detailProject.id, p, detailPageSize, fofaSearchTerm, fofaTargetFilter)}
                    onPageSizeChange={(s) => {
                      setDetailPageSize(s);
                      loadTaskDetail(detailProject.id, 1, s, fofaSearchTerm, fofaTargetFilter);
                    }}
                  />
                ) : detailTab === 'related' ? (
                  <DetailRelatedAssets
                    rows={relatedAssetRows}
                    loading={relatedAssetLoading}
                    error={relatedAssetError}
                  />
                ) : detailTab === 'ip_agg' ? (
                  <StableDetailIpAggregation
                    rows={ipAggregationRows}
                    loading={ipAggregationLoading}
                    error={ipAggregationError}
                    stats={detailStats}
                    ipSearchTerm={ipSearchTerm}
                    setIpSearchTerm={setIpSearchTerm}
                    portSearchTerm={portSearchTerm}
                    setPortSearchTerm={setPortSearchTerm}
                    ipTargetFilter={ipTargetFilter}
                    setIpTargetFilter={setIpTargetFilter}
                    ipSearchApplied={ipSearchApplied}
                    setIpSearchApplied={setIpSearchApplied}
                    onOpenIpDetail={loadIpDetail}
                  />
                ) : detailTab === 'country_stats' ? (
                  <StableDetailCountryStats
                    rows={countryStatsRows}
                    allRows={countryStatsAllRows}
                    loading={countryStatsLoading}
                    error={countryStatsError}
                    stats={detailStats}
                    countrySearchTerm={countrySearchTerm}
                    setCountrySearchTerm={setCountrySearchTerm}
                    countryTargetFilter={countryTargetFilter}
                    setCountryTargetFilter={setCountryTargetFilter}
                    countrySearchApplied={countrySearchApplied}
                    setCountrySearchApplied={setCountrySearchApplied}
                    onOpenCountryDetail={loadCountryDetail}
                  />
                ) : detailTab === 'fingerprint' ? (
                  <StableDetailFingerprintStats
                    rows={fingerprintStatsRows}
                    loading={fingerprintStatsLoading}
                    error={fingerprintStatsError}
                    stats={detailStats}
                    fpSearchTerm={fpSearchTerm}
                    setFpSearchTerm={setFpSearchTerm}
                    fpCategoryFilter={fpCategoryFilter}
                    setFpCategoryFilter={setFpCategoryFilter}
                    fpTargetFilter={fpTargetFilter}
                    setFpTargetFilter={setFpTargetFilter}
                    fpSearchApplied={fpSearchApplied}
                    setFpSearchApplied={setFpSearchApplied}
                    onOpenFingerprintDetail={loadFingerprintDetail}
                  />
                ) : (
                  <div className="v11-detail-empty">
                    <div className="v11-detail-empty-title">AI资产分析</div>
                    <div className="v11-detail-empty-sub">模块预留，后续可接入模型分析与聚合策略。</div>
                  </div>
                )}
              </div>
            </div>
            {showScrollTop && (
              <button
                className="v11-scroll-btn bottom-right"
                onClick={() => {
                  const mainEl = document.querySelector('.content-area');
                  const el = detailContentRef.current;
                  const sc =
                    (mainEl && mainEl.scrollHeight - mainEl.clientHeight > 2) ? mainEl :
                      (el && el.scrollHeight - el.clientHeight > 2) ? el :
                        mainEl || el;
                  if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >回到顶部</button>
            )}
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
      {renderDomainDetailModal()}
      {renderIpDetailModal()}
      {renderCountryDetailModal()}
      {renderFpDetailModal()}
      {targetsTooltip && ReactDOM.createPortal(
        <div
          className="eye-tooltip eye-tooltip-portal visible"
          style={targetsTooltip.style}
          onMouseEnter={clearTargetsTooltipCloseTimer}
          onMouseLeave={scheduleTargetsTooltipClose}
        >
          <div className="v9-tooltip-tags">
            {targetsTooltip.targets.map((target, index) => (
              <div key={`${targetsTooltip.key}-${index}-${target}`} className="v9-target-tag">
                {target}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Tasks;

