const BASE_URL = 'http://192.168.0.61:8088';

/**
 * 封装带有 Token 的请求工具
 * @param {string} endpoint 请求路径
 * @param {object} options 请求选项
 * @returns {Promise}
 */
export const request = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN',
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // 如果本地存储有 token，则添加到请求头中
  if (token) {
    // 根据后端需求调整 Header 字段名，通常为 Authorization 或 Token
    headers['Authorization'] = `Bearer ${token}`;
    // 如果后端直接接收 'token' 字段，则使用：
    // headers['token'] = token;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token 失效或未认证，统一提示
      localStorage.removeItem('token');
      // 延迟刷新以避免状态更新冲突
      setTimeout(() => window.location.reload(), 500);
      throw new Error('请登录后使用');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.msg || `HTTP Error: ${response.status}`);
  }

  const data = await response.json();
  
  // 处理后端返回的 200 OK 但业务状态码为 401 的情况
  if (data.code === 401) {
    localStorage.removeItem('token');
    setTimeout(() => window.location.reload(), 500);
    throw new Error('请登录后使用');
  }

  return data;
};

export const login = (username, password) => {
  return request('/login', {
    method: 'POST',
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

/**
 * 获取任务优先级字典数据
 */
export const getTaskPriority = () => {
  return request('/system/dict/data/type/task_priority', {
    method: 'GET',
  });
};

/**
 * 获取项目列表
 */
export const getProjectList = (pageNum = 1, pageSize = 100, projectName = '') => {
  return request(`/module/project/list?pageNum=${pageNum}&pageSize=${pageSize}&projectName=${projectName}`, {
    method: 'GET',
  });
};
