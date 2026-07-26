(function() {
    'use strict';

    let loginCallback = null;

    // 客户端登录限流配置（补充服务端KV限流）
    const LOGIN_THROTTLE = {
        maxAttempts: 5,           // 最大尝试次数
        windowMs: 5 * 60 * 1000,  // 5分钟窗口
        baseDelayMs: 1000,        // 基础延迟1秒
        maxDelayMs: 30 * 1000     // 最大延迟30秒
    };

    // 获取当前登录限流状态
    function getLoginThrottleState() {
        try {
            const raw = sessionStorage.getItem('elixir_loginThrottle');
            if (!raw) return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
            const state = JSON.parse(raw);
            const now = Date.now();
            // 窗口过期则重置
            if (now - state.firstAttemptAt > LOGIN_THROTTLE.windowMs) {
                return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
            }
            // 锁定过期则解锁（但保留尝试计数）
            if (state.lockedUntil && now > state.lockedUntil) {
                state.lockedUntil = 0;
            }
            return state;
        } catch (e) {
            return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
        }
    }

    // 保存登录限流状态
    function saveLoginThrottleState(state) {
        try {
            sessionStorage.setItem('elixir_loginThrottle', JSON.stringify(state));
        } catch (e) {
            // sessionStorage 不可用时静默失败
        }
    }

    // 检查是否被锁定，返回需等待的毫秒数（0表示未锁定）
    function getLoginLockRemaining() {
        const state = getLoginThrottleState();
        if (state.lockedUntil) {
            const remaining = state.lockedUntil - Date.now();
            return remaining > 0 ? remaining : 0;
        }
        return 0;
    }

    // 记录一次失败尝试，返回需等待的毫秒数
    function recordFailedAttempt() {
        const state = getLoginThrottleState();
        const now = Date.now();
        if (state.firstAttemptAt === 0) {
            state.firstAttemptAt = now;
        }
        state.attempts++;
        // 超过最大尝试次数则锁定，延迟指数增长
        if (state.attempts > LOGIN_THROTTLE.maxAttempts) {
            const exponent = state.attempts - LOGIN_THROTTLE.maxAttempts;
            const delay = Math.min(
                LOGIN_THROTTLE.baseDelayMs * Math.pow(2, exponent),
                LOGIN_THROTTLE.maxDelayMs
            );
            state.lockedUntil = now + delay;
            saveLoginThrottleState(state);
            return delay;
        }
        saveLoginThrottleState(state);
        return 0;
    }

    // 登录成功后重置限流状态
    function resetLoginThrottle() {
        try {
            sessionStorage.removeItem('elixir_loginThrottle');
        } catch (e) {
            // 静默失败
        }
    }

    // 公钥缓存（避免每次登录都请求公钥端点）
    let cachedPublicKey = null;

    // 获取服务器 RSA 公钥（带缓存）
    async function getServerPublicKey() {
        if (cachedPublicKey) return cachedPublicKey;

        const response = await fetch(API_ENDPOINTS.PUBKEY, {
            method: 'GET',
            cache: 'no-cache'
        });
        if (!response.ok) {
            throw new Error('获取公钥失败');
        }
        const data = await response.json();
        if (!data.publicKey) {
            throw new Error('公钥数据无效');
        }

        // 导入公钥用于加密
        cachedPublicKey = await crypto.subtle.importKey(
            'jwk',
            data.publicKey,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false,
            ['encrypt']
        );
        return cachedPublicKey;
    }

    // 使用 RSA 公钥加密密码，返回 Base64 字符串
    async function encryptPassword(password) {
        const publicKey = await getServerPublicKey();
        const encoder = new TextEncoder();
        const encrypted = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' },
            publicKey,
            encoder.encode(password)
        );
        // 转 Base64 以便通过 JSON 传输
        const bytes = new Uint8Array(encrypted);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // 加载登录弹窗HTML
    async function loadLoginModal() {
        try {
            const response = await fetch('assets/html/login-modal.html', {
                cache: 'no-cache'
            });
            if (!response.ok) {
                throw new Error('加载失败');
            }
            const html = await response.text();
            // 清理可能的XSS
            const sanitizedHtml = sanitizeHtml(html);
            document.body.insertAdjacentHTML('beforeend', sanitizedHtml);
            initLoginModal();
        } catch (error) {
            console.error('[Elixir登录] 加载登录弹窗失败:', error);
        }
    }

    // HTML清理（XSS防护，使用DOMParser比正则更安全）
    function sanitizeHtml(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 移除所有 <script> 标签
            doc.querySelectorAll('script').forEach(el => el.remove());

            // 移除所有事件处理属性和危险URL
            doc.querySelectorAll('*').forEach(el => {
                [...el.attributes].forEach(attr => {
                    const attrName = attr.name.toLowerCase();
                    const attrValue = attr.value.toLowerCase().trim();
                    // 移除 on* 事件属性
                    if (attrName.startsWith('on')) {
                        el.removeAttribute(attr.name);
                    }
                    // 移除 javascript: 协议
                    if ((attrName === 'href' || attrName === 'src') && attrValue.startsWith('javascript:')) {
                        el.removeAttribute(attr.name);
                    }
                });
            });

            return doc.body.innerHTML;
        } catch (e) {
            console.error('[Elixir登录] HTML清理失败:', e);
            return '';
        }
    }

    // 初始化登录弹窗
    function initLoginModal() {
        const modal = document.getElementById('elixir-login-modal');
        const overlay = document.getElementById('login-modal-overlay');
        const closeBtn = document.getElementById('login-modal-close');
        const form = document.getElementById('login-form');
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');

        // 关闭弹窗
        function closeModal() {
            modal.classList.remove('show');
            // 清空表单
            emailInput.value = '';
            passwordInput.value = '';
            clearErrors();
        }

        // 点击遮罩关闭
        overlay.addEventListener('click', closeModal);

        // 点击关闭按钮关闭
        closeBtn.addEventListener('click', closeModal);

        // 表单提交
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleLogin();
        });

        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                closeModal();
            }
        });

        // 邮箱实时验证
        emailInput.addEventListener('input', () => {
            validateEmailInput(emailInput);
        });

        // 邮箱失焦验证
        emailInput.addEventListener('blur', () => {
            validateEmailInput(emailInput, true);
        });

        // 密码实时验证
        passwordInput.addEventListener('input', () => {
            validatePasswordInput(passwordInput);
        });

        // 密码失焦验证
        passwordInput.addEventListener('blur', () => {
            validatePasswordInput(passwordInput, true);
        });
    }

    // 验证邮箱格式
    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // 邮箱输入验证（实时+失焦）
    function validateEmailInput(input, showErrorOnEmpty = false) {
        const value = input.value.trim();
        const errorEl = document.getElementById('email-error');
        
        // 清除之前的错误
        errorEl.style.display = 'none';

        // 检查长度限制
        if (value.length > 100) {
            showError('email-error', '邮箱长度不能超过100个字符');
            input.classList.add('error');
            return false;
        }

        // 失焦时检查格式
        if (showErrorOnEmpty || value.length > 0) {
            if (value && !validateEmail(value)) {
                showError('email-error', '请输入有效的邮箱地址');
                input.classList.add('error');
                return false;
            }
        }

        input.classList.remove('error');
        return true;
    }

    // 密码输入验证（实时+失焦）
    function validatePasswordInput(input, showErrorOnEmpty = false) {
        const value = input.value;
        const errorEl = document.getElementById('password-error');
        
        // 清除之前的错误
        errorEl.style.display = 'none';

        // 检查长度限制
        if (value.length > 50) {
            showError('password-error', '密码长度不能超过50个字符');
            input.classList.add('error');
            return false;
        }

        // 失焦时检查最小长度
        if (showErrorOnEmpty || value.length > 0) {
            if (value.length > 0 && value.length < 6) {
                showError('password-error', '密码长度不能少于6个字符');
                input.classList.add('error');
                return false;
            }
        }

        input.classList.remove('error');
        return true;
    }

    // 显示错误
    function showError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            // 清理消息中的HTML标签（XSS防护）
            const safeMessage = message.replace(/<[^>]*>/g, '');
            errorEl.textContent = safeMessage;
            errorEl.style.display = 'block';
        }
    }

    // 清除错误
    function clearErrors() {
        document.getElementById('email-error').style.display = 'none';
        document.getElementById('password-error').style.display = 'none';
        
        // 移除输入框错误样式
        document.getElementById('login-email').classList.remove('error');
        document.getElementById('login-password').classList.remove('error');
    }

    // 处理登录
    async function handleLogin() {
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const submitBtn = document.querySelector('.login-submit-btn');

        clearErrors();

        // 验证邮箱
        if (!email) {
            showError('email-error', '请输入邮箱');
            emailInput.focus();
            return;
        }

        if (!validateEmail(email)) {
            showError('email-error', '请输入有效的邮箱地址');
            emailInput.focus();
            return;
        }

        if (email.length > 100) {
            showError('email-error', '邮箱长度不能超过100个字符');
            emailInput.focus();
            return;
        }

        // 验证密码
        if (!password) {
            showError('password-error', '请输入密码');
            passwordInput.focus();
            return;
        }

        if (password.length < 6) {
            showError('password-error', '密码长度不能少于6个字符');
            passwordInput.focus();
            return;
        }

        if (password.length > 50) {
            showError('password-error', '密码长度不能超过50个字符');
            passwordInput.focus();
            return;
        }

        // 客户端限流检查：防止暴力破解
        const lockRemaining = getLoginLockRemaining();
        if (lockRemaining > 0) {
            const seconds = Math.ceil(lockRemaining / 1000);
            showError('password-error', `尝试过于频繁，请 ${seconds} 秒后再试`);
            return;
        }

        // 提交登录请求（Worker处理所有复杂逻辑）
        submitBtn.disabled = true;
        submitBtn.textContent = '登录中...';

        try {
            // 使用 RSA 公钥加密密码（防止明文传输）
            let encryptedPassword;
            try {
                encryptedPassword = await encryptPassword(password);
            } catch (e) {
                console.error('[Elixir登录] 密码加密失败:', e);
                showError('password-error', '加密失败，请刷新页面重试');
                return;
            }

            // 发送加密后的密码，Worker 用私钥解密后转发给目标服务器
            const response = await fetch(API_ENDPOINTS.LOGIN, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, encryptedPassword }),
                credentials: 'include',
                cache: 'no-cache'
            });

            const data = await response.json();

            if (data.status) {
                // 登录成功，重置限流状态
                resetLoginThrottle();

                // 登录成功
                alert('登录成功！');

                // 保存登录状态（带完整性校验）
                CookieManager.saveLoginStatus();

                document.getElementById('elixir-login-modal').classList.remove('show');

                // 立即发送一个测试请求以确保Cookie生效
                setTimeout(async () => {
                    try {
                        // 使用相对路径，Worker处理所有逻辑
                        const testResponse = await fetch(API_ENDPOINTS.GET_APKS, {
                            method: 'GET',
                            credentials: 'include',
                            cache: 'no-cache'
                        });

                        // 检查Cookie是否正确设置（浏览器会自动管理）
                        if (!testResponse.ok) {
                            console.error('[Elixir登录] Cookie验证失败');
                        }
                    } catch (e) {
                        console.error('[Elixir登录] 测试请求异常:', e);
                    }
                }, 1000);

                // 调用回调函数
                if (loginCallback) {
                    loginCallback();
                }
            } else {
                // 登录失败，记录失败尝试
                const lockDelay = recordFailedAttempt();
                if (lockDelay > 0) {
                    const seconds = Math.ceil(lockDelay / 1000);
                    showError('password-error', (data.reason || '登录失败') + `，请 ${seconds} 秒后再试`);
                } else {
                    const remaining = LOGIN_THROTTLE.maxAttempts - getLoginThrottleState().attempts;
                    if (remaining > 0 && remaining <= 2) {
                        showError('password-error', (data.reason || '登录失败') + `（剩余 ${remaining} 次尝试机会）`);
                    } else {
                        showError('password-error', data.reason || '登录失败');
                    }
                }
            }
        } catch (error) {
            console.error('[Elixir登录] 登录请求失败:', error);
            showError('password-error', '网络请求失败');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '登录';
        }
    }

    // 显示登录弹窗
    window.showLoginModal = function(callback) {
        loginCallback = callback;
        const modal = document.getElementById('elixir-login-modal');
        
        if (modal) {
            modal.classList.add('show');
            document.getElementById('login-email').focus();
        } else {
            // 如果弹窗还未加载，先加载再显示
            loadLoginModal().then(() => {
                const modalEl = document.getElementById('elixir-login-modal');
                if (modalEl) {
                    modalEl.classList.add('show');
                    document.getElementById('login-email').focus();
                }
            });
        }
    };

    // 初始化
    document.addEventListener('DOMContentLoaded', () => {
        loadLoginModal();
    });
})();