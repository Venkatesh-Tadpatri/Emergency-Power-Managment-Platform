"""Renders a Report row (see app/models/report.py) as a downloadable PDF — one layout for a
Generator Run Report (type == "gen-run"), another for an ATS Transfer Report (type in
("ats-emergency", "test")). Built with reportlab (pure Python, no system-level dependencies), matching
the two reference designs' composition: a CPC header bar, a row of colored stat tiles, then either a
power-output trend chart + telemetry log table, or a per-ATS transfer detail card list.
"""
from datetime import date
from io import BytesIO
import base64

from reportlab.graphics.shapes import Drawing, Line, PolyLine, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

NAVY = colors.HexColor("#0f1f33")
RED = colors.HexColor("#dc2626")
BORDER = colors.HexColor("#e2e8f0")
TEXT_DIM = colors.HexColor("#64748b")
TEXT_MUTED = colors.HexColor("#94a3b8")
BLUE = colors.HexColor("#2563eb")
AMBER = colors.HexColor("#f59e0b")
ORANGE = colors.HexColor("#f97316")
SLATE = colors.HexColor("#64748b")

BRANCH_COLORS = {"life-safety": AMBER, "critical": ORANGE, "equipment": SLATE}
BRANCH_LABELS = {"life-safety": "LIFE SAFETY", "critical": "CRITICAL", "equipment": "EQUIPMENT"}

_styles = {
    "label": ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=7, textColor=TEXT_MUTED, leading=9),
    "value": ParagraphStyle("value", fontName="Helvetica-Bold", fontSize=11, textColor=colors.HexColor("#0f172a"), leading=13),
    "tileLabelDark": ParagraphStyle("tileLabelDark", fontName="Helvetica-Bold", fontSize=8, textColor=colors.HexColor("#cbd5e1"), leading=10),
    "tileValueDark": ParagraphStyle("tileValueDark", fontName="Helvetica-Bold", fontSize=22, textColor=colors.white, leading=25, spaceAfter=2),
    "sectionTitle": ParagraphStyle("sectionTitle", fontName="Helvetica-Bold", fontSize=8, textColor=TEXT_DIM, leading=11, spaceBefore=10, spaceAfter=6),
    "footer": ParagraphStyle("footer", fontName="Helvetica", fontSize=7, leading=9, textColor=TEXT_MUTED),
    "footerRight": ParagraphStyle("footerRight", fontName="Helvetica", fontSize=7, leading=9, textColor=TEXT_MUTED, alignment=TA_RIGHT),
}


class _ReportLogo(Flowable):
    """Wide, zoomed PDF logo box matching the report preview."""
    width = 1.15 * inch
    height = 0.55 * inch

    def __init__(self, image_bytes: bytes):
        super().__init__()
        # Flowable.__init__ initializes these to zero, so set the actual
        # dimensions on the instance rather than relying on class defaults.
        self.width = 1.15 * inch
        self.height = 0.55 * inch
        self.reader = ImageReader(BytesIO(image_bytes))
        self.image_width, self.image_height = self.reader.getSize()

    def wrap(self, avail_width, avail_height):
        return self.width, self.height

    def draw(self):
        canvas = self.canv
        canvas.saveState()
        canvas.setFillColor(colors.white)
        canvas.roundRect(0, 0, self.width, self.height, 4, fill=1, stroke=0)
        path = canvas.beginPath()
        path.rect(0, 0, self.width, self.height)
        canvas.clipPath(path, stroke=0, fill=0)
        aspect = self.image_width / self.image_height
        if aspect >= self.width / self.height:
            draw_width, draw_height = self.width, self.width / aspect
        else:
            draw_height, draw_width = self.height, self.height * aspect
        draw_width *= 2.4
        draw_height *= 2.4
        canvas.drawImage(self.reader, (self.width - draw_width) / 2, (self.height - draw_height) / 2,
                         width=draw_width, height=draw_height, preserveAspectRatio=True, mask="auto")
        canvas.restoreState()


def _header(title: str, subtitle: str, date_label_top: str, date_value: date | None, logo_data: str | None = None, show_command_name: bool = False):
    # leading (the line-box height) defaults to a fixed 12pt in reportlab regardless of font size —
    # left at that default, the 15pt title's own glyphs are taller than the box reportlab reserves for
    # them, so the very next line (the subtitle) starts overlapping into it. Every style here gets an
    # explicit leading sized to its own font, plus a little spaceAfter on the title for a clean gap.
    logo = Paragraph("<b>CPC</b>", ParagraphStyle("logo", fontName="Helvetica-Bold", fontSize=13, leading=15, textColor=colors.white))
    if logo_data and "," in logo_data:
        try:
            logo = _ReportLogo(base64.b64decode(logo_data.split(",", 1)[1]))
        except Exception:
            pass
    title_block = ([
        Paragraph("CPC · CRITICAL POWER COMMAND", ParagraphStyle("commandTitle", fontName="Helvetica-Bold", fontSize=10, leading=12, spaceAfter=3, textColor=colors.white, alignment=TA_CENTER)),
    ] if show_command_name else []) + [
        Paragraph(title, ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=15, leading=18, spaceAfter=4, textColor=colors.white, alignment=TA_CENTER)),
        Paragraph(subtitle, ParagraphStyle("subtitle", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#93c5fd"), alignment=TA_CENTER)),
    ]
    date_block = [
        Paragraph(date_label_top, ParagraphStyle("dateLabel", fontName="Helvetica", fontSize=6.5, leading=9, spaceAfter=2, textColor=colors.HexColor("#94a3b8"), alignment=TA_RIGHT)),
        Paragraph(date_value.isoformat() if date_value else "—", ParagraphStyle("dateVal", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=colors.white, alignment=TA_RIGHT)),
    ]
    table = Table([[logo, title_block, date_block]], colWidths=[1.25 * inch, 4.45 * inch, 1.3 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING", (0, 0), (0, 0), 14),
        ("RIGHTPADDING", (2, 0), (2, 0), 14),
        ("LINEBELOW", (0, 0), (-1, -1), 3, RED),
    ]))
    return table


def _info_strip(cells: list[tuple[str, str]]):
    table = Table([[Table([[Paragraph(label, _styles["label"])], [Paragraph(value or "—", _styles["value"])]]) for label, value in cells]],
                   colWidths=[7.0 * inch / len(cells)] * len(cells))
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.75, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return table


def _stat_tiles(tiles: list[tuple[str, str, colors.Color]]):
    # A fixed height on every tile's own inner table, wide enough for the value to wrap onto two lines
    # — rather than letting each tile size itself to its own content — is what actually guarantees they
    # all come out the same size; a long value like an ATS name wrapping to a second line was otherwise
    # the one tile in the row taller than its three neighbors.
    VALUE_H, LABEL_H = 34, 18
    cells = []
    for label, value, bg in tiles:
        dark = bg != colors.white
        label_style = _styles["tileLabelDark"] if dark else ParagraphStyle("tl", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=TEXT_MUTED)
        value_style = _styles["tileValueDark"] if dark else ParagraphStyle("tv", fontName="Helvetica-Bold", fontSize=16, leading=18, textColor=colors.HexColor("#0f172a"))
        inner = Table([[Paragraph(value, value_style)], [Paragraph(label, label_style)]], rowHeights=[VALUE_H, LABEL_H])
        inner.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("VALIGN", (0, 0), (-1, 0), "BOTTOM"),
            ("VALIGN", (0, 1), (-1, 1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, 0), 4),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
            ("TOPPADDING", (0, 1), (-1, 1), 2),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("BOX", (0, 0), (-1, -1), 0.75, BORDER if not dark else bg),
        ]))
        cells.append(inner)
    row = Table([cells], colWidths=[7.0 * inch / len(cells)] * len(cells), spaceBefore=10, spaceAfter=10)
    row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
    return row


def _line_chart(samples: list[dict], rated_kw: float):
    width, height = 460, 140
    pad_left, pad_bottom, pad_top, pad_right = 34, 18, 10, 10
    plot_w = width - pad_left - pad_right
    plot_h = height - pad_top - pad_bottom
    d = Drawing(width, height)
    max_kw = max((s.get("kw") or 0 for s in samples), default=1) or 1
    scale = max_kw * 1.15

    # Axis lines + gridlines with kW labels.
    for i in range(5):
        y = pad_bottom + plot_h * i / 4
        val = round(scale * i / 4)
        d.add(Line(pad_left, y, width - pad_right, y, strokeColor=colors.HexColor("#f1f5f9"), strokeWidth=0.75))
        d.add(String(pad_left - 6, y - 3, str(val), fontSize=6, fillColor=TEXT_MUTED, textAnchor="end"))
    d.add(Line(pad_left, pad_bottom, width - pad_right, pad_bottom, strokeColor=BORDER, strokeWidth=1))

    n = max(1, len(samples) - 1)
    points = []
    for i, s in enumerate(samples):
        x = pad_left + plot_w * i / n
        y = pad_bottom + plot_h * min(1, (s.get("kw") or 0) / scale)
        points.extend([x, y])
        if i % max(1, len(samples) // 6) == 0 or i == len(samples) - 1:
            d.add(String(x, pad_bottom - 10, s.get("time", ""), fontSize=6, fillColor=TEXT_MUTED, textAnchor="middle"))
    if len(samples) > 1:
        d.add(PolyLine(points, strokeColor=RED, strokeWidth=1.6))

    # 30% load reference line (dashed amber), matching the reference design.
    ref_y = pad_bottom + plot_h * min(1, (rated_kw * 0.3) / scale)
    ref_line = Line(pad_left, ref_y, width - pad_right, ref_y, strokeColor=AMBER, strokeWidth=1)
    ref_line.strokeDashArray = [4, 3]
    d.add(ref_line)
    d.add(String(width - pad_right, ref_y + 3, "30% Load", fontSize=6, fillColor=AMBER, textAnchor="end"))
    return d


def _footer(company_system: str, code: str):
    row = Table([[Paragraph(f"Generated by CPC · {company_system}", _styles["footer"]),
                  Paragraph(f"{code} · Page 1 of 1", _styles["footerRight"])]], colWidths=[4.5 * inch, 2.5 * inch])
    row.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 10), ("LINEABOVE", (0, 0), (-1, -1), 0.75, BORDER)]))
    return row


def build_generator_run_pdf(report, system_name: str, company_name: str, logo_data: str | None = None) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0, bottomMargin=0.4 * inch, leftMargin=0.6 * inch, rightMargin=0.6 * inch)
    story = [
        _header("Generator Run Report", f"{system_name} — {report.initiating_ats or 'GEN'}", "RUN DATE", report.report_date, logo_data),
        Spacer(1, 12),
        _info_strip([
            ("MAKE", report.make), ("MODEL", report.model), ("SERIAL NUMBER", report.serial_number),
            ("RATED KW", f"{report.rated_kw} kW" if report.rated_kw else None),
            ("RATED VOLTAGE", f"{report.rated_voltage} V" if report.rated_voltage else None),
            ("RATED AMPERAGE", f"{report.rated_amperage} A" if report.rated_amperage else None),
        ]),
        _stat_tiles([
            ("START HOURS", f"{report.start_hours:.2f}" if report.start_hours is not None else "—", NAVY),
            ("END HOURS", f"{report.end_hours:.2f}" if report.end_hours is not None else "—", NAVY),
            ("TOTAL RUN TIME", report.duration_label or "—", RED),
        ]),
        Paragraph("POWER OUTPUT TREND", _styles["sectionTitle"]),
    ]
    if report.telemetry_log:
        story.append(_line_chart(report.telemetry_log, report.rated_kw or 1))
    story.append(Paragraph("TELEMETRY DATA LOG", _styles["sectionTitle"]))
    if report.telemetry_log:
        # Plain strings in a reportlab Table never wrap — a header that's even slightly too wide for its
        # column just overflows straight into the next cell instead of breaking onto a second line, the
        # same overlap bug fixed below for the ATS Transfer table's own header row.
        header_style = ParagraphStyle("telHeader", fontName="Helvetica-Bold", fontSize=6.5, leading=8, textColor=TEXT_DIM, alignment=TA_CENTER)
        header = [Paragraph(h, header_style) for h in ["TIME", "Vab", "Vbc", "Vca", "Ia", "Ib", "Ic", "KW", "%KW", "OIL PSI", "WATER °F", "BATT V", "HOURS"]]
        rows = [header] + [
            [row["time"], row.get("vab"), row.get("vbc"), row.get("vca"), row.get("ia"), row.get("ib"), row.get("ic"),
             row.get("kw"), row.get("pct_kw"), row.get("oil_psi"), row.get("water_temp_f"), row.get("batt_v"), row.get("hours")]
            for row in report.telemetry_log
        ]
        rows = [rows[0]] + [[str(cell) if cell is not None else "—" for cell in r] for r in rows[1:]]
        table = Table(rows, colWidths=[0.55 * inch] + [0.5 * inch] * 11 + [0.55 * inch], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")),
            ("FONTSIZE", (0, 1), (-1, -1), 6.5),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#0f172a")),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            # KW/%KW colored to match the on-screen table's own blue/orange highlight on those two columns.
            ("TEXTCOLOR", (7, 1), (7, -1), BLUE),
            ("FONTNAME", (7, 1), (7, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (8, 1), (8, -1), ORANGE),
            ("FONTNAME", (8, 1), (8, -1), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#eef2f7")]),
        ]))
        story.append(table)
    story.append(Spacer(1, 14))
    story.append(_footer(f"{company_name} · {system_name}", report.report_code))
    doc.build(story)
    return buf.getvalue()


def build_ats_transfer_pdf(report, system_name: str, company_name: str, logo_data: str | None = None) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0, bottomMargin=0.4 * inch, leftMargin=0.6 * inch, rightMargin=0.6 * inch)
    details = report.ats_details or []
    story = [
        _header("ATS Transfer Report", f"{system_name} — {report.event_type or ''} Event", "EVENT DATE", report.report_date, logo_data, True),
        Spacer(1, 12),
        _stat_tiles([
            ("ATS AFFECTED", str(len(details)), NAVY),
            ("EVENT DURATION", report.duration_label or "—", RED),
            ("INITIATING ATS", report.initiating_ats or "—", colors.white),
            ("EVENT TYPE", (report.event_type or "").upper() or "—", colors.white),
        ]),
        Paragraph("ATS DETAILS", _styles["sectionTitle"]),
    ]
    # A single grid — every ATS as one row, same columns, same row height — instead of a separate
    # variable-height "card" per ATS (which read as uneven/zigzag once row heights differed between
    # units with longer vs. shorter field values).
    if details:
        # Paragraphs (not plain strings) so a header wider than its column wraps onto a second line
        # instead of overflowing straight into the next cell — "Switched to Emerg." is wider than its
        # 0.8in column at this font size, which is exactly what was overlapping into "Switched to Normal".
        header_style = ParagraphStyle("atsHeader", fontName="Helvetica-Bold", fontSize=7, leading=9, textColor=colors.HexColor("#334155"), alignment=TA_LEFT)
        header = [Paragraph(h, header_style) for h in ["ATS", "Branch", "Manufacturer", "Serial Number", "Switched to Emerg.", "Switched to Normal", "Time to Buss", "Time to Available", "On Emergency"]]
        col_widths = [w * inch for w in (0.8, 0.75, 0.9, 1.05, 0.8, 0.8, 0.7, 0.75, 0.6)]
        cell_style = ParagraphStyle("atsCell", fontName="Helvetica", fontSize=7, leading=9, textColor=colors.HexColor("#0f172a"))
        bold_cell_style = ParagraphStyle("atsCellBold", fontName="Helvetica-Bold", fontSize=7, leading=9, textColor=colors.HexColor("#0f172a"))
        rows = [header]
        branch_rows = []
        for d in details:
            branch = d.get("branch") or "equipment"
            branch_rows.append(BRANCH_COLORS.get(branch, SLATE))
            rows.append([
                Paragraph(d.get("ats_name", "—"), bold_cell_style),
                Paragraph(BRANCH_LABELS.get(branch, branch.upper()), cell_style),
                Paragraph(str(d.get("manufacturer") or "—"), cell_style),
                Paragraph(str(d.get("serial_number") or "—"), cell_style),
                Paragraph(str(d.get("switched_to_emergency") or "—"), cell_style),
                Paragraph(str(d.get("switched_to_normal") or "—"), cell_style),
                Paragraph(f"{d['time_to_bus_sec']} sec" if d.get("time_to_bus_sec") is not None else "—", cell_style),
                Paragraph(f"{d['time_to_available_sec']} sec" if d.get("time_to_available_sec") is not None else "—", cell_style),
                Paragraph(str(d.get("on_emergency_duration") or "—"), bold_cell_style),
            ])
        table = Table(rows, colWidths=col_widths, repeatRows=1)
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")),
            ("GRID", (0, 0), (-1, -1), 0.6, BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            # A clearly visible alternation (not a near-white tint that barely reads as striping).
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#eef2f7")]),
            ("TEXTCOLOR", (-1, 1), (-1, -1), RED),
        ]
        for i, accent in enumerate(branch_rows):
            style.append(("LINEBEFORE", (0, i + 1), (0, i + 1), 2.5, accent))
        table.setStyle(TableStyle(style))
        story.append(table)
    else:
        story.append(Paragraph("No ATS units were recorded for this event.", _styles["footer"]))

    story.append(Spacer(1, 10))
    story.append(_footer(f"{company_name} · {system_name}", report.report_code))
    doc.build(story)
    return buf.getvalue()


def build_report_pdf(report, system_name: str, company_name: str, logo_data: str | None = None) -> bytes:
    if report.type == "gen-run":
        return build_generator_run_pdf(report, system_name, company_name, logo_data)
    return build_ats_transfer_pdf(report, system_name, company_name, logo_data)
