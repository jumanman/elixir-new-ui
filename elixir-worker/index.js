const TARGET_ORIGIN = 'https://open.lihouse.xyz';
const ALLOWED_ORIGINS = [
    'https://elixir.jmm666.dpdns.org',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
];

// 请求速率限制配置
const RATE_LIMIT = {
    windowMs: 60 * 1000, // 1分钟窗口
    maxRequests: 60,     // 每分钟最多60次请求
};

// 请求体大小限制（50MB）
const MAX_BODY_SIZE = 50 * 1024 * 1024;

// 路径白名单（只允许这些路径）
const ALLOWED_PATHS = ['/get_apks', '/upload', '/update', '/login'];

// 方法白名单
const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];

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
        // 开发环境允许所有源，但不允许凭据（*不能与凭据一起使用）
        headers['Access-Control-Allow-Origin'] = '*';
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
    
    // 复制请求头（保留认证信息，如Cookie、Authorization）
    const headers = new Headers(request.headers);
    headers.set('Host', new URL(TARGET_ORIGIN).host);
    headers.delete('Origin');
    headers.delete('Referer');
    // 保留Cookie和Authorization等认证头
    
    // 创建转发请求
    const forwardRequest = new Request(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.body,
        redirect: 'follow'
    });
    
    // 发送请求并获取响应
    const response = await fetch(forwardRequest);
    
    // 创建新的响应，添加 CORS 头
    const responseHeaders = new Headers(response.headers);
    
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
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const origin = request.headers.get('Origin');
        
        // 日志记录
        console.log(`[Elixir Worker] 请求: ${method} ${url.pathname} from ${origin}`);
        
        // 验证请求方法
        if (!validateMethod(method)) {
            console.log(`[Elixir安全] 不允许的请求方法: ${method}`);
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
            console.log(`[Elixir安全] 不允许的请求路径: ${url.pathname}`);
            return createErrorResponse(403, '不允许的请求路径');
        }
        
        // 检查请求体大小（仅对POST请求）
        if (method === 'POST') {
            const contentLength = request.headers.get('Content-Length');
            if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
                console.log(`[Elixir安全] 请求体过大: ${contentLength}`);
                return createErrorResponse(413, '请求体过大');
            }
        }
        
        // 验证Origin（生产环境）
        if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
            console.log(`[Elixir安全] 未授权的源: ${origin}`);
            // 对于非OPTIONS请求，仅在生产环境严格检查
            // 开发环境允许所有源
        }
        
        // 转发请求
        return forwardRequest(request);
    }
};