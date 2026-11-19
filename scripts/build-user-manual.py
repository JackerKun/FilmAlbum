#!/usr/bin/env python3
"""Build the illustrated Chinese user manual (ReportLab + Pillow).

Run with a Python environment containing reportlab and Pillow.
The default embedded fonts are macOS Heiti; set MANUAL_FONT and
MANUAL_BOLD_FONT to licensed Chinese TrueType fonts on other systems.
Content: docs/manual/zh-CN.json. Output: output/pdf/FilmAlbum-3.2.0-使用说明书.pdf.
"""
import json
import os
import re
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parent.parent
PAGES = json.loads((ROOT / 'docs/manual/zh-CN.json').read_text())
OUT = ROOT / 'output/pdf/FilmAlbum-3.2.0-使用说明书.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
(ROOT / 'tmp/pdfs').mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Manual', os.environ.get('MANUAL_FONT', '/System/Library/Fonts/STHeiti Light.ttc')))
pdfmetrics.registerFont(TTFont('ManualBold', os.environ.get('MANUAL_BOLD_FONT', '/System/Library/Fonts/STHeiti Medium.ttc')))
pdfmetrics.registerFontFamily('Manual', normal='Manual', bold='ManualBold', italic='Manual', boldItalic='ManualBold')
W,H=A4
M=40
CW=W-2*M
INK=HexColor('#25372F'); MUTED=HexColor('#657269'); GOLD=HexColor('#947E45')
PAPER=HexColor('#FAF9F4'); PALE=HexColor('#EDEEE5'); LINE=HexColor('#D9DDD3')
C=canvas.Canvas(str(OUT),pagesize=A4,pageCompression=1)
C.setTitle('Film Album 3.2.0 · 中文使用说明书')
C.setAuthor('Film Album')
C.setCreator('Film Album manual builder')
C.setSubject('基于独立模拟资料库的胶片归档、选片、地图、画册与备份操作指南')
C.setKeywords('胶片,画册,摄影,Film Album,使用说明,3.2.0')
C.setViewerPreference('DisplayDocTitle', 'true')
records=[]

def text(x,top,s,size=10.5,color=INK,bold=False):
 C.setFillColor(color);C.setFont('ManualBold' if bold else 'Manual',size)
 C.drawString(x,H-top-size*.85,s)

def para(s,top,x=M,width=CW,size=10.5,leading=16.5,color=INK,bold=False):
 style=ParagraphStyle('body',fontName='ManualBold' if bold else 'Manual',fontSize=size,leading=leading,textColor=color,wordWrap='CJK',splitLongWords=True,spaceAfter=0)
 markup=escape(s).replace('\n','<br/>')
 markup=re.sub(r'https?://[A-Za-z0-9./:_?=+~-]+',lambda m: '<link href="'+m.group(0)+'" color="#657269">'+m.group(0)+'</link>',markup)
 p=Paragraph(markup,style)
 _,height=p.wrap(width,1000)
 p.drawOn(C,x,H-top-height)
 return top+height

def line(top,x=M,width=CW):
 C.setStrokeColor(LINE);C.setLineWidth(.6);C.line(x,H-top,x+width,H-top)

def image(name,top,max_h=338,width=CW):
 path=ROOT/'docs/screenshots'/f'{name}.webp'
 im=Image.open(path).convert('RGB')
 iw,ih=im.size
 scale=min(width/iw,max_h/ih)
 dw,dh=iw*scale,ih*scale
 x=M+(CW-dw)/2
 C.setFillColor(white);C.setStrokeColor(LINE);C.setLineWidth(.6)
 C.roundRect(x-3,H-top-dh-3,dw+6,dh+6,4,stroke=1,fill=1)
 encoded=BytesIO();im.save(encoded,format='JPEG',quality=95,subsampling=0)
 C.drawImage(ImageReader(encoded),x,H-top-dh,dw,dh)
 return top+dh

def note(s,top):
 style=ParagraphStyle('note',fontName='Manual',fontSize=9.2,leading=14,textColor=MUTED,wordWrap='CJK')
 p=Paragraph(escape(s),style);_,ph=p.wrap(CW-28,1000)
 C.setFillColor(PALE);C.roundRect(M,H-top-ph-20,CW,ph+20,5,fill=1,stroke=0)
 C.setFillColor(GOLD);C.rect(M,H-top-ph-20,3,ph+20,fill=1,stroke=0)
 p.drawOn(C,M+14,H-top-10-ph)
 return top+ph+20

def table(data,top):
 headers,rows=data; n=len(headers)
 fractions={2:[.27,.73],3:[.20,.42,.38]}[n]
 if headers[0]=='场景':fractions=[.19,.39,.42]
 if headers[0]=='阶段':fractions=[.12,.51,.37]
 widths=[CW*f for f in fractions]
 def cell(s,head=False):
  return Paragraph(escape(s),ParagraphStyle('cell',fontName='ManualBold' if head else 'Manual',fontSize=9.5,leading=14.2,wordWrap='CJK',textColor=white if head else INK))
 t=Table([[cell(s,True) for s in headers]]+[[cell(s) for s in row] for row in rows],colWidths=widths,hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('ROWBACKGROUNDS',(0,1),(-1,-1),[white,PALE]),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('LINEBELOW',(0,0),(-1,0),.8,GOLD)]))
 _,th=t.wrap(CW,1000);t.drawOn(C,M,H-top-th)
 return top+th

def footer(i,section):
 line(794)
 text(M,806,'FILM ALBUM  /  '+section,8,MUTED)
 C.setFillColor(GOLD);C.setFont('Manual',9)
 C.drawRightString(W-M,H-814,f'{i:02d}  /  {len(PAGES):02d}')
 C.linkRect('', 'page-2',(M,19,M+160,42),relative=0,thickness=0)

def cover():
 C.setFillColor(INK);C.rect(0,0,W,H,fill=1,stroke=0)
 text(M,40,'FILM ALBUM  /  FIELD GUIDE',11,HexColor('#D4BD75'),True)
 text(M,91,'从一卷胶片，',36,PAPER,True)
 text(M,140,'到一本书。',36,PAPER,True)
 text(M,204,'中文使用说明书  ·  VERSION 3.2.0',14,HexColor('#DADFCC'))
 im=Image.open(ROOT/'docs/screenshots/demo-kyoto.webp').convert('RGB')
 dh=CW*im.height/im.width
 encoded=BytesIO();im.save(encoded,format='JPEG',quality=95,subsampling=0)
 C.drawImage(ImageReader(encoded),M,H-250-dh,CW,dh)
 top=250+dh+23
 for x,big,small in [(M,'72','卷模拟胶片'),(M+179,'1,442','条底片记录'),(M+358,'40','页操作指南')]:
  text(x,top,big,25,HexColor('#D4BD75'),True);text(x,top+34,small,10,PAPER)
 para('归档  /  选片  /  地图  /  编册  /  输出  /  备份',727,color=PAPER,size=11)
 para('基于真实界面截图与独立模拟资料库 · 2026-11-13',761,color=HexColor('#BAC6B6'),size=9)

def toc():
 entries=[('开始之前',3,5,'第一次使用、档案模型、安装与资料库'),('胶卷归档',6,12,'界面、建卷、导入、版本、视图与批量修改'),('选片与组织',13,14,'沉浸看片、比较、筛选与收藏'),('地图与项目',15,18,'坐标、选卷、摄影项目、实物底片与印样'),('画册创作',19,23,'画册库、选片、规格、初稿与整册风格'),('画册编辑',24,31,'页序、抓手、蒙版、对齐、贴图、地图与文字'),('画册输出',32,33,'阅读检查、导出进度与三种 PDF'),('资料库维护',34,36,'外部存储、离线预览、备份、历史与回收站'),('参考与练习',37,40,'快捷键、常见问题、完整练习与版本边界')]
 top=130
 for title,start,end,desc in entries:
  text(M,top,title,13,INK,True);text(W-106,top,f'{start:02d} - {end:02d}',12,GOLD)
  text(M,top+22,desc,9.5,MUTED);line(top+46)
  C.linkRect('',f'page-{start}',(M,H-top-46,W-M,H-top+4),relative=0,thickness=0)
  top+=60
 note('使用方法：点击目录跳到章节；点击各页左下角页脚返回目录。PDF 内的中文文字可搜索、选择和复制。界面细字可放大查看。',top+8)

for i,p in enumerate(PAGES,1):
 C.bookmarkPage(f'page-{i}')
 C.addOutlineEntry(f'{i:02d}  {p["title"]}',f'page-{i}',level=0,closed=False)
 if i==1:
  cover();C.showPage();continue
 C.setFillColor(PAPER);C.rect(0,0,W,H,fill=1,stroke=0)
 text(M,28,'FILM ALBUM  /  '+p['section'],9,GOLD,True)
 C.setFillColor(GOLD);C.rect(M, H-53,28,2,fill=1,stroke=0)
 text(M,65,p['title'],23,INK,True)
 y=para(p['intro'],103,size=10.2,leading=15.5,color=MUTED)+18
 if i==2:
  toc();footer(i,p['section']);C.showPage();continue
 if p['image']:
  y=image(p['image'],y)+11
  y=para(p.get('caption') or '界面示例 · 独立模拟资料库',y,size=8,leading=12,color=MUTED)+14
 if p['table']:
  y=table(p['table'],y)+19
 for idx,(title,body) in enumerate(p['steps'],1):
  C.setFillColor(GOLD);C.circle(M+8,H-y-7.5,8,fill=1,stroke=0)
  C.setFont('ManualBold',9);C.setFillColor(white);C.drawCentredString(M+8,H-y-10.8,str(idx))
  y=para(title,y,x=M+24,width=CW-24,size=11,leading=15,bold=True)+4
  y=para(body,y,x=M+24,width=CW-24,size=10,leading=15.5)+12
 for title,body in p['blocks']:
  y=para(title,y,size=12.2,leading=17.5,bold=True)+5
  y=para(body,y,size=10.5,leading=17)+18
 if p['note']: y=note(p['note'],y+2)
 records.append({'page':i,'bottom':round(y,2),'title':p['title']})
 if y>779:raise ValueError(f'Page {i} exceeds content area: {y:.1f} pt: {p["title"]}')
 footer(i,p['section']);C.showPage()
C.save()
(ROOT/'tmp/pdfs/layout-report.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
print(OUT)
print('Pages:',len(PAGES),'Bytes:',OUT.stat().st_size)
