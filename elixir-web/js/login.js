(function() {
    'use strict';

    let loginCallback = null;

    // 加载登录弹窗HTML
    async function loadLoginModal() {
        try {
            const response = await fetch('assets/html/login-modal.html');
            const html = await response.text();
            document.body.insertAdjacentHTML('beforeend', html);
            initLoginModal();
        } catch (error) {
            console.error('[Elixir登录] 加载登录弹窗失败:', error);
        }
    }

    // 初始化登录弹窗
    function initLoginModal() {
        const modal = document.getElementById('elixir-login-modal');
        const overlay = document.getElementById('login-modal-overlay');
        const closeBtn = document.getElementById('login-modal-close');
        const form = document.getElementById('login-form');

        // 关闭弹窗
        function closeModal() {
            modal.classList.remove('show');
            // 清空表单
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
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
    }

    // 验证邮箱格式
    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // 显示错误
    function showError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    // 清除错误
    function clearErrors() {
        document.getElementById('email-error').style.display = 'none';
        document.getElementById('password-error').style.display = 'none';
    }

    // 处理登录
    async function handleLogin() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const submitBtn = document.querySelector('.login-submit-btn');

        clearErrors();

        // 验证邮箱
        if (!email) {
            showError('email-error', '请输入邮箱');
            return;
        }

        if (!validateEmail(email)) {
            showError('email-error', '请输入有效的邮箱地址');
            return;
        }

        if (email.length > 100) {
            showError('email-error', '邮箱长度不能超过100个字符');
            return;
        }

        // 验证密码
        if (!password) {
            showError('password-error', '请输入密码');
            return;
        }

        if (password.length < 6) {
            showError('password-error', '密码长度不能少于6个字符');
            return;
        }

        if (password.length > 50) {
            showError('password-error', '密码长度不能超过50个字符');
            return;
        }

        // 提交登录请求
        submitBtn.disabled = true;
        submitBtn.textContent = '登录中...';

        try {
            const url = API_CONFIG.BASE_URL + API_ENDPOINTS.LOGIN;
            const response = await fetch(url, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
                credentials: 'include',
                cache: 'no-cache'
            });

            const data = await response.json();

            if (data.status) {
                // 登录成功
                alert('登录成功！');
                document.getElementById('elixir-login-modal').classList.remove('show');
                
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