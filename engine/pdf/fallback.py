"""PDF fallback for places without Chrome (Claude Cowork, ChatGPT workspaces).

Reads the print model (JSON, from render.mjs printModel) on stdin and writes a
single-column, text-based PDF that screening software can read. Same content and
order as the Chrome version; Helvetica instead of Instrument Sans. When the text has letters
Helvetica can't draw (Vietnamese, Polish, Greek, Cyrillic…), the bundled DejaVu Sans is used
instead, and any character still missing is reported on stdout as MISSING_GLYPHS:<chars>.
Needs only reportlab (preinstalled in Cowork and ChatGPT; else: pip install reportlab).
Usage: python3 fallback.py out.pdf < model.json
"""
import json, os, sys, unicodedata
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, ListFlowable, ListItem
from reportlab.platypus.flowables import HRFlowable, Flowable
from reportlab.pdfbase.pdfmetrics import stringWidth

INK, BODY, MUTED, RULE = colors.HexColor('#1A1917'), colors.HexColor('#3A3733'), colors.HexColor('#635E56'), colors.HexColor('#D6D1C8')
ACCENT = colors.HexColor('#A34526')
F, FB, FI = 'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'
st = {
    'name': ParagraphStyle('name', fontName=FB, fontSize=22, leading=26, textColor=INK, spaceAfter=3),
    'title': ParagraphStyle('title', fontName=FB, fontSize=11.5, leading=15, textColor=ACCENT),
    'sub': ParagraphStyle('sub', fontName=F, fontSize=9.6, leading=13, textColor=MUTED, spaceBefore=1),
    'avail': ParagraphStyle('avail', fontName=FB, fontSize=9.6, leading=13, textColor=INK, spaceBefore=6),
    'contact': ParagraphStyle('contact', fontName=F, fontSize=9, leading=12, textColor=MUTED, spaceBefore=4),
    'body': ParagraphStyle('body', fontName=F, fontSize=9.6, leading=13.2, textColor=BODY),
    'summary': ParagraphStyle('summary', fontName=F, fontSize=9.8, leading=13.8, textColor=BODY, spaceBefore=6),
    'h2': ParagraphStyle('h2', fontName=FB, fontSize=10.4, leading=13, textColor=INK),
    'role': ParagraphStyle('role', fontName=FB, fontSize=10.2, leading=13, textColor=INK),
    'org': ParagraphStyle('org', fontName=FI, fontSize=9.2, leading=12, textColor=MUTED, spaceAfter=2),
    'note': ParagraphStyle('note', fontName=F, fontSize=9.2, leading=12.5, textColor=MUTED, spaceBefore=3),
    'term': ParagraphStyle('term', fontName=FB, fontSize=9.6, leading=13.2, textColor=INK),
}
e = lambda s: escape(str(s or ''))
W = letter[0] - 1.3 * inch - 12  # frame width minus the frame's 6pt padding on each side
WHEN_SIZE = 9.2


class RoleLine(Flowable):
    """Role title on the left and its dates right-aligned on the same baseline (one text line, so
    text extraction keeps "Title  Mar 2021 to present" together and in order)."""

    def __init__(self, title, when):
        Flowable.__init__(self)
        self.when = when or ''
        self.dw = stringWidth(self.when, F, WHEN_SIZE) + 10
        self.p = Paragraph(e(title), st['role'])

    def wrap(self, aw, ah):
        self.aw = aw
        _, self.ph = self.p.wrap(aw - self.dw, ah)
        return aw, self.ph

    def draw(self):
        self.p.drawOn(self.canv, 0, 0)
        self.canv.setFont(F, WHEN_SIZE)
        self.canv.setFillColor(MUTED)
        self.canv.drawRightString(self.aw, self.ph - st['role'].leading + 3, self.when)


def bullets(items, small=False):
    return ListFlowable([ListItem(Paragraph(e(t), st['body']), leftIndent=11, bulletColor=MUTED) for t in items],
                        bulletType='bullet', start='\u2022', leftIndent=11, bulletFontName=F, bulletFontSize=8.5, bulletOffsetY=-0.6, spaceBefore=1)


def section(title):
    """Section head: a bold label with a thin accent rule under it (text kept as written, for the check)."""
    return [Spacer(1, 10), Paragraph(e(title), st['h2']),
            HRFlowable(width='100%', thickness=0.7, color=ACCENT, spaceBefore=2, spaceAfter=5)]

INVISIBLE = dict.fromkeys(map(ord, '\u200b\u200c\u200d\u2060\ufeff\u00ad'))
def clean(v):
    # Invisible characters out; typographic ligatures (\ufb00-\ufb06) back to plain letters.
    if isinstance(v, str): return ''.join(unicodedata.normalize('NFKC', c) if '\ufb00' <= c <= '\ufb06' else c for c in v.translate(INVISIBLE))
    if isinstance(v, list): return [clean(x) for x in v]
    if isinstance(v, dict): return {k: clean(x) for k, x in v.items()}
    return v

def strings(v):
    if isinstance(v, str): yield v
    elif isinstance(v, list):
        for x in v: yield from strings(x)
    elif isinstance(v, dict):
        for x in v.values(): yield from strings(x)

def use_unicode_font(text):
    """Switch every style to DejaVu Sans when Helvetica (WinAnsi) can't draw some letter. Returns missing chars."""
    global F, FB, FI
    try: text.encode('cp1252'); return ''
    except UnicodeEncodeError: pass
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
    for name, f in (('DejaVu', 'DejaVuSans.ttf'), ('DejaVu-Bold', 'DejaVuSans-Bold.ttf'), ('DejaVu-Oblique', 'DejaVuSans-Oblique.ttf')):
        pdfmetrics.registerFont(TTFont(name, os.path.join(d, f)))
    swap = {F: 'DejaVu', FB: 'DejaVu-Bold', FI: 'DejaVu-Oblique'}
    for style in st.values(): style.fontName = swap.get(style.fontName, style.fontName)
    F, FB, FI = 'DejaVu', 'DejaVu-Bold', 'DejaVu-Oblique'
    have = pdfmetrics.getFont('DejaVu').face.charToGlyph
    return ''.join(sorted({c for c in text if not c.isspace() and ord(c) not in have}))

def main():
    out = sys.argv[1]
    m = clean(json.load(sys.stdin))
    missing = use_unicode_font(''.join(strings(m)))
    if missing: print('MISSING_GLYPHS:' + missing)
    doc = SimpleDocTemplate(out, pagesize=letter, leftMargin=0.65 * inch, rightMargin=0.65 * inch, topMargin=0.55 * inch, bottomMargin=0.55 * inch,
                            title=m.get('title', ''), author=m.get('name', ''))
    s = [Paragraph(e(m['name']), st['name'])]
    if m.get('headline'): s.append(Paragraph(e(m['headline']), st['title']))
    if m.get('subline'): s.append(Paragraph(e(m['subline']), st['sub']))
    if m.get('availability'): s.append(Paragraph(e(m['availability']), st['avail']))
    if m.get('contact'): s.append(Paragraph('&nbsp;&nbsp;\u00b7&nbsp;&nbsp;'.join(e(c) for c in m['contact']), st['contact']))
    s.append(HRFlowable(width='100%', thickness=0.5, color=RULE, spaceBefore=8, spaceAfter=2))
    for t in m.get('summary', []): s.append(Paragraph(e(t), st['summary']))
    for sec in m.get('sections', []):
        head = section(sec['title'])
        k = sec['kind']
        if k == 'jobs':
            first = True
            for j in sec['jobs']:
                block = [RoleLine(j['title'], j['when']), Paragraph(e(j['org']), st['org'])]
                if j['bullets']: block.append(bullets(j['bullets']))
                block.append(Spacer(1, 7))
                s.append(KeepTogether((head if first else []) + block[:2]))
                s.extend(block[2:])
                first = False
            if first: s.extend(head)
        elif k == 'list':
            body = [bullets(sec['items'])] + ([Paragraph(e(sec['note']), st['note'])] if sec.get('note') else [])
            s.append(KeepTogether(head + body))
        elif k == 'dl':
            # A row without a label spans both columns.
            rows = [[Paragraph(e(r['term']), st['term']), Paragraph(e(r['text']), st['body'])] if r['term'] else [Paragraph(e(r['text']), st['body']), ''] for r in sec['rows']]
            spans = [('SPAN', (0, i), (1, i)) for i, r in enumerate(sec['rows']) if not r['term']]
            t = Table(rows, colWidths=[W * 0.27, W * 0.73])
            t.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 6), ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 4), ('VALIGN', (0, 0), (-1, -1), 'TOP')] + spans))
            s.append(KeepTogether(head + [t]))
        elif k == 'edu':
            body = []
            for r in sec['rows']:
                body.append(Paragraph(f"<b>{e(r['strong'])}</b>{e(r['rest'])}", st['body']))
                if r.get('note'): body.append(Paragraph(e(r['note']), st['note']))
                body.append(Spacer(1, 3))
            if sec.get('certLine'): body.append(Paragraph(e(sec['certLine']), st['note']))
            if sec.get('certsLabel'): body.append(Paragraph(f"<b>{e(sec['certsLabel'])}</b>", st['body']))
            if sec.get('certList'): body.append(bullets(sec['certList']))
            s.append(KeepTogether(head + body))
        elif k == 'para':
            s.append(KeepTogether(head + [Paragraph(e(sec['text']), st['body'])]))
        elif k == 'cols':
            items = sec['items']; half = (len(items) + 1) // 2
            if len(items) <= 2:  # one or two lines read better as a plain list than as two columns
                s.append(KeepTogether(head + [bullets(items)])); continue
            col = lambda xs: bullets(xs) if xs else Spacer(1, 1)
            t = Table([[col(items[:half]), col(items[half:])]], colWidths=[W / 2, W / 2])
            t.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 8), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
            s.append(KeepTogether(head + [t]))
    doc.build(s)

if __name__ == '__main__':
    main()
