from pathlib import Path

from pptx import Presentation

from app.models.template import (
    LayoutInfo,
    MasterInfo,
    PlaceholderInfo,
    TemplateManifest,
)

def _placeholder_type_str(ph_type) -> str:
    """Convert placeholder type enum to string."""
    if ph_type is None:
        return "UNKNOWN"
    # python-pptx enums have a .name property
    if hasattr(ph_type, "name") and ph_type.name:
        return ph_type.name
    return str(ph_type)


def _extract_theme_colors(prs: Presentation) -> dict[str, str]:
    """Extract theme colors from the first slide master's theme XML."""
    colors: dict[str, str] = {}
    try:
        theme_element = prs.slide_masters[0].element
        ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
        clr_schemes = theme_element.findall(".//a:clrScheme", ns)
        if not clr_schemes:
            return colors

        clr_scheme = clr_schemes[0]
        color_names = [
            "dk1", "dk2", "lt1", "lt2",
            "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
            "hlink", "folHlink",
        ]
        for name in color_names:
            elem = clr_scheme.find(f"a:{name}", ns)
            if elem is not None:
                # Color value can be in srgbClr or sysClr child
                srgb = elem.find("a:srgbClr", ns)
                if srgb is not None:
                    colors[name] = srgb.get("val", "")
                else:
                    sys_clr = elem.find("a:sysClr", ns)
                    if sys_clr is not None:
                        colors[name] = sys_clr.get("lastClr", sys_clr.get("val", ""))
    except Exception:
        pass
    return colors


def parse_template(file_path: str, template_id: str | None = None) -> TemplateManifest:
    """Parse a .pptx template and extract its structure as a manifest."""
    path = Path(file_path)
    prs = Presentation(str(path))

    if template_id is None:
        template_id = path.stem

    masters: list[MasterInfo] = []
    for master_idx, master in enumerate(prs.slide_masters):
        layouts: list[LayoutInfo] = []
        for layout_idx, layout in enumerate(master.slide_layouts):
            placeholders: list[PlaceholderInfo] = []
            for ph in layout.placeholders:
                placeholders.append(
                    PlaceholderInfo(
                        idx=ph.placeholder_format.idx,
                        name=ph.name,
                        type=_placeholder_type_str(ph.placeholder_format.type),
                        left=ph.left,
                        top=ph.top,
                        width=ph.width,
                        height=ph.height,
                    )
                )
            layouts.append(
                LayoutInfo(
                    index=layout_idx,
                    name=layout.name,
                    placeholders=placeholders,
                )
            )
        masters.append(
            MasterInfo(
                index=master_idx,
                name=f"Master {master_idx}",
                layouts=layouts,
            )
        )

    theme_colors = _extract_theme_colors(prs)

    return TemplateManifest(
        template_id=template_id,
        filename=path.name,
        slide_width_emu=prs.slide_width,
        slide_height_emu=prs.slide_height,
        theme_colors=theme_colors,
        masters=masters,
    )
