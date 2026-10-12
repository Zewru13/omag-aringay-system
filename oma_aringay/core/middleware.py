"""Response headers for the API.

Every /api/ answer can carry personal data and is JSON or a file download, never a page, so it is told to be kept out
of caches and never to be framed, scripted or sniffed. (The website's own pages get their headers from wherever the
front end is hosted - see docs/security-deployment.md.)"""

API_HEADERS = {
    # No browser or shared proxy may keep a copy of personal data.
    'Cache-Control': 'no-store, private',
    # An API answer is never a page: nothing may load from it, and it may not be framed.
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    # The API never needs these browser features.
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith('/api/'):
            for name, value in API_HEADERS.items():
                response[name] = value
        return response
