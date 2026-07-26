(function() {
    'use strict';

    // Cookie管理器
    const CookieManager = {
        // 存储Cookie
        setCookie: function(name, value, days = 30) {
            try {
                const date = new Date();
                date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
                const expires = "expires=" + date.toUTCString();
                document.cookie = name + "=" + value + ";" + expires + ";path=/;Secure;SameSite=Lax";
            } catch (e) {
                console.error('[Elixir Cookie] 设置Cookie失败:', e);
            }
        },

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

        // 从响应头设置Cookie
        setCookiesFromResponse: function(response) {
            try {
                const setCookieHeader = response.headers.get('Set-Cookie');
                if (setCookieHeader) {
                    
                    // 解析Set-Cookie头
                    const cookies = setCookieHeader.split(', ');
                    for (let cookie of cookies) {
                        // 处理可能的多个Set-Cookie头
                        const parts = cookie.split(';');
                        
                        // 健壮的Cookie解析：处理值中包含=的情况
                        const cookiePair = parts[0].trim();
                        const firstEqualIndex = cookiePair.indexOf('=');
                        
                        if (firstEqualIndex === -1) {
                            continue; // 跳过无效的Cookie
                        }
                        
                        const name = cookiePair.substring(0, firstEqualIndex).trim();
                        const value = cookiePair.substring(firstEqualIndex + 1).trim();
                        
                        // 验证Cookie名称不为空
                        if (!name) {
                            continue;
                        }
                        
                        // 提取过期时间
                        let expires = 30; // 默认30天
                        for (let part of parts) {
                            if (part.trim().startsWith('Max-Age=')) {
                                expires = parseInt(part.trim().substring(8));
                                if (isNaN(expires) || expires < 0) {
                                    expires = 30; // 无效值使用默认
                                }
                                break;
                            }
                        }
                        
                        this.setCookie(name, value, expires);
                    }
                }
            } catch (e) {
                console.error('[Elixir Cookie] 从响应头设置Cookie失败:', e);
            }
        },

        // 检查是否有认证Cookie
        hasAuthCookie: function() {
            const authKey = this.getCookie('AuthKey');
            return authKey !== null && authKey !== '';
        },

        // 获取认证Cookie
        getAuthCookie: function() {
            return this.getCookie('AuthKey');
        }
    };

    // 导出到全局作用域
    window.CookieManager = CookieManager;
})();