(function() {
    'use strict';

    let hiddenPackages = [];
    let hasChanges = false;
    let allRecords = [];
    let isLoggedIn = false; // 登录状态

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
        if (!isLoggedIn) {
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
            console.log('[Elixir工具] 请求URL:', url);

            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json',
                },
                cache: 'no-cache',
                credentials: 'include'
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

            tr.innerHTML = `
                <td>
                    <div class="elixir-text-container">
                        <span class="elixir-package-text">${record.appName}</span>
                        <span class="elixir-package-name">${record.pkgName}</span>
                    </div>
                </td>
                <td>
                    <span class="status-badge ${statusInfo.class}">${statusInfo.text}</span>
                </td>
                <td>
                    <button class="download-btn download-apk-btn">下载</button>
                    <button class="download-btn update-apk-btn" style="margin-left: 0.5rem;">更新</button>
                </td>
            `;

            // 添加下载按钮事件监听
            const downloadBtn = tr.querySelector('.download-apk-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => {
                    downloadApk(record.apkUrl);
                });
            }

            // 添加更新按钮事件监听
            const updateBtn = tr.querySelector('.update-apk-btn');
            if (updateBtn) {
                updateBtn.addEventListener('click', () => {
                    updateApk(record.pkgName);
                });
            }

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
            console.log('[Elixir工具] 更新请求URL:', url);

            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'include'
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
                alert('请先登录！');
                window.open('https://open.lihouse.xyz/elixir', '_blank');
                return;
            }

            const file = fileInput.files[0];
            if (!file) return;

            uploadBtn.disabled = true;
            uploadBtn.textContent = '上传中...';

            try {
                const formData = new FormData();
                formData.append('apk', file);

                const response = await fetch(API_CONFIG.BASE_URL + API_ENDPOINTS.UPLOAD, {
                    method: 'POST',
                    mode: 'cors',
                    body: formData,
                    cache: 'no-cache',
                    credentials: 'include'
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

    // 检测是否已登录（通过尝试获取数据）
    async function checkLoginStatus() {
        const loginBtn = document.getElementById('login-btn');

        try {
            const url = API_CONFIG.BASE_URL + API_ENDPOINTS.GET_APKS;
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'include',
                cache: 'no-cache'
            });

            const data = await response.json();

            if (data.status && data.apks) {
                // 已登录
                isLoggedIn = true;
                if (loginBtn) {
                    loginBtn.classList.add('hidden');
                }
            } else {
                // 未登录
                isLoggedIn = false;
                if (loginBtn) {
                    loginBtn.classList.remove('hidden');
                }
            }
        } catch (error) {
            // 请求失败，视为未登录
            isLoggedIn = false;
            if (loginBtn) {
                loginBtn.classList.remove('hidden');
            }
        }

        // 登录状态确定后再加载数据
        fetchApkData();
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