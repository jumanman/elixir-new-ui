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

// 响应大小限制（10MB）
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

// 路径白名单（只允许这些路径）
const ALLOWED_PATHS = ['/get_apks', '/upload', '/update', '/login'];

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
    
    // 如果请求来自允许的源，设置具体的Origin并允许凭据
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
    } else {
        // 对于不在白名单中的源，不允许凭据（安全考虑）
        headers['Access-Control-Allow-Origin'] = origin || '*';
        // 不设置 Access-Control-Allow-Credentials
    }
    
    return headers;
}

const PATH_MAP = {
    '/get_apks': '/web/elixir/get_apks',
    '/upload': '/web/elixir/upload',
    '/update': '/web/elixir/update',
    '/login': '/web/login'
};

// 创建错误响应
function createErrorResponse(status, message) {
    return new Response(JSON.stringify({ status: false, reason: message }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders('*')
        }
    });
}

// 处理 OPTIONS 预检请求
function handleOptions(request) {
    const origin = request.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin);
    
    return new Response(null, {
        headers: corsHeaders,
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

// 转发请求到目标服务器
async function forwardRequest(request) {
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
    
    const targetUrl = TARGET_ORIGIN + targetPath + url.search;
    
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
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
        return createErrorResponse(413, `响应过大 (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB)`);
    }
    
    // 创建新的响应，添加 CORS 头
    const responseHeaders = new Headers(response.headers);
    
    // 添加响应大小限制头
    responseHeaders.set('X-Max-Response-Size', MAX_RESPONSE_SIZE.toString());
    
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
                if (totalBytes > MAX_RESPONSE_SIZE) {
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
            
            // 返回限制大小的响应
            return new Response(body, {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders
            });
        } catch (e) {
            return createErrorResponse(413, '响应过大');
        }
    }
    
    // 处理 Cookie：重写Set-Cookie头以支持跨域存储（保留安全属性）
    const setCookieHeader = response.headers.get('Set-Cookie');
    if (setCookieHeader) {
        // 重写Cookie：只移除Domain（跨域不匹配），保留HttpOnly/Secure/SameSite等安全属性
        let rewrittenCookie = setCookieHeader
            .replace(/Domain=[^;]+;/gi, '')           // 移除Domain属性（跨域不匹配）
            .replace(/Domain=[^;]+$/gi, '')          // 移除末尾的Domain
            .replace(/\s*;\s*/g, '; ')               // 清理多余分号
            .replace(/;\s*$/g, '');                  // 移除末尾分号
        
        responseHeaders.set('Set-Cookie', rewrittenCookie);
    }
    
    // 添加 CORS 头
    const origin = request.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin);
    
    Object.keys(corsHeaders).forEach(key => {
        responseHeaders.set(key, corsHeaders[key]);
    });
    
    // 添加安全响应头
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('X-Frame-Options', 'DENY');
    responseHeaders.set('X-XSS-Protection', '1; mode=block');
    responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // 移除可能导致问题的头
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('X-Content-Security-Policy');
    
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
                const response = new Response(JSON.stringify({ 
                    status: false, 
                    reason: '请求过于频繁，请稍后再试',
                    retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
                }), {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
                        ...getCorsHeaders(origin)
                    }
                });
                return response;
            }
        }
        
        // 验证请求方法
        if (!validateMethod(method)) {
            return createErrorResponse(405, '不允许的请求方法');
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
            return createErrorResponse(403, '不允许的请求路径');
        }
        
        // 检查请求体大小（仅对POST请求）
        if (method === 'POST') {
            const contentLength = request.headers.get('Content-Length');
            if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
                return createErrorResponse(413, '请求体过大');
            }
        }
        
        // 验证Origin（仅在Origin存在且不在白名单时拒绝，同源请求浏览器不发送Origin头）
        if (origin && !ALLOWED_ORIGINS.includes(origin)) {
            return createErrorResponse(403, '未授权的访问源');
        }
        
        // 转发请求
        return forwardRequest(request);
    }
};