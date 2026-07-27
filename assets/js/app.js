(function() {
    'use strict';

    let hiddenPackages = [];
    let hasChanges = false;
    let allRecords = [];
    let isLoggedIn = false; 

    function validateUrl(url) {
        try {
            const parsedUrl = new URL(url, window.location.origin);
            

            if (parsedUrl.protocol !== 'https:') {
                console.error('[Elixir安全] 不允许的协议:', parsedUrl.protocol);
                return false;
            }
            

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

    async function safeFetch(url, options = {}) {

        if (!validateUrl(url)) {
            throw new Error('请求URL验证失败');
        }

        if (!CookieManager.hasAuthCookie()) {
            throw new Error('需要登录才能访问此功能');
        }

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

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function safeSetText(element, text) {
        if (element) {
            element.textContent = String(text || '');
        }
    }

    function safeCreateTextNode(text) {
        return document.createTextNode(String(text || ''));
    }

    function loadHiddenPackages(callback) {
        try {
            const stored = CookieManager.getSecureData('elixir_hiddenPackages');
            if (stored) {
                hiddenPackages = JSON.parse(stored);

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

    function saveHiddenPackages() {
        try {
            CookieManager.setSecureData('elixir_hiddenPackages', JSON.stringify(hiddenPackages));
        } catch (e) {
            console.error('[Elixir工具] 保存隐藏包名列表时出错:', e);
        }
    }

    function shouldHidePackage(packageName) {
        return hiddenPackages.some(hidden => 
            packageName === hidden || 
            packageName.startsWith(hidden + '.')
        );
    }

    async function fetchApkData() {

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

                const seenPackages = new Set();
                allRecords = data.apks.filter(item => {

                    if (shouldHidePackage(item.pkgName)) {
                        return false;
                    }

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

            const safeMsg = escapeHtml(error.message || '未知错误');

            if (error.name === 'TypeError' && error.message.includes('CORS')) {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">跨域访问被限制，请检查后端配置</td></tr>';
            } else if (error.message.includes('需要登录才能访问此功能')) {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">登录已过期，请重新登录</td></tr>';
            } else {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">网络请求失败: ' + safeMsg + '</td></tr>';
            }
        }
    }

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

            const statusMap = {
                1: { text: '排队中', class: 'queued' },
                2: { text: '成功', class: 'success' },
                3: { text: '失败', class: 'failure' },
                4: { text: '处理中', class: 'processing' }
            };

            const statusInfo = statusMap[record.status] || { text: '未知', class: 'success' };

            const appNameTd = document.createElement('td');
            appNameTd.className = 'package-name tooltip-container';
            

            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = `包名: ${record.pkgName}`;
            

            const textContainer = document.createElement('div');
            textContainer.className = 'elixir-text-container';
            

            const appNameSpan = document.createElement('span');
            appNameSpan.className = 'elixir-package-text';
            appNameSpan.textContent = record.appName;
            

            const pkgNameSpan = document.createElement('span');
            pkgNameSpan.className = 'elixir-package-name';
            pkgNameSpan.textContent = record.pkgName;
            

            textContainer.appendChild(appNameSpan);
            textContainer.appendChild(pkgNameSpan);
            appNameTd.appendChild(textContainer);
            appNameTd.appendChild(tooltip);

            const statusTd = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = `status-badge ${statusInfo.class}`;
            statusBadge.textContent = statusInfo.text;
            statusTd.appendChild(statusBadge);

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

            if (shouldHidePackage(record.pkgName)) {
                tr.setAttribute('data-elixir-hidden', 'true');

                tr.style.setProperty('display', 'none', 'important');
            }

            tr.appendChild(appNameTd);
            tr.appendChild(statusTd);
            tr.appendChild(actionTd);

            tbody.appendChild(tr);
        });
    }

    function sanitizeFilename(name) {
        if (!name) return '';
        return String(name)
            .replace(/[\\/:*?"<>|]/g, '_')   
            .replace(/[\x00-\x1f]/g, '')    
            .replace(/^\.+/, '')             
            .trim()
            .slice(0, 100);                  
    }

    window.downloadApk = function(url, appName, pkgName) {
        if (!url) return;

        if (!isLoggedIn) {
            window.showLoginModal(() => {
                checkLoginStatus();
            });
            return;
        }

        let proxyUrl;
        if (url.startsWith('https://open.lihouse.xyz')) {

            const filePath = url.replace('https://open.lihouse.xyz', '');
            proxyUrl = API_CONFIG.BASE_URL + API_ENDPOINTS.DOWNLOAD + '?path=' + encodeURIComponent(filePath);
        } else if (url.startsWith('/')) {

            proxyUrl = API_CONFIG.BASE_URL + API_ENDPOINTS.DOWNLOAD + '?path=' + encodeURIComponent(url);
        } else {

            console.error('[Elixir安全] 拒绝非目标域名下载URL:', url);
            alert('下载链接无效');
            return;
        }

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

    // 创建全局隐藏的更新文件选择器（复用，避免重复创建）
    let updateFileInput = null;
    let pendingUpdateInfo = null;

    function getUpdateFileInput() {
        if (!updateFileInput) {
            updateFileInput = document.createElement('input');
            updateFileInput.type = 'file';
            updateFileInput.accept = '.apk';
            updateFileInput.style.display = 'none';
            updateFileInput.addEventListener('change', handleUpdateFileSelect);
            document.body.appendChild(updateFileInput);
        }
        return updateFileInput;
    }

    async function readZipEntry(arrayBuffer, entryPath) {
        const view = new DataView(arrayBuffer);
        const targetPathLower = entryPath.replace(/\\/g, '/').toLowerCase();
        const LF_SIGNATURE = 0x04034B50;
        const EOCD_SIGNATURE = 0x06054B50;

        let offset = 0;
        while (offset < view.byteLength - 4) {
            const signature = view.getUint32(offset, true);

            if (signature === LF_SIGNATURE) {
                const version = view.getUint16(offset + 4, true);
                const flags = view.getUint16(offset + 6, true);
                const compression = view.getUint16(offset + 8, true);
                const crc32 = view.getUint32(offset + 16, true);
                const compressedSize = view.getUint32(offset + 20, true);
                const uncompressedSize = view.getUint32(offset + 24, true);
                const fileNameLength = view.getUint16(offset + 26, true);
                const extraFieldLength = view.getUint16(offset + 28, true);

                const fileNameBytes = new Uint8Array(arrayBuffer, offset + 30, fileNameLength);
                const fileName = new TextDecoder('UTF-8').decode(fileNameBytes);
                const fileNameLower = fileName.toLowerCase();

                if (fileNameLower === targetPathLower) {
                    const fileDataOffset = offset + 30 + fileNameLength + extraFieldLength;
                    const fileData = new Uint8Array(arrayBuffer, fileDataOffset, compressedSize);

                    if (compression === 0) {
                        return new TextDecoder('UTF-8').decode(fileData);
                    } else if (compression === 8) {
                        try {
                            const stream = new Blob([fileData]).stream();
                            const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate'));
                            const reader = decompressedStream.getReader();
                            const chunks = [];
                            let result;
                            while (!(result = await reader.read()).done) {
                                chunks.push(result.value);
                            }
                            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                            const decompressedData = new Uint8Array(totalLength);
                            let pos = 0;
                            for (const chunk of chunks) {
                                decompressedData.set(chunk, pos);
                                pos += chunk.length;
                            }
                            return new TextDecoder('UTF-8').decode(decompressedData);
                        } catch (e) {
                            console.error('[Elixir工具] ZIP deflate解压失败:', e);
                            return null;
                        }
                    } else {
                        console.error('[Elixir工具] 不支持的压缩方法:', compression);
                        return null;
                    }
                }

                const localRecordSize = 30 + fileNameLength + extraFieldLength + compressedSize;
                offset += localRecordSize;
            } else if (signature === EOCD_SIGNATURE) {
                break;
            } else {
                offset++;
            }
        }

        console.warn('[Elixir工具] 在APK中未找到文件:', entryPath);
        return null;
    }

    async function handleUpdateFileSelect(e) {
        const file = e.target.files[0];
        if (!file || !pendingUpdateInfo) return;

        const { packageName, btn } = pendingUpdateInfo;
        const originalText = btn.textContent;

        if (!file.name.toLowerCase().endsWith('.apk')) {
            alert('请选择APK文件');
            resetUpdateInput();
            return;
        }

        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            alert('文件大小不能超过50MB');
            resetUpdateInput();
            return;
        }

        try {
            btn.disabled = true;
            btn.textContent = '读取APK...';

            const arrayBuffer = await file.arrayBuffer();
            const entrypointContent = await readZipEntry(arrayBuffer, 'assets/www/entrypoint.js');

            btn.textContent = '更新中...';

            const url = API_CONFIG.BASE_URL + API_ENDPOINTS.UPDATE + '/' + encodeURIComponent(packageName);

            const response = await safeFetch(url, {
                method: 'POST',
                mode: 'cors',
                body: JSON.stringify({ entrypointContent: entrypointContent || '' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

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
            resetUpdateInput();
        }
    }

    function resetUpdateInput() {
        if (updateFileInput) {
            updateFileInput.value = '';
        }
        pendingUpdateInfo = null;
    }

    window.updateApk = function(packageName, btn) {
        if (!packageName) return;

        if (!/^[a-zA-Z0-9._-]+$/.test(packageName)) {
            console.error('[Elixir安全] 无效的包名格式:', packageName);
            alert('无效的包名格式');
            return;
        }

        if (!isLoggedIn) {
            window.showLoginModal(() => {
                checkLoginStatus();
            });
            return;
        }

        if (!btn) {
            console.error('[Elixir安全] 更新按钮引用无效');
            return;
        }

        // 保存更新信息，触发文件选择
        pendingUpdateInfo = { packageName, btn };
        const fileInput = getUpdateFileInput();
        fileInput.click();
    }

    function createSettingsPanel() {
        const btn = document.getElementById('elixir-settings-btn');
        const panel = document.getElementById('elixir-settings-panel');
        const packageList = document.getElementById('settings-package-list');
        const addBtn = document.getElementById('settings-add-btn');
        const closeBtn = panel.querySelector('.settings-close-btn');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('show');
        });

        closeBtn.addEventListener('click', () => {
            panel.classList.remove('show');
            if (hasChanges) {
                location.reload();
            }
        });

        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !btn.contains(e.target)) {
                panel.classList.remove('show');
                if (hasChanges) {
                    location.reload();
                }
            }
        });

        function createPackageItem(value = '') {
            const item = document.createElement('div');
            item.className = 'settings-item';

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '输入包名';

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

        function savePackages() {
            const inputs = packageList.querySelectorAll('input');
            hiddenPackages = Array.from(inputs)
                .map(input => input.value.trim())
                .filter(value => value);
            saveHiddenPackages();
            hasChanges = true;
            fetchApkData();
        }

        loadHiddenPackages(() => {
            if (hiddenPackages.length === 0) {
                packageList.appendChild(createPackageItem());
            } else {
                hiddenPackages.forEach(pkg => {
                    packageList.appendChild(createPackageItem(pkg));
                });
            }
        });

        addBtn.addEventListener('click', () => {
            const newItem = createPackageItem();
            packageList.appendChild(newItem);
            newItem.querySelector('input').focus();
        });
    }

    function setupFileUpload() {
        const fileInput = document.getElementById('apk-upload');
        const uploadBtn = document.querySelector('.primary-btn');
        const fileLabel = document.querySelector('.file-label');

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                uploadBtn.disabled = false;

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

            if (!isLoggedIn) {
                window.showLoginModal(() => {
                    checkLoginStatus();
                });
                return;
            }

            const file = fileInput.files[0];
            if (!file) return;

            if (!file.name.toLowerCase().endsWith('.apk')) {
                alert('请选择APK文件');
                return;
            }

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

                fileLabel.textContent = '';
                const iconSpan = document.createElement('span');
                iconSpan.className = 'upload-icon';
                iconSpan.textContent = '📁';
                fileLabel.appendChild(iconSpan);
                fileLabel.appendChild(document.createTextNode(' 选择APK文件'));
            }
        });
    }

    function setupLogin() {
        const loginBtn = document.getElementById('login-btn');
        
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {

                window.showLoginModal(() => {

                    checkLoginStatus();
                });
            });
        }
    }

    async function checkLoginStatus() {
        const loginBtn = document.getElementById('login-btn');

        try {
            const hasAuthCookie = CookieManager.hasAuthCookie();
            
            if (hasAuthCookie) {

                isLoggedIn = true;
                if (loginBtn) {
                    loginBtn.classList.add('hidden');
                }

                CookieManager.saveLoginStatus();

                try {
                    await fetchApkData();
                } catch (error) {
                    console.error('[Elixir工具] 获取数据失败:', error);

                }
            } else {

                CookieManager.clearLoginStatus();
                isLoggedIn = false;
                if (loginBtn) {
                    loginBtn.classList.remove('hidden');
                }
                

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
            

            const tbody = document.getElementById('records-tbody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="3" class="no-records">请先登录</td></tr>';
            }
        }
    }

    function init() {
        createSettingsPanel();
        setupFileUpload();
        setupLogin();
        loadHiddenPackages(() => {

            checkLoginStatus();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();