from .models import Page, SiteSettings


def site(request):
    try:
        s = SiteSettings.load()
        pages = list(Page.objects.filter(is_published=True, show_in_footer=True))
    except Exception:  # قبل از migrate
        s, pages = None, []
    return {"site": s, "footer_pages": pages}
