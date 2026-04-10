import React, { useState, useEffect } from 'react';
import { Home, ListTodo, ShieldAlert, LogOut, User, RefreshCcw, Minus, Square, X, RotateCw } from 'lucide-react';
import Login from './Login';
import Tasks from './Tasks';
import { request, logout } from './api';
import './App.css';

const { ipcRenderer } = window.require('electron');

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [systemStatus, setSystemStatus] = useState('IDLE');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [localIp, setLocalIp] = useState('127.0.0.1');

  // 获取本机 IP
  useEffect(() => {
    ipcRenderer.invoke('get-ip').then(setLocalIp);
  }, []);

  // 检查本地存储是否有 token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
      const now = new Date();
      setUserData({
        username: 'targetuser',
        lastLoginDate: now.toLocaleDateString(),
        lastLoginTime: now.toLocaleTimeString(),
        ip: localIp
      });
      fetchSystemStatus();
    }
  }, [localIp]);

  const fetchSystemStatus = async () => {
    setSystemStatus('SYNCING...');
    setTimeout(() => setSystemStatus('OPERATIONAL'), 1500);
  };

  const handleLoginSuccess = (data) => {
    const now = new Date();
    setUserData({
      ...data,
      lastLoginDate: now.toLocaleDateString(),
      lastLoginTime: now.toLocaleTimeString(),
      ip: localIp
    });
    setIsLoggedIn(true);
    setShowLoginModal(false);
    fetchSystemStatus();
  };

  const handleLogout = async () => {
    try {
      // 调用后端登出接口，request 工具会自动带上 token
      await logout();
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      // 无论后端是否成功，前端都清除状态
      localStorage.removeItem('token');
      setIsLoggedIn(false);
      setUserData(null);
      setSystemStatus('IDLE');
    }
  };

  const toggleLoginModal = () => {
    if (!isLoggedIn) {
      setShowLoginModal(true);
    }
  };

  // 窗口控制
  const winMin = () => ipcRenderer.send('window-min');
  const winMax = () => ipcRenderer.send('window-max');
  const winClose = () => ipcRenderer.send('window-close');
  const winReload = () => ipcRenderer.send('window-reload');

  const tabs = [
    { id: 'home', name: '首页', icon: <Home size={20} /> },
    { id: 'tasks', name: '任务', icon: <ListTodo size={20} /> },
    { id: 'assets', name: '资产', icon: <ShieldAlert size={20} /> },
  ];

  return (
    <div className="app-container">
      {/* 顶部标题栏 */}
      <div className="title-bar">
        <div className="user-info-mini">
          <RefreshCcw size={12} className={systemStatus === 'SYNCING...' ? 'spinning' : ''} />
          <span>NODE: {systemStatus}</span>
        </div>
        
        <div className="window-controls">
          <button onClick={winReload} title="重启" className="win-btn"><RotateCw size={14} /></button>
          <button onClick={winMin} title="最小化" className="win-btn"><Minus size={14} /></button>
          <button onClick={winMax} title="最大化" className="win-btn"><Square size={12} /></button>
          <button onClick={winClose} title="关闭" className="win-btn close"><X size={14} /></button>
        </div>
      </div>

      <div className="main-layout">
        {/* 侧边栏 */}
        <aside className="sidebar">
          <div className="sidebar-logo-clickable" onClick={toggleLoginModal}>
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
                title={tab.name}
              >
                <div className="nav-icon-wrapper">
                  {tab.icon}
                </div>
                <span className="nav-label">{tab.name}</span>
              </button>
            ))}
          </nav>
          
          <div className="sidebar-footer">
            {isLoggedIn && (
              <button className="logout-button" onClick={handleLogout} title="退出系统">
                <LogOut size={20} />
              </button>
            )}
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="content-area">
          <div className="content-header">
            <h2 className="content-title">
              {tabs.find(t => t.id === activeTab)?.name}
            </h2>
          </div>
          <div className="content-body">
            {!isLoggedIn ? (
              <div className="empty-state">
                <div className="tech-placeholder">
                  <div className="scanner-line"></div>
                  <p>请点击左上角图标登录系统</p>
                </div>
              </div>
            ) : activeTab === 'tasks' ? (
              <Tasks />
            ) : (
              <div className="empty-state">
                <div className="tech-placeholder">
                  <div className="scanner-line"></div>
                  <p>系统已授权，正在运行...</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 登录弹窗 */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <Login onLoginSuccess={handleLoginSuccess} onClose={() => setShowLoginModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
