(function() {
    'use strict';

    // 简单完整性签名密钥（注意：前端签名可被绕过，仅用于检测意外损坏和简单篡改；
    // 真正的安全验证仍依赖服务端 HttpOnly Cookie）
    const INTEGRITY_SECRET = 'elixir_integrity_v1_';

    // 计算简单校验和（用于检测数据损坏，非密码学安全）
    function computeChecksum(data) {
        const str = INTEGRITY_SECRET + data;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转为32位整数
        }
        return Math.abs(hash).toString(36);
    }

    // 安全存储带完整性校验的数据
    function setSecureItem(key, value) {
        try {
            const checksum = computeChecksum(key + '|' + value);
            localStorage.setItem(key, value);
            localStorage.setItem(key + '_sig', checksum);
        } catch (e) {
            console.error('[Elixir Cookie] 安全存储失败:', e);
        }
    }

    // 安全读取带完整性校验的数据
    function getSecureItem(key) {
        try {
            const value = localStorage.getItem(key);
            if (value === null) return null;
            const signature = localStorage.getItem(key + '_sig');
            const expectedChecksum = computeChecksum(key + '|' + value);
            // 校验数据完整性
            if (signature !== expectedChecksum) {
                console.error('[Elixir Cookie] 数据完整性校验失败，可能被篡改:', key);
                localStorage.removeItem(key);
                localStorage.removeItem(key + '_sig');
                return null;
            }
            return value;
        } catch (e) {
            console.error('[Elixir Cookie] 安全读取失败:', e);
            return null;
        }
    }

    // 安全移除数据及其签名
    function removeSecureItem(key) {
        try {
            localStorage.removeItem(key);
            localStorage.removeItem(key + '_sig');
        } catch (e) {
            console.error('[Elixir Cookie] 安全移除失败:', e);
        }
    }

    // Cookie管理器（主要依赖浏览器自动Cookie管理）
    const CookieManager = {
        // 获取Cookie
        getCookie: function(name) {
            try {
                const nameEQ = name + "=";
                const ca = document.cookie.split(';');
                for (let i = 0; i < ca.length; i++) {
                    let c = ca[i];
                    while (c.charAt(0) === ' ') {
                        c = c.substring(1, c.length);
                    }
                    if (c.indexOf(nameEQ) === 0) {
                        const value = c.substring(nameEQ.length, c.length);
                        return value;
                    }
                }
                return null;
            } catch (e) {
                console.error('[Elixir Cookie] 获取Cookie失败:', e);
                return null;
            }
        },

        // 删除Cookie
        deleteCookie: function(name) {
            try {
                document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;Secure;SameSite=Lax";
            } catch (e) {
                console.error('[Elixir Cookie] 删除Cookie失败:', e);
            }
        },

        // 获取所有Cookie
        getAllCookies: function() {
            try {
                const cookies = {};
                const ca = document.cookie.split(';');
                for (let i = 0; i < ca.length; i++) {
                    let c = ca[i];
                    while (c.charAt(0) === ' ') {
                        c = c.substring(1, c.length);
                    }
                    const eqPos = c.indexOf('=');
                    if (eqPos > 0) {
                        const name = c.substring(0, eqPos);
                        const value = c.substring(eqPos + 1, c.length);
                        cookies[name] = value;
                    }
                }
                return cookies;
            } catch (e) {
                console.error('[Elixir Cookie] 获取所有Cookies失败:', e);
                return {};
            }
        },

        // 检查是否已登录（使用带完整性校验的localStorage状态）
        // 注意：这只是UI状态提示，真正的认证依赖服务端 HttpOnly Cookie
        hasAuthCookie: function() {
            try {
                const loginStatus = getSecureItem('elixir_loginStatus');
                const loginTime = getSecureItem('elixir_loginTime');

                // 检查登录状态和有效期（24小时）
                if (loginStatus === 'true' && loginTime) {
                    const parsedTime = parseInt(loginTime);
                    // 验证时间戳格式（防止注入非法值）
                    if (isNaN(parsedTime) || parsedTime < 0) {
                        removeSecureItem('elixir_loginStatus');
                        removeSecureItem('elixir_loginTime');
                        return false;
                    }
                    const now = Date.now();
                    const elapsed = now - parsedTime;
                    if (elapsed < 24 * 60 * 60 * 1000) { // 24小时内
                        return true;
                    }
                    // 超过24小时，清除登录状态
                    removeSecureItem('elixir_loginStatus');
                    removeSecureItem('elixir_loginTime');
                }
                return false;
            } catch (e) {
                console.error('[Elixir Cookie] 检查登录状态失败:', e);
                return false;
            }
        },

        // 保存登录状态（带完整性校验）
        saveLoginStatus: function() {
            try {
                setSecureItem('elixir_loginStatus', 'true');
                setSecureItem('elixir_loginTime', Date.now().toString());
            } catch (e) {
                console.error('[Elixir Cookie] 保存登录状态失败:', e);
            }
        },

        // 清除登录状态
        clearLoginStatus: function() {
            try {
                removeSecureItem('elixir_loginStatus');
                removeSecureItem('elixir_loginTime');
            } catch (e) {
                console.error('[Elixir Cookie] 清除登录状态失败:', e);
            }
        },

        // 获取认证Cookie（HttpOnly Cookie，浏览器自动管理，JS无法读取）
        getAuthCookie: function() {
            // HttpOnly Cookie无法通过document.cookie读取，浏览器会自动在请求中携带
            return null;
        }
    };

    // 导出到全局作用域
    window.CookieManager = CookieManager;
})();