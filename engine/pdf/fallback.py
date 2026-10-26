"""PDF fallback for places without Chrome (Claude Cowork, ChatGPT workspaces).

Reads the print model (JSON, from render.mjs printModel) on stdin and writes a
single-column, text-based PDF that screening software can read. Same content and
order as the Chrome version; Helvetica instead of Instrument Sans.
Needs only reportlab (preinstalled in Cowork and ChatGPT; else: pip install reportlab).
Usage: python3 fallback.py out.pdf < model.json
"""
import json, sys
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, ListFlowable, ListItem
from reportlab.platypus.flowables import HRFlowable

INK, BODY, MUTED, RULE = colors.HexColor('#1A1917'), colors.HexColor('#3A3733'), colors.HexColor('#635E56'), colors.HexColor('#D6D1C8')
F, FB = 'Helvetica', 'Helvetica-Bold'
st = {
    'name': ParagraphStyle('name', fontName=FB, fontSize=21, leading=25, textColor=INK, spaceAfter=4),
    'title': ParagraphStyle('title', fontName=FB, fontSize=11.5, leading=15, textColor=INK),
    'sub': ParagraphStyle('sub', fontName=F, fontSize=9.6, leading=13, textColor=MUTED, spaceBefore=2),
    'avail': ParagraphStyle('avail', fontName=FB, fontSize=9.6, leading=13, textColor=INK, spaceBefore=9, spaceAfter=5),
    'contact': ParagraphStyle('contact', fontName=F, fontSize=9, leading=12, textColor=MUTED),
    'body': ParagraphStyle('body', fontName=F, fontSize=9.6, leading=13.4, textColor=BODY),
    'summary': ParagraphStyle('summary', fontName=F, fontSize=9.6, leading=13.4, textColor=BODY, spaceBefore=8),
    'h2': ParagraphStyle('h2', fontName=FB, fontSize=10.2, leading=13, textColor=INK, spaceBefore=4, spaceAfter=5),
    'role': ParagraphStyle('role', fontName=FB, fontSize=10, leading=13, textColor=INK),
    'when': ParagraphStyle('when', fontName=F, fontSize=9.2, leading=13, textColor=MUTED, alignment=2),
    'org': ParagraphStyle('org', fontName=F, fontSize=9.2, leading=12, textColor=MUTED, spaceAfter=2),
    'note': ParagraphStyle('note', fontName=F, fontSize=9.2, leading=12.5, textColor=MUTED, spaceBefore=3),
    'term': ParagraphStyle('term', fontName=FB, fontSize=9.6, leading=13.4, textColor=INK),
}
e = lambda s: escape(str(s or ''))
W = letter[0] - 1.3 * inch - 12  # frame width minus the frame's 6pt padding on each side

def bullets(items, small=False):
    return ListFlowable([ListItem(Paragraph(e(t), st['body']), leftIndent=12, bulletColor=MUTED) for t in items],
                        bulletType='bullet', start='•', leftIndent=12, bulletFontSize=7, spaceBefore=1)

def section(title):
    return [Spacer(1, 9), HRFlowable(width='100%', thickness=0.6, color=RULE, spaceBefore=0, spaceAfter=6), Paragraph(e(title), st['h2'])]

def main():
    out = sys.argv[1]
    m = json.load(sys.stdin)
    doc = SimpleDocTemplate(out, pagesize=letter, leftMargin=0.65 * inch, rightMargin=0.65 * inch, topMargin=0.55 * inch, bottomMargin=0.55 * inch,
                            title=m.get('title', ''), author=m.get('name', ''))
    s = [Paragraph(e(m['name']), st['name'])]
    if m.get('headline'): s.append(Paragraph(e(m['headline']), st['title']))
    if m.get('subline'): s.append(Paragraph(e(m['subline']), st['sub']))
    if m.get('availability'): s.append(Paragraph(e(m['availability']), st['avail']))
    if m.get('contact'): s.append(Paragraph('&nbsp;&nbsp;&nbsp;&nbsp;'.join(e(c) for c in m['contact']), st['contact']))
    for t in m.get('summary', []): s.append(Paragraph(e(t), st['summary']))
    for sec in m.get('sections', []):
        head = section(sec['title'])
        k = sec['kind']
        if k == 'jobs':
            first = True
            for j in sec['jobs']:
                row = Table([[Paragraph(e(j['title']), st['role']), Paragraph(e(j['when']), st['when'])]], colWidths=[W * 0.75, W * 0.25])
                row.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0), ('VALIGN', (0, 0), (-1, -1), 'BOTTOM')]))
                block = [row, Paragraph(e(j['org']), st['org'])]
                if j['bullets']: block.append(bullets(j['bullets']))
                block.append(Spacer(1, 6))
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
            if sec.get('certsLabel'): body.append(Paragraph(f"<b>{e(sec['certsLabel'])}</b>", st['body']))
            if sec.get('certList'): body.append(bullets(sec['certList']))
            s.append(KeepTogether(head + body))
        elif k == 'cols':
            items = sec['items']; half = (len(items) + 1) // 2
            col = lambda xs: bullets(xs) if xs else Spacer(1, 1)
            t = Table([[col(items[:half]), col(items[half:])]], colWidths=[W / 2, W / 2])
            t.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 8), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
            s.append(KeepTogether(head + [t]))
    doc.build(s)

if __name__ == '__main__':
    main()
