from django import template
from django.utils.safestring import mark_safe

from apps.panel.icons import svg

register = template.Library()


@register.simple_tag
def ic(name, size=18, cls=""):
    return mark_safe(svg(name, size, ("ic " + cls).strip()))
