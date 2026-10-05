class FrameOptionsMiddleware:
    """فرم‌های عمومی (/f/...) باید در سایت‌های دیگر جاسازی (iframe) شوند؛ بقیه‌ی صفحات نه."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/f/"):
            response.headers.pop("X-Frame-Options", None)
        elif "X-Frame-Options" not in response.headers:
            response["X-Frame-Options"] = "SAMEORIGIN"
        return response
