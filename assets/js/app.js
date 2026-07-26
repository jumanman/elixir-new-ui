(function() {
    'use strict';

    let hiddenPackages = [];
    let hasChanges = false;
    let allRecords = [];
    let isLoggedIn = false; // 登录状态

    // 安全检查：验证URL（相对路径无需域名验证）
    function validateUrl(url) {
        try {
            const parsedUrl = new URL(url, window.location.origin);
            
            // 检查协议（确保是HTTPS）
            if (parsedUrl.protocol !== 'https:') {
                console.error('[Elixir安全] 不允许的协议:', parsedUrl.protocol);
                return false;
            }
            
            // 检查是否为本域名（防止SSRF）
            if (parsedUrl.hostname !== window.location.hostname) {
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

    // HTML转义（防止XSS）- 用于将不可信文本安全插入HTML
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // 安全设置元素文本内容（替代innerHTML）
    function safeSetText(element, text) {
        if (element) {
            element.textContent = String(text || '');
        }
    }

    // 安全创建文本节点
    function safeCreateTextNode(text) {
        return document.createTextNode(String(text || ''));
    }

    // 加载隐藏的包名列表（带完整性校验）
    function loadHiddenPackages(callback) {
        try {
            const stored = CookieManager.getSecureData('elixir_hiddenPackages');
            if (stored) {
                hiddenPackages = JSON.parse(stored);
                // 验证数据格式：确保是数组且元素都是字符串
                if (!Array.isArray(hiddenPackages)) {
                    hiddenPackages = [];
                } else {
                    hiddenPackages = hiddenPackages.filter(item => typeof item === 'string');
                }
            } else {
                hiddenPackages = [];
            }
        } catch (e) {
            console.error('[Elixir工具] 加载隐藏包名列表时出错:', e);
            hiddenPackages = [];
        }
        if (callback) callback();
    }

    // 保存隐藏包名（带完整性校验）
    function saveHiddenPackages() {
        try {
            CookieManager.setSecureData('elixir_hiddenPackages', JSON.stringify(hiddenPackages));
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

            // 安全显示错误信息（避免XSS）
            const safeMsg = escapeHtml(error.message || '未知错误');
            // 跨域回退方案
            if (error.name === 'TypeError' && error.message.includes('CORS')) {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">跨域访问被限制，请检查后端配置</td></tr>';
            } else if (error.message.includes('需要登录才能访问此功能')) {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">登录已过期，请重新登录</td></tr>';
            } else {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">网络请求失败: ' + safeMsg + '</td></tr>';
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
                downloadApk(record.apkUrl, record.appName, record.pkgName);
            });

            const updateBtn = document.createElement('button');
            updateBtn.className = 'download-btn';
            updateBtn.style.marginLeft = '0.5rem';
            updateBtn.textContent = '更新';
            updateBtn.addEventListener('click', (event) => {
                updateApk(record.pkgName, event.currentTarget);
            });

            actionTd.appendChild(downloadBtn);
            actionTd.appendChild(updateBtn);

            // 检查是否需要隐藏该行
            if (shouldHidePackage(record.pkgName)) {
                tr.setAttribute('data-elixir-hidden', 'true');
                // 使用 setProperty 正确设置 !important（style.display 无法设置优先级）
                tr.style.setProperty('display', 'none', 'important');
            }

            // 组装行
            tr.appendChild(appNameTd);
            tr.appendChild(statusTd);
            tr.appendChild(actionTd);

            tbody.appendChild(tr);
        });
    }

    // 清理文件名中的非法字符（Windows/Linux/Mac 通用）
    // 文件名不能包含：\ / : * ? " < > | 以及控制字符
    function sanitizeFilename(name) {
        if (!name) return '';
        return String(name)
            .replace(/[\\/:*?"<>|]/g, '_')   // 替换非法字符为下划线
            .replace(/[\x00-\x1f]/g, '')    // 移除控制字符
            .replace(/^\.+/, '')             // 移除开头的点（防止隐藏文件）
            .trim()
            .slice(0, 100);                  // 限制长度，避免文件名过长
    }

    // 下载APK（通过代理，使用应用名称和包名重命名文件）
    window.downloadApk = function(url, appName, pkgName) {
        if (!url) return;

        // 登录检查
        if (!isLoggedIn) {
            window.showLoginModal(() => {
                checkLoginStatus();
            });
            return;
        }

        // 安全：仅允许代理目标域名的URL，防止SSRF/开放重定向
        let proxyUrl;
        if (url.startsWith('https://open.lihouse.xyz')) {
            // 提取路径部分，通过下载端点代理（worker会校验路径遍历和文件扩展名）
            const filePath = url.replace('https://open.lihouse.xyz', '');
            proxyUrl = API_CONFIG.BASE_URL + API_ENDPOINTS.DOWNLOAD + '?path=' + encodeURIComponent(filePath);
        } else if (url.startsWith('/')) {
            // 相对路径，直接通过下载端点代理
            proxyUrl = API_CONFIG.BASE_URL + API_ENDPOINTS.DOWNLOAD + '?path=' + encodeURIComponent(url);
        } else {
            // 不允许的URL格式，拒绝下载
            console.error('[Elixir安全] 拒绝非目标域名下载URL:', url);
            alert('下载链接无效');
            return;
        }

        // 构造下载文件名：应用名称(包名).apk
        // 清理应用名称和包名中的非法字符，避免文件系统错误
        const safeAppName = sanitizeFilename(appName);
        const safePkgName = sanitizeFilename(pkgName);
        let downloadName;
        if (safeAppName && safePkgName) {
            downloadName = `${safeAppName}(${safePkgName}).apk`;
        } else if (safeAppName) {
            downloadName = `${safeAppName}.apk`;
        } else if (safePkgName) {
            downloadName = `${safePkgName}.apk`;
        } else {
            // 应用名称和包名都缺失，回退到URL中的文件名
            downloadName = (url.split('/').pop() || 'download.apk');
            if (!downloadName.toLowerCase().endsWith('.apk')) {
                downloadName += '.apk';
            }
        }

        const a = document.createElement('a');
        a.href = proxyUrl;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // 更新APK（通过代理）
    window.updateApk = async function(packageName, btn) {
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

        // 安全检查：确保 btn 是有效的 DOM 元素
        if (!btn || !btn.textContent) {
            console.error('[Elixir安全] 更新按钮引用无效');
            return;
        }
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

        // 创建包名输入项（使用 DOM API 避免 XSS）
        function createPackageItem(value = '') {
            const item = document.createElement('div');
            item.className = 'settings-item';

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '输入包名';
            // 使用 setAttribute 安全设置 value（自动转义）
            input.setAttribute('value', String(value || ''));

            const removeBtn = document.createElement('button');
            removeBtn.className = 'settings-remove-btn';
            removeBtn.type = 'button';
            removeBtn.textContent = '×';

            item.appendChild(input);
            item.appendChild(removeBtn);

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
                // 安全设置文件名（避免 XSS）：使用 DOM API 而非 innerHTML
                fileLabel.textContent = '';
                const iconSpan = document.createElement('span');
                iconSpan.className = 'upload-icon';
                iconSpan.textContent = '📄';
                fileLabel.appendChild(iconSpan);
                fileLabel.appendChild(document.createTextNode(' ' + file.name));
            } else {
                uploadBtn.disabled = true;
                fileLabel.textContent = '';
                const iconSpan = document.createElement('span');
                iconSpan.className = 'upload-icon';
                iconSpan.textContent = '📁';
                fileLabel.appendChild(iconSpan);
                fileLabel.appendChild(document.createTextNode(' 选择APK文件'));
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
                // 安全重置文件标签（避免 XSS）
                fileLabel.textContent = '';
                const iconSpan = document.createElement('span');
                iconSpan.className = 'upload-icon';
                iconSpan.textContent = '📁';
                fileLabel.appendChild(iconSpan);
                fileLabel.appendChild(document.createTextNode(' 选择APK文件'));
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

                // 保存登录状态（带完整性校验）
                CookieManager.saveLoginStatus();

                // 有Cookie才进行API请求获取数据
                try {
                    await fetchApkData();
                } catch (error) {
                    console.error('[Elixir工具] 获取数据失败:', error);
                    // 即使API失败，只要有Cookie就认为已登录
                }
            } else {
                // 没有Cookie，清除可能残留的登录状态
                CookieManager.clearLoginStatus();
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

    // 等待页面加载完成后再初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();