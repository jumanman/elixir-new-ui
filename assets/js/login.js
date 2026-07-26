(function() {
    'use strict';

    let loginCallback = null;

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

    // HTML清理（XSS防护）
    function sanitizeHtml(html) {
        return html.replace(/<script[^>]*>.*?<\/script>/gi, '')
                   .replace(/on\w+\s*=\s*["'].*?["']/gi, '')
                   .replace(/javascript:/gi, 'javascript:');
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

        // 提交登录请求
        submitBtn.disabled = true;
        submitBtn.textContent = '登录中...';

        try {
            const url = API_CONFIG.BASE_URL + API_ENDPOINTS.LOGIN;
            
            // 安全检查：确保URL是合法的
            if (!url.startsWith('https://')) {
                throw new Error('不安全的请求协议');
            }

            // 使用浏览器原生请求头，只添加必要的Content-Type
            const response = await fetch(url, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password }),
                credentials: 'include',
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            const data = await response.json();

            if (data.status) {
                // 登录成功
                alert('登录成功！');
                
                // 保存登录状态到localStorage
                try {
                    localStorage.setItem('elixir_loginStatus', 'true');
                    localStorage.setItem('elixir_loginTime', Date.now().toString());
                } catch (e) {
                    console.error('[Elixir登录] 保存登录状态失败:', e);
                }
                
                document.getElementById('elixir-login-modal').classList.remove('show');
                
                // 立即发送一个测试请求以确保Cookie生效
                setTimeout(async () => {
                    try {
                        const testUrl = API_CONFIG.BASE_URL + API_ENDPOINTS.GET_APKS;
                        
                        // 使用浏览器原生请求头
                        const testResponse = await fetch(testUrl, {
                            method: 'GET',
                            mode: 'cors',
                            credentials: 'include',
                            cache: 'no-cache'
                        });

                        // 从响应头中存储Cookie
                        if (testResponse.headers.has('Set-Cookie')) {
                            CookieManager.setCookiesFromResponse(testResponse);
                        }
                        
                        if (testResponse.ok) {
                            const testData = await testResponse.json();
                        } else {
                            console.error('[Elixir登录] 测试请求失败:', testResponse.statusText);
                        }
                    } catch (e) {
                        console.error('[Elixir登录] Cookie验证失败:', e);
                    }
                }, 500);
                
                // 调用回调函数
                if (loginCallback) {
                    loginCallback();
                }
            } else {
                showError('password-error', data.reason || '登录失败');
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