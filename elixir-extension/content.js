(function() {
    'use strict';

    let isFullyLoaded = false;
    let loadingObserver = null;
    let retryCount = 0;
    const MAX_RETRY = 5;
    let skeletonCreated = false;
    let hiddenPackages = [];

    // 安全执行函数
    function safeExecute(fn, errorMsg) {
        try {
            return fn();
        } catch (error) {
            console.error(`[Elixir工具] ${errorMsg}:`, error);
            return null;
        }
    }

    // 加载隐藏的包名列表
    function loadHiddenPackages(callback) {
        safeExecute(() => {
            if (chrome && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['hiddenPackages'], (result) => {
                    hiddenPackages = result.hiddenPackages || [];
                    if (callback) callback();
                });
            } else {
                hiddenPackages = [];
                if (callback) callback();
            }
        }, '加载隐藏包名列表时出错');
    }

    // 检查包名是否需要隐藏
    function shouldHidePackage(packageName) {
        return hiddenPackages.some(hidden => 
            packageName === hidden || 
            packageName.startsWith(hidden + '.')
        );
    }

    // 创建骨架屏
    function createSkeleton() {
        if (skeletonCreated) return;

        let container = document.querySelector('.records-table-container');
        if (!container) {
            container = document.querySelector('.dashboard-container');
        }
        if (!container) {
            container = document.querySelector('.elixir-panel');
        }
        if (!container) return;

        // 移除已有的骨架屏
        const existingSkeleton = document.querySelector('.elixir-skeleton');
        if (existingSkeleton) existingSkeleton.remove();

        // 计算屏幕可容纳的项数
        const itemHeight = 80;
        const screenHeight = window.innerHeight;
        const itemCount = Math.ceil(screenHeight / itemHeight) * 2;

        const skeleton = document.createElement('div');
        skeleton.className = 'elixir-skeleton';

        for (let i = 0; i < itemCount; i++) {
            const item = document.createElement('div');
            item.className = 'elixir-skeleton-item';
            item.innerHTML = `
                <div class="elixir-skeleton-line"></div>
                <div class="elixir-skeleton-line"></div>
            `;
            skeleton.appendChild(item);
        }

        // 插入到容器的父元素中，在容器之前
        container.parentNode.insertBefore(skeleton, container);
        skeletonCreated = true;
    }

    // 移除骨架屏
    function removeSkeleton() {
        const skeleton = document.querySelector('.elixir-skeleton');
        if (skeleton) skeleton.remove();
    }

    // 删除不需要的元素
    function removeUnwantedElements() {
        safeExecute(() => {
            document.querySelectorAll('.background-decoration, .gradient-circle, .circle-1, .circle-2, .circle-3, .grid-pattern').forEach(el => el.remove());
            document.querySelectorAll('.features, .features-grid, .feature-card').forEach(el => el.remove());
            document.querySelectorAll('footer.footer, .footer-content, .footer-logo, .footer-links, .footer-copyright').forEach(el => el.remove());
            document.querySelectorAll('.hero-content, .hero-title, .hero-subtitle, .cta-buttons, .secondary-btn').forEach(el => el.remove());
            document.querySelectorAll('.card-glow').forEach(el => el.remove());
        }, '删除元素时出错');
    }

    // 处理表格
    function processTable() {
        safeExecute(() => {
            const tbody = document.querySelector('.records-table tbody');
            if (!tbody) return;

            const rows = Array.from(tbody.querySelectorAll('tr'));
            if (rows.length === 0) return;

            // 有数据时移除骨架屏
            removeSkeleton();

            const seenPackages = new Set();

            rows.forEach(row => {
                if (row.getAttribute('data-elixir-processed') === 'true') return;
                row.setAttribute('data-elixir-processed', 'true');

                const packageCell = row.querySelector('.package-name.tooltip-container');
                const tooltipEl = row.querySelector('.tooltip');

                if (!packageCell || !tooltipEl) return;

                const appName = packageCell.childNodes[0]?.textContent?.trim();
                const packageMatch = tooltipEl.textContent.match(/包名:\s*(.+)/);
                const packageName = packageMatch ? packageMatch[1].trim() : null;

                if (!appName || !packageName) return;

                // 检查是否需要隐藏这个包名
                if (shouldHidePackage(packageName)) {
                    row.style.cssText = 'display: none !important;';
                    row.setAttribute('data-elixir-hidden', 'true');
                    return;
                }

                packageCell.style.cssText = 'display: none !important;';

                const textContainer = document.createElement('div');
                textContainer.className = 'elixir-text-container';
                textContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

                const textSpan = document.createElement('span');
                textSpan.textContent = appName;
                textSpan.className = 'elixir-package-text';
                textSpan.style.cssText = 'font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 14px; color: inherit; text-align: left; display: block; font-weight: bold;';

                const packageSpan = document.createElement('span');
                packageSpan.textContent = packageName;
                packageSpan.className = 'elixir-package-name';
                packageSpan.style.cssText = 'font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 12px; color: rgba(255,255,255,0.5); text-align: left; display: block;';

                textContainer.appendChild(textSpan);
                textContainer.appendChild(packageSpan);
                packageCell.parentNode.insertBefore(textContainer, packageCell.nextSibling);

                if (seenPackages.has(packageName)) {
                    row.style.cssText = 'display: none !important;';
                    row.setAttribute('data-elixir-hidden', 'true');
                } else {
                    seenPackages.add(packageName);
                }
            });

            // 显示表格容器
            const container = document.querySelector('.records-table-container');
            if (container) {
                container.classList.add('elixir-ready');
            }
        }, '处理表格时出错');
    }

    // 更改网页标题
    function updatePageTitle() {
        safeExecute(() => {
            document.title = 'Elixir热更新';
        }, '更改网页标题时出错');
    }

    // 处理所有内容
    function processAll() {
        loadHiddenPackages(() => {
            createSkeleton();
            removeUnwantedElements();
            processTable();
        });
    }

    // 开始加载时监听
    function startLoadingObserver() {
        safeExecute(() => {
            loadingObserver = new MutationObserver(() => {
                processAll();
            });

            loadingObserver.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true
            });

            processAll();
        }, '启动加载监听时出错');
    }

    // 监听表格变化（网页加载完成后）
    function observeTableChanges() {
        safeExecute(() => {
            const tbody = document.querySelector('.records-table tbody');
            if (!tbody) return;

            let debounceTimer = null;
            let isProcessing = false;

            const observer = new MutationObserver((mutations) => {
                const hasNewRows = mutations.some((mutation) =>
                    mutation.type === 'childList' &&
                    Array.from(mutation.addedNodes).some((node) =>
                        node.nodeType === Node.ELEMENT_NODE && node.tagName === 'TR'
                    )
                );

                if (!hasNewRows || isProcessing) return;

                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    isProcessing = true;
                    observer.disconnect();
                    loadHiddenPackages(() => {
                        processTable();
                        observer.observe(tbody, { childList: true });
                        isProcessing = false;
                    });
                }, 150);
            });

            observer.observe(tbody, { childList: true });
        }, '启动表格监听时出错');
    }

    // 重试机制
    function retryProcess() {
        if (retryCount >= MAX_RETRY) {
            console.log('[Elixir工具] 达到最大重试次数，停止重试');
            return;
        }
        retryCount++;
        console.log(`[Elixir工具] 第 ${retryCount} 次重试...`);
        processAll();
    }

    // 网页加载完成后停止加载监听，启动表格监听
    function onFullyLoaded() {
        if (isFullyLoaded) return;
        isFullyLoaded = true;

        safeExecute(() => {
            if (loadingObserver) {
                loadingObserver.disconnect();
                loadingObserver = null;
            }

            processAll();
            observeTableChanges();
        }, '完成加载处理时出错');
    }

    // 网络状态监听
    function setupNetworkListener() {
        window.addEventListener('online', () => {
            console.log('[Elixir工具] 网络已恢复');
            retryCount = 0;
            setTimeout(processAll, 500);
        });

        window.addEventListener('offline', () => {
            console.log('[Elixir工具] 网络已断开');
        });
    }

    // 错误监听
    window.addEventListener('error', (event) => {
        console.error('[Elixir工具] 全局错误:', event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('[Elixir工具] 未处理的 Promise 错误:', event.reason);
    });

    // 创建设置按钮和面板
    function createSettingsPanel() {
        // 检查是否已存在
        if (document.getElementById('elixir-settings-btn')) return;

        // 添加样式
        const style = document.createElement('style');
        style.id = 'elixir-settings-style';
        style.textContent = `
            #elixir-settings-btn {
                position: fixed;
                top: 16px;
                right: 16px;
                width: 40px;
                height: 40px;
                background: #fff;
                border: 1px solid #dadce0;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 99999;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                color: #5f6368;
            }
            #elixir-settings-btn:hover {
                background: #f1f3f4;
                border-color: #9aa0a6;
            }
            #elixir-settings-panel {
                position: fixed;
                top: 16px;
                right: 16px;
                width: 320px;
                background: #fff;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.15);
                z-index: 99999;
                font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
                font-size: 14px;
                display: none;
            }
            #elixir-settings-panel.show {
                display: block;
            }
            #elixir-settings-panel .settings-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid #dadce0;
            }
            #elixir-settings-panel .settings-header span:first-child {
                font-weight: 500;
                color: #202124;
            }
            #elixir-settings-panel .settings-close-btn {
                width: 28px;
                height: 28px;
                border: none;
                border-radius: 50%;
                background: transparent;
                color: #5f6368;
                cursor: pointer;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            #elixir-settings-panel .settings-close-btn:hover {
                background: #f1f3f4;
            }
            #elixir-settings-panel .settings-content {
                padding: 12px 16px;
                max-height: 300px;
                overflow-y: auto;
            }
            #elixir-settings-panel .settings-item {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }
            #elixir-settings-panel .settings-item input {
                flex: 1;
                padding: 8px 12px;
                border: 1px solid #dadce0;
                border-radius: 4px;
                font-size: 13px;
                outline: none;
            }
            #elixir-settings-panel .settings-item input:focus {
                border-color: #1a73e8;
            }
            #elixir-settings-panel .settings-remove-btn {
                width: 36px;
                height: 36px;
                border: 1px solid #dadce0;
                border-radius: 4px;
                background: #fff;
                color: #5f6368;
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
                flex: none;
            }
            #elixir-settings-panel .settings-remove-btn:hover {
                background: #fce8e6;
                border-color: #c5221f;
                color: #c5221f;
            }
            #elixir-settings-panel .settings-add-btn {
                width: 100%;
                padding: 10px;
                border: 1px dashed #dadce0;
                border-radius: 4px;
                background: #fff;
                color: #1a73e8;
                cursor: pointer;
                font-size: 18px;
                font-weight: 300;
            }
            #elixir-settings-panel .settings-add-btn:hover {
                background: #e8f0fe;
                border-color: #1a73e8;
            }
        `;
        document.head.appendChild(style);

        // 创建设置按钮（使用内联SVG）
        const btn = document.createElement('div');
        btn.id = 'elixir-settings-btn';
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        document.body.appendChild(btn);

        // 创建设置面板
        const panel = document.createElement('div');
        panel.id = 'elixir-settings-panel';
        panel.innerHTML = `
            <div class="settings-header">
                <span>隐藏包名</span>
                <button class="settings-close-btn">×</button>
            </div>
            <div class="settings-content">
                <div id="settings-package-list"></div>
                <button id="settings-add-btn" class="settings-add-btn">
                    <span>+</span>
                </button>
            </div>
        `;
        document.body.appendChild(panel);

        const packageList = document.getElementById('settings-package-list');
        const addBtn = document.getElementById('settings-add-btn');
        const closeBtn = panel.querySelector('.settings-close-btn');
        let hasChanges = false;

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

        function savePackages() {
            const inputs = packageList.querySelectorAll('input');
            const packages = Array.from(inputs)
                .map(input => input.value.trim())
                .filter(value => value);
            chrome.storage.local.set({ hiddenPackages: packages });
            hiddenPackages = packages;
            hasChanges = true;
            processAll();
        }

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

        chrome.storage.local.get(['hiddenPackages'], (result) => {
            const packages = result.hiddenPackages || [];
            if (packages.length === 0) {
                packageList.appendChild(createPackageItem());
            } else {
                packages.forEach(pkg => {
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

    // 初始化
    function init() {
        setupNetworkListener();

        // 更改网页标题
        updatePageTitle();

        // 创建设置面板
        createSettingsPanel();

        // 立即尝试创建骨架屏
        createSkeleton();

        if (document.body) {
            startLoadingObserver();
        } else {
            document.addEventListener('DOMContentLoaded', startLoadingObserver);
        }

        if (document.readyState === 'complete') {
            onFullyLoaded();
        } else {
            window.addEventListener('load', onFullyLoaded);
        }

        // 备用重试机制
        setTimeout(retryProcess, 1000);
        setTimeout(retryProcess, 2000);
    }

    init();

})();
