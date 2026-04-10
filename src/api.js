const DEFAULT_BASE_URL = 'http://192.168.0.61:8088';

const getBaseUrl = () => String(localStorage.getItem('apiBaseUrl') || DEFAULT_BASE_URL).replace(/\/+$/, '');

export const request = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const targetUrl = /^https?:\/\//i.test(endpoint) ? endpoint : `${getBaseUrl()}${endpoint}`;
  const {
    timeoutMs,
    retryCount = 0,
    markOfflineOnFailure = false,
    ...fetchOptions
  } = options;

  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN',
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const runRequest = async (attempt = 0) => {
    const controller = timeoutMs ? new AbortController() : null;
    const timeout = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(targetUrl, {
        ...fetchOptions,
        headers,
        signal: controller ? controller.signal : fetchOptions.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('token');
          setTimeout(() => window.location.reload(), 500);
          throw new Error('请登录后使用');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.msg || `HTTP Error: ${response.status}`);
      }

      const data = await response.json();

      if (data.code === 401) {
        localStorage.removeItem('token');
        setTimeout(() => window.location.reload(), 500);
        throw new Error('请登录后使用');
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-connectivity-restored', {
          detail: { url: targetUrl, status: response.status }
        }));
      }

      return data;
    } catch (error) {
      const message = String(error?.message || '');
      const isConnectivityError = error?.name === 'AbortError' || /Failed to fetch|fetch|network|timeout|连接|超时/i.test(message);

      if (isConnectivityError && attempt < retryCount) {
        return runRequest(attempt + 1);
      }

      if (isConnectivityError && markOfflineOnFailure && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-connectivity-lost', {
          detail: { url: targetUrl, message: message || '连接失败' }
        }));
      }

      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  return runRequest(0);
};

export const login = (username, password) => {
  return request('/login', {
    method: 'POST',
    timeoutMs: 5000,
    retryCount: 2,
    markOfflineOnFailure: true,
    body: JSON.stringify({
      username,
      password,
      rememberMe: true,
    }),
  });
};

export const logout = () => {
  return request('/logout', {
    method: 'DELETE',
  });
};

export const getTaskPriority = () => {
  return request('/system/dict/data/type/task_priority', {
    method: 'GET',
  });
};

export const getProjectList = (pageNum = 1, pageSize = 100, projectName = '') => {
  return request(`/module/project/list?pageNum=${pageNum}&pageSize=${pageSize}&projectName=${projectName}`, {
    method: 'GET',
  });
};

export const getNodeStatus = () => {
  return request('/module/project/getNodeStatus', {
    method: 'GET',
  }).then((res) => {
    console.log('[api] getNodeStatus response =', res);
    return res;
  }).catch((error) => {
    console.error('[api] getNodeStatus error =', error);
    throw error;
  });
};
