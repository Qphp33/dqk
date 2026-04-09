import React, { useState } from 'react';
import { Lock, User, Terminal, Loader2, Cpu, CloudOff } from 'lucide-react';
import { login } from './api';
import './Login.css';

const Login = ({ isOffline = false, onLoginSuccess, onClose }) => {
  const [username, setUsername] = useState('targetuser');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isOffline) {
      setError('当前网络不可用，本地数据仍可查看；联网后再登录即可使用在线功能');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const data = await login(username, password);

      if (data.code === 200) {
        localStorage.setItem('token', data.token);
        onLoginSuccess(data);
      } else {
        setError(data.msg || '登录失败，请检查用户名或密码');
      }
    } catch (err) {
      setError(err.message || '网络错误，请确保后端服务已启动');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="goby-login-modal">
      <div className="login-card-wrapper">
        <div className="card-top-accent"></div>
        <div className="login-card-inner">
          <div className="login-branding">
            <div className="branding-icon">
              <Cpu size={30} color="#0084ff" />
            </div>
            <div className="branding-text">
              <h2>SECURITY ACCESS</h2>
              <p>v1.0.0</p>
            </div>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>

          <form onSubmit={handleLogin} className="goby-form">
            <div className="goby-input-wrapper">
              <label>USERNAME</label>
              <div className="input-field">
                <User size={16} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                />
              </div>
            </div>

            <div className="goby-input-wrapper">
              <label>PASSWORD</label>
              <div className="input-field">
                <Lock size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>

            {error && <div className="goby-error-msg">{error}</div>}
            {isOffline && <div className="goby-offline-note"><CloudOff size={14} /> 当前为本地模式，可浏览本地数据</div>}

            <button type="submit" className="goby-login-btn" disabled={loading || isOffline}>
              {loading ? (
                <Loader2 className="spinning-icon" size={20} />
              ) : isOffline ? (
                '本地模式下暂不可登录'
              ) : (
                'INITIATE AUTHORIZATION'
              )}
            </button>
          </form>

          <div className="goby-login-status">
            <div className={`status-indicator ${isOffline ? '' : 'active'}`}></div>
            <span>{isOffline ? '节点状态：本地模式' : 'NODE STATUS: READY'}</span>
          </div>
        </div>

        <div className="card-corners">
          <div className="corner top-left"></div>
          <div className="corner top-right"></div>
          <div className="corner bottom-left"></div>
          <div className="corner bottom-right"></div>
        </div>
      </div>

      <div className="page-footer-info">
        <Terminal size={12} />
        <span>SYSTEM LOG: WAITING FOR USER INPUT...</span>
      </div>
    </div>
  );
};

export default Login;
