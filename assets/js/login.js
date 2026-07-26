(function() {
    'use strict';

    let loginCallback = null;

    const LOGIN_THROTTLE = {
        maxAttempts: 5,           
        windowMs: 5 * 60 * 1000,  
        baseDelayMs: 1000,        
        maxDelayMs: 30 * 1000     
    };

    function getLoginThrottleState() {
        try {
            const raw = sessionStorage.getItem('elixir_loginThrottle');
            if (!raw) return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
            const state = JSON.parse(raw);
            const now = Date.now();

            if (now - state.firstAttemptAt > LOGIN_THROTTLE.windowMs) {
                return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
            }

            if (state.lockedUntil && now > state.lockedUntil) {
                state.lockedUntil = 0;
            }
            return state;
        } catch (e) {
            return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
        }
    }

    function saveLoginThrottleState(state) {
        try {
            sessionStorage.setItem('elixir_loginThrottle', JSON.stringify(state));
        } catch (e) {

        }
    }

    function getLoginLockRemaining() {
        const state = getLoginThrottleState();
        if (state.lockedUntil) {
            const remaining = state.lockedUntil - Date.now();
            return remaining > 0 ? remaining : 0;
        }
        return 0;
    }

    function recordFailedAttempt() {
        const state = getLoginThrottleState();
        const now = Date.now();
        if (state.firstAttemptAt === 0) {
            state.firstAttemptAt = now;
        }
        state.attempts++;

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

    function resetLoginThrottle() {
        try {
            sessionStorage.removeItem('elixir_loginThrottle');
        } catch (e) {

        }
    }

    let cachedPublicKey = null;

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

        cachedPublicKey = await crypto.subtle.importKey(
            'jwk',
            data.publicKey,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false,
            ['encrypt']
        );
        return cachedPublicKey;
    }

    async function encryptPassword(password) {
        const publicKey = await getServerPublicKey();
        const encoder = new TextEncoder();
        const encrypted = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' },
            publicKey,
            encoder.encode(password)
        );

        const bytes = new Uint8Array(encrypted);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    async function loadLoginModal() {
        try {
            const response = await fetch('assets/html/login-modal.html', {
                cache: 'no-cache'
            });
            if (!response.ok) {
                throw new Error('加载失败');
            }
            const html = await response.text();

            const sanitizedHtml = sanitizeHtml(html);
            document.body.insertAdjacentHTML('beforeend', sanitizedHtml);
            initLoginModal();
        } catch (error) {
            console.error('[Elixir登录] 加载登录弹窗失败:', error);
        }
    }

    function sanitizeHtml(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            doc.querySelectorAll('script').forEach(el => el.remove());

            doc.querySelectorAll('*').forEach(el => {
                [...el.attributes].forEach(attr => {
                    const attrName = attr.name.toLowerCase();
                    const attrValue = attr.value.toLowerCase().trim();

                    if (attrName.startsWith('on')) {
                        el.removeAttribute(attr.name);
                    }

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

    function initLoginModal() {
        const modal = document.getElementById('elixir-login-modal');
        const overlay = document.getElementById('login-modal-overlay');
        const closeBtn = document.getElementById('login-modal-close');
        const form = document.getElementById('login-form');
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');

        function closeModal() {
            modal.classList.remove('show');

            emailInput.value = '';
            passwordInput.value = '';
            clearErrors();
        }

        overlay.addEventListener('click', closeModal);

        closeBtn.addEventListener('click', closeModal);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleLogin();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                closeModal();
            }
        });

        emailInput.addEventListener('input', () => {
            validateEmailInput(emailInput);
        });

        emailInput.addEventListener('blur', () => {
            validateEmailInput(emailInput, true);
        });

        passwordInput.addEventListener('input', () => {
            validatePasswordInput(passwordInput);
        });

        passwordInput.addEventListener('blur', () => {
            validatePasswordInput(passwordInput, true);
        });
    }

    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function validateEmailInput(input, showErrorOnEmpty = false) {
        const value = input.value.trim();
        const errorEl = document.getElementById('email-error');
        

        errorEl.style.display = 'none';

        if (value.length > 100) {
            showError('email-error', '邮箱长度不能超过100个字符');
            input.classList.add('error');
            return false;
        }

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

    function validatePasswordInput(input, showErrorOnEmpty = false) {
        const value = input.value;
        const errorEl = document.getElementById('password-error');
        

        errorEl.style.display = 'none';

        if (value.length > 50) {
            showError('password-error', '密码长度不能超过50个字符');
            input.classList.add('error');
            return false;
        }

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

    function showError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {

            const safeMessage = message.replace(/<[^>]*>/g, '');
            errorEl.textContent = safeMessage;
            errorEl.style.display = 'block';
        }
    }

    function clearErrors() {
        document.getElementById('email-error').style.display = 'none';
        document.getElementById('password-error').style.display = 'none';
        

        document.getElementById('login-email').classList.remove('error');
        document.getElementById('login-password').classList.remove('error');
    }

    async function handleLogin() {
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const submitBtn = document.querySelector('.login-submit-btn');

        clearErrors();

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

        const lockRemaining = getLoginLockRemaining();
        if (lockRemaining > 0) {
            const seconds = Math.ceil(lockRemaining / 1000);
            showError('password-error', `尝试过于频繁，请 ${seconds} 秒后再试`);
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '登录中...';

        try {

            let encryptedPassword;
            try {
                encryptedPassword = await encryptPassword(password);
            } catch (e) {
                console.error('[Elixir登录] 密码加密失败:', e);
                showError('password-error', '加密失败，请刷新页面重试');
                return;
            }

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

                resetLoginThrottle();

                alert('登录成功！');

                CookieManager.saveLoginStatus();

                document.getElementById('elixir-login-modal').classList.remove('show');

                setTimeout(async () => {
                    try {

                        const testResponse = await fetch(API_ENDPOINTS.GET_APKS, {
                            method: 'GET',
                            credentials: 'include',
                            cache: 'no-cache'
                        });

                        if (!testResponse.ok) {
                            console.error('[Elixir登录] Cookie验证失败');
                        }
                    } catch (e) {
                        console.error('[Elixir登录] 测试请求异常:', e);
                    }
                }, 1000);

                if (loginCallback) {
                    loginCallback();
                }
            } else {

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

    window.showLoginModal = function(callback) {
        loginCallback = callback;
        const modal = document.getElementById('elixir-login-modal');
        
        if (modal) {
            modal.classList.add('show');
            document.getElementById('login-email').focus();
        } else {

            loadLoginModal().then(() => {
                const modalEl = document.getElementById('elixir-login-modal');
                if (modalEl) {
                    modalEl.classList.add('show');
                    document.getElementById('login-email').focus();
                }
            });
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        loadLoginModal();
    });
})();