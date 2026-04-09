import React, { useState, useEffect } from 'react';
import { 
  FolderGit2, 
  Activity, 
  Globe, 
  Database, 
  Loader2, 
  RefreshCw, 
  ChevronRight, 
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
  FileText
} from 'lucide-react';
import { getProjectList } from './api';

const Tasks = () => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]); // The original full list of projects
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // Default to list view
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(null); // e.g., 'running', 'completed', 'idle'

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getProjectList();
      if (response.code === 200) {
        setProjects(response.rows || []);
        setTotal(response.total || 0);
      } else {
        setError(response.msg || '获取项目列表失败');
      }
    } catch (err) {
      setError('无法同步云端任务，请检查安全链路');
      console.error('Fetch projects error:', err);
  
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

  const getStatusIcon = (step) => {
    if (step?.includes('完成') || step?.includes('done')) return <CheckCircle2 size={18} className="text-success" />;
    if (step?.includes('运行') || step?.includes('running')) return <Play size={18} className="text-running spinning-slow" />;
    return <Clock size={18} className="text-idle" />;
  };

  // 将英文步骤/状态映射为中文
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
    <div className="v6-tasks-container">
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
          <div className="view-switch">
            <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>
              <LayoutGrid size={18} />
            </button>
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
              <ListIcon size={18} />
            </button>
          </div>
          <button className="v6-refresh-btn" onClick={fetchProjects}>
            <RefreshCw size={16} />
            <span>刷新状态</span>
          </button>
        </div>
      </div>

      {error && <div className="v6-error-alert">{error}</div>}

      {/* 项目展示区域 */}
      <div className={`v6-project-content ${viewMode}`}>
        <div className="content-stats">
          <div 
            className={`stat-item clickable ${statusFilter === null ? 'active' : ''}`}
            onClick={() => setStatusFilter(null)}
          >
            <span className="stat-label">总计任务</span>
            <span className="stat-value">{total}</span>
          </div>
          <div 
            className={`stat-item clickable ${statusFilter === 'running' ? 'active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'running' ? null : 'running')}
          >
            <span className="stat-label">运行中</span>
            <span className="stat-value text-running">{projects.filter(p => p.step?.includes('运行')).length}</span>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="project-grid-wrapper">
            {filteredProjects.map((project) => (
              <div key={project.id} className="v6-project-card">
                <div className="v6-card-header">
                  <div className="v6-icon-wrapper">
                    <FolderGit2 size={24} />
                  </div>
                  <div className="v6-header-info">
                    <h4>{project.projectName}</h4>
                    <span className="v6-id">ID: {project.id}</span>
                  </div>
                  <div className="v6-status-indicator">
                    {getStatusIcon(project.step)}
                  </div>
                </div>

                <div className="v6-card-body">
                  <div className="v6-target-url-container">
                    <Globe size={14} className="v6-globe-icon" />
                    <div className="v6-target-tags">
                      {project.url?.split(';').map((url, index) => (
                        <span key={index} className="v6-target-tag">{url}</span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="v6-data-stats">
                    <div className="v6-stat-pill">
                      <Database size={12} />
                      <span>FOFA聚合资产: {project.subNum}</span>
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
                    <button className="action-icon-btn" title="更新"><Edit3 size={14} /></button>
                    <button className="action-icon-btn" title="删除"><Trash2 size={14} /></button>
                    <button className="action-icon-btn" title="重新探测"><RotateCcw size={14} /></button>
                    <button className="action-icon-btn" title="备注"><FileText size={14} /></button>
                  </div>
                </div>
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
                <div key={project.id} className="v8-list-row">
                  <div className="col-name">
                    <div className="v8-row-icon">{getStatusIcon(project.step)}</div>
                    <div className="v8-name-info">
                      <span className="name-text">{project.projectName}</span>
                      <span className="id-text">ID: {project.id}</span>
                    </div>
                  </div>
                  <div className="col-target">
                    {project.url?.split(';').length > 1 ? (
                      <div className="v9-url-with-eye">
                        <span className="v9-target-tag">{project.url.split(';')[0]}...</span>
                        <div className="eye-tooltip-wrapper">
                          <Eye size={16} className="v9-eye-icon" />
                          <div className="eye-tooltip">
                            <div className="v9-tooltip-tags">
                              {project.url.split(';').map((u, i) => <div key={i} className="v9-target-tag">{u}</div>)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="v9-target-tag">{project.url}</span>
                    )}
                  </div>
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
                      <button className="v9-action-btn" title="更新"><Edit3 size={14} /></button>
                      <button className="v9-action-btn" title="重新探测"><RotateCcw size={14} /></button>
                      <button className="v9-action-btn delete" title="删除"><Trash2 size={14} /></button>
                      <button className="v9-action-btn" title="备注"><FileText size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {filteredProjects.length === 0 && (
          <div className="v8-empty-results">
            <Search size={32} className="empty-icon" />
            <p>未找到匹配的任务</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tasks;
