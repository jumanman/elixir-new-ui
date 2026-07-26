(function() {
    'use strict';

    const INTEGRITY_SECRET = 'elixir_integrity_v1_';

    function computeChecksum(data) {
        const str = INTEGRITY_SECRET + data;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; 
        }
        return Math.abs(hash).toString(36);
    }

    function setSecureItem(key, value) {
        try {
            const checksum = computeChecksum(key + '|' + value);
            localStorage.setItem(key, value);
            localStorage.setItem(key + '_sig', checksum);
        } catch (e) {
            console.error('[Elixir Cookie] 安全存储失败:', e);
        }
    }

    function getSecureItem(key) {
        try {
            const value = localStorage.getItem(key);
            if (value === null) return null;
            const signature = localStorage.getItem(key + '_sig');
            const expectedChecksum = computeChecksum(key + '|' + value);

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

    function removeSecureItem(key) {
        try {
            localStorage.removeItem(key);
            localStorage.removeItem(key + '_sig');
        } catch (e) {
            console.error('[Elixir Cookie] 安全移除失败:', e);
        }
    }

    const CookieManager = {

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

        deleteCookie: function(name) {
            try {
                document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;Secure;SameSite=Lax";
            } catch (e) {
                console.error('[Elixir Cookie] 删除Cookie失败:', e);
            }
        },

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

        hasAuthCookie: function() {
            try {
                const loginStatus = getSecureItem('elixir_loginStatus');
                const loginTime = getSecureItem('elixir_loginTime');

                if (loginStatus === 'true' && loginTime) {
                    const parsedTime = parseInt(loginTime);

                    if (isNaN(parsedTime) || parsedTime < 0) {
                        removeSecureItem('elixir_loginStatus');
                        removeSecureItem('elixir_loginTime');
                        return false;
                    }
                    const now = Date.now();
                    const elapsed = now - parsedTime;
                    if (elapsed < 24 * 60 * 60 * 1000) { 
                        return true;
                    }

                    removeSecureItem('elixir_loginStatus');
                    removeSecureItem('elixir_loginTime');
                }
                return false;
            } catch (e) {
                console.error('[Elixir Cookie] 检查登录状态失败:', e);
                return false;
            }
        },

        saveLoginStatus: function() {
            try {
                setSecureItem('elixir_loginStatus', 'true');
                setSecureItem('elixir_loginTime', Date.now().toString());
            } catch (e) {
                console.error('[Elixir Cookie] 保存登录状态失败:', e);
            }
        },

        clearLoginStatus: function() {
            try {
                removeSecureItem('elixir_loginStatus');
                removeSecureItem('elixir_loginTime');
            } catch (e) {
                console.error('[Elixir Cookie] 清除登录状态失败:', e);
            }
        },

        getAuthCookie: function() {

            return null;
        },

        setSecureData: function(key, value) {
            setSecureItem(key, value);
        },

        getSecureData: function(key) {
            return getSecureItem(key);
        },

        removeSecureData: function(key) {
            removeSecureItem(key);
        }
    };

    window.CookieManager = CookieManager;
})();