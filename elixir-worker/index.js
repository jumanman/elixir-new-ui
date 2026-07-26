const TARGET_ORIGIN = 'https://open.lihouse.xyz';
const ALLOWED_ORIGINS = [
    'https://elixir.jmm666.dpdns.org'
];

// 获取允许的CORS头（根据请求Origin动态设置）
function getCorsHeaders(origin) {
    const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Cookie, X-Requested-With',
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

// 处理 OPTIONS 预检请求
function handleOptions(request) {
    const origin = request.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin);
    
    return new Response(null, {
        headers: corsHeaders,
        status: 204
    });
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
        
        // 处理 OPTIONS 请求
        if (request.method === 'OPTIONS') {
            return handleOptions(request);
        }
        
        // 转发其他请求
        return forwardRequest(request);
    }
};