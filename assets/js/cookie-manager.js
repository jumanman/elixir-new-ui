(function() {
    'use strict';

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

        // 检查是否有认证Cookie
        hasAuthCookie: function() {
            try {
                const cookies = document.cookie.split(';');
                for (let i = 0; i < cookies.length; i++) {
                    let c = cookies[i];
                    while (c.charAt(0) === ' ') {
                        c = c.substring(1);
                    }
                    if (c.indexOf('AuthKey=') === 0) {
                        return true; // 找到AuthKey Cookie
                    }
                }
                return false;
            } catch (e) {
                console.error('[Elixir Cookie] 检查认证Cookie失败:', e);
                return false;
            }
        },

        // 获取认证Cookie
        getAuthCookie: function() {
            try {
                const cookies = document.cookie.split(';');
                for (let i = 0; i < cookies.length; i++) {
                    let c = cookies[i];
                    while (c.charAt(0) === ' ') {
                        c = c.substring(1);
                    }
                    if (c.indexOf('AuthKey=') === 0) {
                        return c.substring('AuthKey='.length);
                    }
                }
                return null;
            } catch (e) {
                console.error('[Elixir Cookie] 获取认证Cookie失败:', e);
                return null;
            }
        }
    };

    // 导出到全局作用域
    window.CookieManager = CookieManager;
})();