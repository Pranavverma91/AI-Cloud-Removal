import os
import uuid
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, HRFlowable,
)

SIGNAL = colors.HexColor("#0E9488")
NAVY = colors.HexColor("#0B1130")
TEXT = colors.HexColor("#1F2937")
MUTED = colors.HexColor("#6B7280")


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle(name="SEHeading", parent=ss["Heading1"], textColor=NAVY, fontSize=20, spaceAfter=4))
    ss.add(ParagraphStyle(name="SESub", parent=ss["Normal"], textColor=MUTED, fontSize=10, spaceAfter=14))
    ss.add(ParagraphStyle(name="SESection", parent=ss["Heading2"], textColor=NAVY, fontSize=13, spaceBefore=16, spaceAfter=8))
    ss.add(ParagraphStyle(name="SEBody", parent=ss["Normal"], textColor=TEXT, fontSize=10.5, leading=15))
    ss.add(ParagraphStyle(name="SEDisclaimer", parent=ss["Normal"], textColor=MUTED, fontSize=8.5, leading=12))
    return ss


def _stat_table(rows):
    data = [["Metric", "Value"]] + rows
    t = Table(data, colWidths=[80 * mm, 70 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    return t


TYPE_LABELS = {
    "agriculture": "Crop Health / Agriculture Analysis",
    "water": "Water Body Detection",
    "forest": "Forest & Vegetation Change Detection",
}


def build_report(analysis, output_folder):
    """
    analysis: dict with keys analysis_type, location_name, created_at,
    result (dict), original_image_url/path, result_image_url/path,
    secondary_image_path (forest only), is_demo
    Image paths passed in must be real filesystem paths (not URLs).
    """
    os.makedirs(output_folder, exist_ok=True)
    filename = f"spaceeye_report_{uuid.uuid4().hex[:10]}.pdf"
    path = os.path.join(output_folder, filename)

    ss = _styles()
    doc = SimpleDocTemplate(path, pagesize=A4, topMargin=22 * mm, bottomMargin=18 * mm,
                             leftMargin=18 * mm, rightMargin=18 * mm)
    story = []

    story.append(Paragraph("SPACE-EYE", ss["SEHeading"]))
    story.append(Paragraph("Satellite Imagery Analysis Report", ss["SESub"]))
    story.append(HRFlowable(width="100%", color=colors.HexColor("#E5E7EB"), thickness=1))
    story.append(Spacer(1, 10))

    meta_rows = [
        ["Analysis type", TYPE_LABELS.get(analysis["analysis_type"], analysis["analysis_type"])],
        ["Location", analysis.get("location_name") or "Not specified"],
        ["Date generated", datetime.now().strftime("%d %b %Y, %H:%M")],
        ["Data source", "Demonstration sample data" if analysis.get("is_demo") else "User-uploaded imagery"],
    ]
    story.append(_stat_table(meta_rows))
    story.append(Spacer(1, 16))

    result = analysis.get("result", {})
    story.append(Paragraph("Imagery", ss["SESection"]))

    img_row = []
    img_paths = [p for p in [
        analysis.get("original_image_path"),
        analysis.get("secondary_image_path"),
        analysis.get("result_image_path"),
    ] if p and os.path.exists(p)]

    for p in img_paths:
        try:
            img_row.append(Image(p, width=52 * mm, height=52 * mm))
        except Exception:
            pass
    if img_row:
        img_table = Table([img_row], colWidths=[54 * mm] * len(img_row))
        img_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
        story.append(img_table)
    story.append(Spacer(1, 14))

    story.append(Paragraph("Statistics", ss["SESection"]))
    if analysis["analysis_type"] == "agriculture":
        rows = [
            ["Healthy vegetation", f"{result.get('healthy_pct', '-')}%"],
            ["Moderate vegetation", f"{result.get('moderate_pct', '-')}%"],
            ["Stressed vegetation", f"{result.get('stressed_pct', '-')}%"],
            ["Estimated vegetation coverage", f"{result.get('vegetation_coverage_pct', '-')}%"],
        ]
        interpretation = result.get("recommendation", "")
    elif analysis["analysis_type"] == "water":
        rows = [
            ["Detected water coverage", f"{result.get('coverage_pct', '-')}%"],
            ["Total analyzed pixels", f"{result.get('total_pixels', '-')}"],
        ]
        interpretation = (
            f"Approximately {result.get('coverage_pct', '-')}% of the analyzed region was "
            "classified as water based on spectral thresholding."
        )
    else:  # forest
        rows = [
            ["Previous vegetation coverage", f"{result.get('veg_before_pct', '-')}%"],
            ["Current vegetation coverage", f"{result.get('veg_after_pct', '-')}%"],
            ["Vegetation change", f"{result.get('change_pct', '-')}%"],
            ["Classification", result.get("classification", "-")],
        ]
        interpretation = (
            f"Vegetation cover changed by {result.get('change_pct', '-')}% between the two "
            f"passes, classified as: {result.get('classification', '-')}."
        )

    story.append(_stat_table(rows))
    story.append(Spacer(1, 14))

    story.append(Paragraph("Interpretation", ss["SESection"]))
    story.append(Paragraph(interpretation, ss["SEBody"]))
    story.append(Spacer(1, 20))

    story.append(HRFlowable(width="100%", color=colors.HexColor("#E5E7EB"), thickness=1))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Disclaimer: SPACE-EYE is a student research project built for academic "
        "demonstration. Results are generated using simplified, RGB-based image-processing "
        "heuristics (not calibrated multispectral sensors or agronomic/hydrological models) "
        "and must not be used for real agricultural, hydrological, environmental, or "
        "commercial decision-making.",
        ss["SEDisclaimer"],
    ))

    doc.build(story)
    return path
