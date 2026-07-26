const TARGET_ORIGIN = 'https://open.lihouse.xyz';
const ALLOWED_ORIGINS = [
    'https://elixir.jmm666.dpdns.org'
];

// KV存储绑定（通过wrangler.toml配置）
let RATE_LIMIT_KV = null;

// 请求速率限制配置
const RATE_LIMIT = {
    windowMs: 60 * 1000, // 1分钟窗口
    maxRequests: 60,     // 每分钟最多60次请求
    keyPrefix: 'rate_limit_' // KV键前缀
};

// 请求体大小限制（50MB）
const MAX_BODY_SIZE = 50 * 1024 * 1024;

// 响应大小限制（10MB - API响应）
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

// 下载响应大小限制（100MB - APK文件可能较大）
const MAX_DOWNLOAD_RESPONSE_SIZE = 100 * 1024 * 1024;

// 路径白名单（只允许这些路径）
const ALLOWED_PATHS = ['/get_apks', '/upload', '/update', '/login', '/download'];

// 允许下载的文件扩展名（防止通过下载端点代理任意文件）
const ALLOWED_DOWNLOAD_EXTENSIONS = ['.apk'];

// 方法白名单
const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];

// 基于KV的速率限制检查
async function checkRateLimit(clientIP, env) {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT.windowMs;
    const key = `${RATE_LIMIT.keyPrefix}${clientIP}`;
    
    try {
        // 获取现有的速率限制数据
        const existingData = await RATE_LIMIT_KV.get(key);
        
        let clientData;
        if (existingData) {
            clientData = JSON.parse(existingData);
            
            // 清理过期的请求记录
            clientData.requests = clientData.requests.filter(timestamp => timestamp > windowStart);
        } else {
            clientData = { requests: [] };
        }
        
        // 检查是否超过限制
        if (clientData.requests.length >= RATE_LIMIT.maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetAt: clientData.requests[0] + RATE_LIMIT.windowMs
            };
        }
        
        // 记录新请求
        clientData.requests.push(now);
        
        // 保存到KV（设置1小时过期）
        await RATE_LIMIT_KV.put(key, JSON.stringify(clientData), {
            expirationTtl: 3600 // 1小时过期
        });
        
        return {
            allowed: true,
            remaining: RATE_LIMIT.maxRequests - clientData.requests.length,
            resetAt: now + RATE_LIMIT.windowMs
        };
    } catch (error) {
        // KV访问失败时的降级策略：允许请求但记录错误
        console.error('[Elixir Worker] KV访问失败，使用降级策略:', error);
        return {
            allowed: true,
            remaining: RATE_LIMIT.maxRequests,
            resetAt: now + RATE_LIMIT.windowMs,
            fallback: true
        };
    }
}

// 获取允许的CORS头（根据请求Origin动态设置）
function getCorsHeaders(origin) {
    const headers = {
        'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Cookie, X-Requested-With, X-Client-Version',
        'Access-Control-Max-Age': '86400'
    };

    // 仅允许白名单中的源访问并携带凭据
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
        headers['Vary'] = 'Origin';
    }
    // 非白名单源不设置 Access-Control-Allow-Origin，浏览器将阻止跨域读取

    return headers;
}

const PATH_MAP = {
    '/get_apks': '/web/elixir/get_apks',
    '/upload': '/web/elixir/upload',
    '/update': '/web/elixir/update',
    '/login': '/web/login'
};

// 创建错误响应（传入请求Origin以便正确设置CORS头）
function createErrorResponse(status, message, origin) {
    const headers = new Headers({
        'Content-Type': 'application/json'
    });
    const corsHeaders = getCorsHeaders(origin);
    Object.keys(corsHeaders).forEach(key => {
        headers.set(key, corsHeaders[key]);
    });
    applySecurityHeaders(headers);
    return new Response(JSON.stringify({ status: false, reason: message }), {
        status,
        headers
    });
}

// 处理 OPTIONS 预检请求
function handleOptions(request) {
    const origin = request.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin);
    const headers = new Headers(corsHeaders);
    applySecurityHeaders(headers);

    return new Response(null, {
        headers,
        status: 204
    });
}

// 验证请求路径
function validatePath(path) {
    // 检查是否在白名单中
    if (!ALLOWED_PATHS.includes(path)) {
        return false;
    }
    // 检查是否包含恶意字符
    if (/\.{2}/.test(path)) {
        return false;
    }
    return true;
}

// 验证请求方法
function validateMethod(method) {
    return ALLOWED_METHODS.includes(method);
}

// 添加安全响应头（CSP/HSTS/XSS防护等纵深防御）
function applySecurityHeaders(headers) {
    // 防止 MIME 类型嗅探
    headers.set('X-Content-Type-Options', 'nosniff');
    // 禁止页面被嵌入 iframe（防止点击劫持）
    headers.set('X-Frame-Options', 'DENY');
    // 启用浏览器 XSS 过滤器（旧版浏览器兼容）
    headers.set('X-XSS-Protection', '1; mode=block');
    // 控制 Referrer 信息泄露
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // 强制 HTTPS（1年，包含子域名）
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    // 内容安全策略：限制资源加载来源，防止 XSS 和数据注入
    // - default-src 'self'：默认只允许同源资源
    // - script-src 'self'：脚本只能来自同源
    // - style-src 'self' 'unsafe-inline'：样式允许同源和内联（现有样式需要）
    // - img-src 'self' data:：图片允许同源和 data URI
    // - connect-src 'self'：AJAX/fetch 只能连接同源
    // - font-src 'self'：字体只能来自同源
    // - object-src 'none'：禁止 <object>/<embed>
    // - frame-ancestors 'none'：禁止被嵌入（等价于 X-Frame-Options: DENY）
    // - base-uri 'self'：限制 <base> 标签
    // - form-action 'self'：限制表单提交目标
    headers.set('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "font-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; '));
}

// 转发请求到目标服务器
async function forwardRequest(request, origin) {
    const url = new URL(request.url);

    // 构建目标 URL：去掉 /api 前缀
    let targetPath = url.pathname;
    if (targetPath.startsWith('/api')) {
        targetPath = targetPath.slice(4);
    }

    // 路径映射：简化路径转原始路径
    if (PATH_MAP[targetPath]) {
        targetPath = PATH_MAP[targetPath];
    }

    // 下载端点特殊处理：通过 path 查询参数指定目标文件路径
    if (targetPath === '/download') {
        const filePath = url.searchParams.get('path');
        if (!filePath) {
            return createErrorResponse(400, '缺少文件路径参数', origin);
        }
        // 安全校验：防止路径遍历
        if (/\.{2}/.test(filePath) || filePath.includes('\0')) {
            return createErrorResponse(403, '非法文件路径', origin);
        }
        // 校验文件扩展名
        const lowerPath = filePath.toLowerCase();
        if (!ALLOWED_DOWNLOAD_EXTENSIONS.some(ext => lowerPath.endsWith(ext))) {
            return createErrorResponse(403, '不允许的文件类型', origin);
        }
        // 确保路径以 / 开头
        const safePath = filePath.startsWith('/') ? filePath : '/' + filePath;
        const targetUrl = TARGET_ORIGIN + safePath;

        // 下载请求复用通用转发逻辑（使用更大的响应大小限制）
        return await proxyToTarget(request, targetUrl, origin, MAX_DOWNLOAD_RESPONSE_SIZE);
    }

    const targetUrl = TARGET_ORIGIN + targetPath + url.search;

    return await proxyToTarget(request, targetUrl, origin, MAX_RESPONSE_SIZE);
}

// 通用代理到目标服务器（提取公共逻辑）
async function proxyToTarget(request, targetUrl, origin, maxResponseSize) {

    // 复制请求头（保留用户真实的浏览器标识）
    const headers = new Headers(request.headers);

    // 伪装关键请求头，让服务器认为是同源请求
    headers.set('Host', new URL(TARGET_ORIGIN).host);
    headers.set('Origin', TARGET_ORIGIN);
    headers.set('Referer', TARGET_ORIGIN + '/');
    headers.set('Sec-Fetch-Site', 'same-origin');

    // 删除可能暴露跨域的头
    headers.delete('CF-Connecting-IP');
    headers.delete('X-Forwarded-For');

    // 创建转发请求
    const forwardRequest = new Request(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.body,
        redirect: 'follow'
    });

    // 发送请求并获取响应
    const response = await fetch(forwardRequest);

    // 检查响应大小
    const contentLength = response.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > maxResponseSize) {
        return createErrorResponse(413, `响应过大 (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB)`, origin);
    }

    // 创建新的响应，添加 CORS 头
    const responseHeaders = new Headers(response.headers);

    // 添加响应大小限制头
    responseHeaders.set('X-Max-Response-Size', maxResponseSize.toString());

    // 如果响应没有Content-Length，我们需要流式读取并限制大小
    if (!contentLength) {
        let totalBytes = 0;
        const reader = response.body.getReader();
        const chunks = [];

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                totalBytes += value.length;
                if (totalBytes > maxResponseSize) {
                    throw new Error('响应过大');
                }
                chunks.push(value);
            }

            // 创建新的响应体
            const body = new Uint8Array(totalBytes);
            let offset = 0;
            for (const chunk of chunks) {
                body.set(chunk, offset);
                offset += chunk.length;
            }

            // 添加 CORS 头和安全响应头到流式响应
            const corsHeaders = getCorsHeaders(origin);
            Object.keys(corsHeaders).forEach(key => {
                responseHeaders.set(key, corsHeaders[key]);
            });
            applySecurityHeaders(responseHeaders);

            // 返回限制大小的响应
            return new Response(body, {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders
            });
        } catch (e) {
            return createErrorResponse(413, '响应过大', origin);
        }
    }

    // 处理 Set-Cookie：获取所有 Cookie（支持多个 Set-Cookie 头）
    // 优先使用标准 getSetCookie()，回退到非标准 getAll()，最后回退到 get()
    let setCookies = [];
    if (typeof response.headers.getSetCookie === 'function') {
        // 标准 API（现代运行时支持）
        setCookies = response.headers.getSetCookie();
    } else if (typeof response.headers.getAll === 'function') {
        // 非标准 API（Cloudflare Workers 支持）
        setCookies = response.headers.getAll('Set-Cookie');
    }

    if (setCookies.length > 0) {
        responseHeaders.delete('Set-Cookie');
        setCookies.forEach(cookie => {
            // 仅移除 Domain 属性（跨域不匹配），保留其他所有安全属性
            // 使用大小写不敏感匹配，处理 Domain 出现在中间或末尾的情况
            const rewritten = cookie
                .replace(/\s*;\s*Domain=[^;]+/gi, '')   // 移除中间或末尾的 Domain=...
                .replace(/^\s*Domain=[^;]+;?\s*/i, '')   // 移除开头的 Domain=...
                .trim();
            if (rewritten) {
                responseHeaders.append('Set-Cookie', rewritten);
            }
        });
    } else {
        // 最终回退：get() 仅返回第一个 Set-Cookie
        const singleCookie = response.headers.get('Set-Cookie');
        if (singleCookie) {
            const rewritten = singleCookie
                .replace(/\s*;\s*Domain=[^;]+/gi, '')
                .replace(/^\s*Domain=[^;]+;?\s*/i, '')
                .trim();
            responseHeaders.set('Set-Cookie', rewritten);
        }
    }

    // 添加 CORS 头
    const corsHeaders = getCorsHeaders(origin);

    Object.keys(corsHeaders).forEach(key => {
        responseHeaders.set(key, corsHeaders[key]);
    });

    // 添加安全响应头（纵深防御）
    applySecurityHeaders(responseHeaders);

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
    });
}

// Worker 入口
export default {
    async fetch(request, env, ctx) {
        // 初始化KV绑定
        if (env && env.RATE_LIMIT_KV) {
            RATE_LIMIT_KV = env.RATE_LIMIT_KV;
        }
        
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const origin = request.headers.get('Origin');
        
        // 获取客户端IP（从CF-Connecting-IP头部或直接获取）
        const clientIP = request.headers.get('CF-Connecting-IP') || 
                        request.headers.get('X-Forwarded-For') || 
                        'unknown';
        
        // 速率限制检查（跳过OPTIONS请求）
        if (method !== 'OPTIONS' && RATE_LIMIT_KV) {
            const rateLimit = await checkRateLimit(clientIP, env);
            if (!rateLimit.allowed) {
                const rateLimitHeaders = new Headers({
                    'Content-Type': 'application/json',
                    'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString()
                });
                const corsHeaders = getCorsHeaders(origin);
                Object.keys(corsHeaders).forEach(key => {
                    rateLimitHeaders.set(key, corsHeaders[key]);
                });
                applySecurityHeaders(rateLimitHeaders);
                return new Response(JSON.stringify({
                    status: false,
                    reason: '请求过于频繁，请稍后再试',
                    retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
                }), {
                    status: 429,
                    headers: rateLimitHeaders
                });
            }
        }
        
        // 验证请求方法
        if (!validateMethod(method)) {
            return createErrorResponse(405, '不允许的请求方法', origin);
        }

        // 处理 OPTIONS 请求
        if (method === 'OPTIONS') {
            return handleOptions(request);
        }

        // 构建目标路径用于验证
        let targetPath = url.pathname;
        if (targetPath.startsWith('/api')) {
            targetPath = targetPath.slice(4);
        }

        // 验证请求路径
        if (!validatePath(targetPath)) {
            return createErrorResponse(403, '不允许的请求路径', origin);
        }

        // 检查请求体大小（仅对POST请求）
        if (method === 'POST') {
            const contentLength = request.headers.get('Content-Length');
            if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
                return createErrorResponse(413, '请求体过大', origin);
            }
        }

        // 验证Origin（仅在Origin存在且不在白名单时拒绝，同源请求浏览器不发送Origin头）
        if (origin && !ALLOWED_ORIGINS.includes(origin)) {
            return createErrorResponse(403, '未授权的访问源', origin);
        }

        // 转发请求
        return forwardRequest(request, origin);
    }
};