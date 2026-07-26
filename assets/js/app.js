(function() {
    'use strict';

    let hiddenPackages = [];
    let hasChanges = false;
    let allRecords = [];
    let isLoggedIn = false; // 登录状态

    // 安全请求配置
const SECURITY_CONFIG = {
    ALLOWED_PROTOCOLS: ['https://'],
    get ALLOWED_DOMAINS() {
        // 支持当前域名和开发环境
        const currentDomain = window.location.hostname;
        const domains = [currentDomain];
        
        // 开发环境额外支持localhost
        if (currentDomain === 'localhost' || currentDomain === '127.0.0.1') {
            domains.push('localhost', '127.0.0.1');
        }
        
        return domains;
    }
};

    // 安全检查：验证URL
    function validateUrl(url) {
        try {
            const parsedUrl = new URL(url);
            
            // 检查协议
            if (!SECURITY_CONFIG.ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
                console.error('[Elixir安全] 不允许的协议:', parsedUrl.protocol);
                return false;
            }
            
            // 检查域名（动态获取最新域名列表）
            const allowedDomains = SECURITY_CONFIG.ALLOWED_DOMAINS;
            if (!allowedDomains.includes(parsedUrl.hostname)) {
                console.error('[Elixir安全] 不允许的域名:', parsedUrl.hostname);
                return false;
            }
            
            return true;
        } catch (e) {
            console.error('[Elixir安全] URL解析失败:', e);
            return false;
        }
    }

    // 安全请求包装器
    async function safeFetch(url, options = {}) {
        // 验证URL
        if (!validateUrl(url)) {
            throw new Error('请求URL验证失败');
        }

        // 检查是否有认证Cookie，没有则直接拒绝请求
        if (!CookieManager.hasAuthCookie()) {
            throw new Error('需要登录才能访问此功能');
        }

        // 使用浏览器原生请求头，不添加任何硬编码头部
        const mergedOptions = {
            ...options,
            headers: {
                ...options.headers
            },
            credentials: 'include',
            cache: 'no-cache'
        };

        const response = await fetch(url, mergedOptions);
        return response;
    }

    // HTML转义（防止XSS）
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 加载隐藏的包名列表
    function loadHiddenPackages(callback) {
        try {
            const stored = localStorage.getItem('elixir_hiddenPackages');
            hiddenPackages = stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('[Elixir工具] 加载隐藏包名列表时出错:', e);
            hiddenPackages = [];
        }
        if (callback) callback();
    }

    // 保存隐藏包名
    function saveHiddenPackages() {
        try {
            localStorage.setItem('elixir_hiddenPackages', JSON.stringify(hiddenPackages));
        } catch (e) {
            console.error('[Elixir工具] 保存隐藏包名列表时出错:', e);
        }
    }

    // 检查包名是否需要隐藏
    function shouldHidePackage(packageName) {
        return hiddenPackages.some(hidden => 
            packageName === hidden || 
            packageName.startsWith(hidden + '.')
        );
    }

    // 获取APK数据
    async function fetchApkData() {
        // 首先检查是否有认证Cookie，没有则直接返回
        if (!CookieManager.hasAuthCookie()) {
            const tbody = document.getElementById('records-tbody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">请先登录</td></tr>';
            }
            return;
        }

        const tbody = document.getElementById('records-tbody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="3" class="no-records">加载中...</td></tr>';

        try {
            const url = API_CONFIG.BASE_URL + API_ENDPOINTS.GET_APKS;

            const response = await safeFetch(url, {
                method: 'GET',
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            const data = await response.json();

            if (data.status && data.apks) {
                // 合并同类项并过滤隐藏包名
                const seenPackages = new Set();
                allRecords = data.apks.filter(item => {
                    // 检查是否需要隐藏
                    if (shouldHidePackage(item.pkgName)) {
                        return false;
                    }
                    // 合并同类项
                    if (seenPackages.has(item.pkgName)) {
                        return false;
                    }
                    seenPackages.add(item.pkgName);
                    return true;
                });

                renderTable();
            } else {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">获取数据失败</td></tr>';
                console.error('[Elixir工具] API返回数据异常:', data);
            }
        } catch (error) {
            console.error('[Elixir工具] 获取APK数据失败:', error);
            
            // 跨域回退方案
            if (error.name === 'TypeError' && error.message.includes('CORS')) {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">跨域访问被限制，请检查后端配置</td></tr>';
            } else if (error.message.includes('需要登录才能访问此功能')) {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">登录已过期，请重新登录</td></tr>';
            } else {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">网络请求失败: ' + error.message + '</td></tr>';
            }
        }
    }

    // 渲染表格
    function renderTable() {
        const tbody = document.getElementById('records-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!allRecords || allRecords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="no-records">暂无记录</td></tr>';
            return;
        }

        allRecords.forEach((record) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-elixir-processed', 'true');

            // 状态映射：API返回数字状态
            const statusMap = {
                1: { text: '排队中', class: 'queued' },
                2: { text: '成功', class: 'success' },
                3: { text: '失败', class: 'failure' },
                4: { text: '处理中', class: 'processing' }
            };

            const statusInfo = statusMap[record.status] || { text: '未知', class: 'success' };

            // 创建第一个td：应用名和包名
            const appNameTd = document.createElement('td');
            appNameTd.className = 'package-name tooltip-container';
            
            // 创建tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = `包名: ${record.pkgName}`;
            
            // 创建elixir-text-container
            const textContainer = document.createElement('div');
            textContainer.className = 'elixir-text-container';
            
            // 创建应用名span
            const appNameSpan = document.createElement('span');
            appNameSpan.className = 'elixir-package-text';
            appNameSpan.textContent = record.appName;
            
            // 创建包名span
            const pkgNameSpan = document.createElement('span');
            pkgNameSpan.className = 'elixir-package-name';
            pkgNameSpan.textContent = record.pkgName;
            
            // 组装结构
            textContainer.appendChild(appNameSpan);
            textContainer.appendChild(pkgNameSpan);
            appNameTd.appendChild(textContainer);
            appNameTd.appendChild(tooltip);

            // 创建第二个td：状态
            const statusTd = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = `status-badge ${statusInfo.class}`;
            statusBadge.textContent = statusInfo.text;
            statusTd.appendChild(statusBadge);

            // 创建第三个td：操作按钮
            const actionTd = document.createElement('td');
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'download-btn';
            downloadBtn.textContent = '下载';
            downloadBtn.addEventListener('click', () => {
                downloadApk(record.apkUrl);
            });

            const updateBtn = document.createElement('button');
            updateBtn.className = 'download-btn';
            updateBtn.style.marginLeft = '0.5rem';
            updateBtn.textContent = '更新';
            updateBtn.addEventListener('click', () => {
                updateApk(record.pkgName);
            });

            actionTd.appendChild(downloadBtn);
            actionTd.appendChild(updateBtn);

            // 检查是否需要隐藏该行
            if (shouldHidePackage(record.pkgName)) {
                tr.setAttribute('data-elixir-hidden', 'true');
                tr.style.display = 'none !important';
            }

            // 组装行
            tr.appendChild(appNameTd);
            tr.appendChild(statusTd);
            tr.appendChild(actionTd);

            tbody.appendChild(tr);
        });
    }

    // 下载APK（通过代理）
    window.downloadApk = function(url) {
        if (!url) return;

        // 登录检查
        if (!isLoggedIn) {
            window.showLoginModal(() => {
                checkLoginStatus();
            });
            return;
        }
        
        // 将原始URL转换为代理URL
        let proxyUrl = url;
        if (url.startsWith('https://open.lihouse.xyz')) {
            // 去掉域名部分，保留路径
            proxyUrl = API_CONFIG.BASE_URL + url.replace('https://open.lihouse.xyz', '');
        }
        
        const a = document.createElement('a');
        a.href = proxyUrl;
        a.download = url.split('/').pop() || 'download.apk';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // 更新APK（通过代理）
    window.updateApk = async function(packageName) {
        if (!packageName) return;

        // 安全检查：包名格式验证
        if (!/^[a-zA-Z0-9._-]+$/.test(packageName)) {
            console.error('[Elixir安全] 无效的包名格式:', packageName);
            alert('无效的包名格式');
            return;
        }

        // 登录检查
        if (!isLoggedIn) {
            window.showLoginModal(() => {
                checkLoginStatus();
            });
            return;
        }

        const btn = event.target;
        const originalText = btn.textContent;
        
        try {
            btn.disabled = true;
            btn.textContent = '更新中...';

            const url = API_CONFIG.BASE_URL + API_ENDPOINTS.UPDATE + '/' + encodeURIComponent(packageName);

            const response = await safeFetch(url, {
                method: 'GET',
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            const data = await response.json();

            if (data.status) {
                alert('更新成功！');
                fetchApkData();
            } else {
                alert('更新失败: ' + (data.reason || '未知错误'));
            }
        } catch (error) {
            console.error('[Elixir工具] 更新失败:', error);
            alert('更新失败: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    // 创建设置面板
    function createSettingsPanel() {
        const btn = document.getElementById('elixir-settings-btn');
        const panel = document.getElementById('elixir-settings-panel');
        const packageList = document.getElementById('settings-package-list');
        const addBtn = document.getElementById('settings-add-btn');
        const closeBtn = panel.querySelector('.settings-close-btn');

        // 点击设置按钮显示/隐藏面板
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('show');
        });

        // 点击关闭按钮关闭面板，有更改时刷新
        closeBtn.addEventListener('click', () => {
            panel.classList.remove('show');
            if (hasChanges) {
                location.reload();
            }
        });

        // 点击外部区域关闭面板
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !btn.contains(e.target)) {
                panel.classList.remove('show');
                if (hasChanges) {
                    location.reload();
                }
            }
        });

        // 创建包名输入项
        function createPackageItem(value = '') {
            const item = document.createElement('div');
            item.className = 'settings-item';
            item.innerHTML = `
                <input type="text" placeholder="输入包名" value="${value}">
                <button class="settings-remove-btn">×</button>
            `;

            const input = item.querySelector('input');
            const removeBtn = item.querySelector('.settings-remove-btn');

            input.addEventListener('input', savePackages);

            removeBtn.addEventListener('click', () => {
                item.remove();
                savePackages();
            });

            return item;
        }

        // 保存包名列表
        function savePackages() {
            const inputs = packageList.querySelectorAll('input');
            hiddenPackages = Array.from(inputs)
                .map(input => input.value.trim())
                .filter(value => value);
            saveHiddenPackages();
            hasChanges = true;
            fetchApkData();
        }

        // 加载已保存的包名
        loadHiddenPackages(() => {
            if (hiddenPackages.length === 0) {
                packageList.appendChild(createPackageItem());
            } else {
                hiddenPackages.forEach(pkg => {
                    packageList.appendChild(createPackageItem(pkg));
                });
            }
        });

        // 添加新输入框
        addBtn.addEventListener('click', () => {
            const newItem = createPackageItem();
            packageList.appendChild(newItem);
            newItem.querySelector('input').focus();
        });
    }

    // 文件上传处理
    function setupFileUpload() {
        const fileInput = document.getElementById('apk-upload');
        const uploadBtn = document.querySelector('.primary-btn');
        const fileLabel = document.querySelector('.file-label');

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                uploadBtn.disabled = false;
                fileLabel.innerHTML = `<span class="upload-icon">📄</span> ${file.name}`;
            } else {
                uploadBtn.disabled = true;
                fileLabel.innerHTML = '<span class="upload-icon">📁</span> 选择APK文件';
            }
        });

        uploadBtn.addEventListener('click', async () => {
            // 登录检查
            if (!isLoggedIn) {
                window.showLoginModal(() => {
                    checkLoginStatus();
                });
                return;
            }

            const file = fileInput.files[0];
            if (!file) return;

            // 安全检查：文件类型验证
            if (!file.name.toLowerCase().endsWith('.apk')) {
                alert('请选择APK文件');
                return;
            }

            // 安全检查：文件大小限制（50MB）
            const MAX_FILE_SIZE = 50 * 1024 * 1024;
            if (file.size > MAX_FILE_SIZE) {
                alert('文件大小不能超过50MB');
                return;
            }

            uploadBtn.disabled = true;
            uploadBtn.textContent = '上传中...';

            try {
                const formData = new FormData();
                formData.append('apk', file);

                const response = await safeFetch(API_CONFIG.BASE_URL + API_ENDPOINTS.UPLOAD, {
                    method: 'POST',
                    mode: 'cors',
                    body: formData,
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                const data = await response.json();

                if (data.status) {
                    alert('文件上传成功！');
                    fetchApkData();
                } else {
                    alert('上传失败: ' + (data.reason || '未知错误'));
                }
            } catch (error) {
                console.error('[Elixir工具] 上传失败:', error);
                alert('上传失败: ' + error.message);
            } finally {
                uploadBtn.textContent = '上传并改包';
                fileInput.value = '';
                fileLabel.innerHTML = '<span class="upload-icon">📁</span> 选择APK文件';
            }
        });
    }

    // 设置登录按钮
    function setupLogin() {
        const loginBtn = document.getElementById('login-btn');
        
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                // 显示登录弹窗
                window.showLoginModal(() => {
                    // 登录成功后重新检查登录状态并加载数据
                    checkLoginStatus();
                });
            });
        }
    }

    // 检测是否已登录（通过Cookie验证）
    async function checkLoginStatus() {
        const loginBtn = document.getElementById('login-btn');

        // 首先检查Cookie中的登录状态
        try {
            const hasAuthCookie = CookieManager.hasAuthCookie();
            
            if (hasAuthCookie) {
                // 有Cookie，视为已登录
                isLoggedIn = true;
                if (loginBtn) {
                    loginBtn.classList.add('hidden');
                }
                
                // 保存登录状态到localStorage
                localStorage.setItem('elixir_loginStatus', 'true');
                localStorage.setItem('elixir_loginTime', Date.now().toString());
                
                // 有Cookie才进行API请求获取数据
                try {
                    await fetchApkData();
                } catch (error) {
                    console.error('[Elixir工具] 获取数据失败:', error);
                    // 即使API失败，只要有Cookie就认为已登录
                }
            } else {
                // 没有Cookie，检查localStorage
                const storedStatus = localStorage.getItem('elixir_loginStatus');
                const loginTime = localStorage.getItem('elixir_loginTime');
                
                if (storedStatus === 'true' && loginTime) {
                    const timeDiff = Date.now() - parseInt(loginTime);
                    const hoursDiff = timeDiff / (1000 * 60 * 60);
                    
                    if (hoursDiff < 24) {
                        // localStorage有状态但无Cookie，可能是过期了
                        localStorage.removeItem('elixir_loginStatus');
                        localStorage.removeItem('elixir_loginTime');
                    }
                }
                isLoggedIn = false;
                if (loginBtn) {
                    loginBtn.classList.remove('hidden');
                }
                
                // 没有Cookie，不进行任何API请求，直接显示未登录状态
                const tbody = document.getElementById('records-tbody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="3" class="no-records">请先登录</td></tr>';
                }
            }
        } catch (e) {
            console.error('[Elixir工具] 读取登录状态失败:', e);
            isLoggedIn = false;
            if (loginBtn) {
                loginBtn.classList.remove('hidden');
            }
            
            // 异常情况下也不进行API请求
            const tbody = document.getElementById('records-tbody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">请先登录</td></tr>';
            }
        }
    }

    // 初始化
    function init() {
        createSettingsPanel();
        setupFileUpload();
        setupLogin();
        loadHiddenPackages(() => {
            // 先检查登录状态，再获取数据
            checkLoginStatus();
        });
    }

    init();
})();