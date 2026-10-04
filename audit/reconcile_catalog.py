import json
import sys
from pathlib import Path
from collections import defaultdict
sys.stdout.reconfigure(encoding="utf-8")
root=Path(__file__).resolve().parent
books=json.loads((root/'workbook-evidence.json').read_text(encoding='utf-8'))
db=json.loads((root/'html-database.json').read_text(encoding='utf-8'))
sheet_maps=[{s['name']:{c['cell']:c for c in s['cells']} for s in b['sheets']} for b in books]
def canonical(v):
    return v['text'] if isinstance(v,dict) and v.get('kind')=='array_formula' else v
diffs=[]
for sheet,a in sheet_maps[0].items():
    b=sheet_maps[1][sheet]
    for cell in sorted(set(a)|set(b)):
        x,y=canonical(a.get(cell,{}).get('value')),canonical(b.get(cell,{}).get('value'))
        if x!=y:diffs.append({'sheet':sheet,'cell':cell,'v2':x,'final':y})
final=sheet_maps[1]
ingredients=defaultdict(list)
for row in range(3,279):
    c=final['Data']
    ingredients[c[f'A{row}']['value']].append([c[f'C{row}']['value'],c[f'D{row}']['value']])
mismatches=[]
for r in db['R']:
    if sorted(r['ings'])!=sorted(ingredients[r['id']]):mismatches.append(r['id'])
for row in range(6,28):
    c=final['Recipes'];r=next(x for x in db['R'] if x['id']==c[f'A{row}']['value'])
    for field,col in [('name','B'),('serves','C'),('time','D'),('notes','H')]:
        if r[field]!=c[f'{col}{row}']['value']:mismatches.append({'recipe':r['id'],'field':field})
    written=c[f'F{row}']['link']
    video=c[f'E{row}']['link']
    if r['url']!=written:mismatches.append({'recipe':r['id'],'field':'url','excel':written,'html':r['url']})
    if db['VIDEO'][r['id']]!=video:mismatches.append({'recipe':r['id'],'field':'video','excel':video,'html':db['VIDEO'][r['id']]})
state_diffs=[]
for row in range(7,69):
    c=final['Pantry'];key=c[f'A{row}']['value'];html=db['ING'][key]
    for field,col,index in [('unit','C',0),('threshold','D',2),('initial_quantity','B',3)]:
        if html[index]!=c[f'{col}{row}']['value']:state_diffs.append({'ingredient':key,'field':field})
raw_validation={}
for book in books:
    vals=json.loads((root/(Path(book['file']).stem+'-xml-validation.json')).read_text(encoding='utf-8'))
    raw_validation[Path(book['file']).name]={'total':len(vals),'extended':sum('2009/9' in v['namespace'] for v in vals),'ranges':[v.get('attributes',{}).get('sqref') or v['content'] for v in vals]}
result={'normalized_workbook_differences':diffs,'recipe_ingredient_rows':sum(map(len,ingredients.values())),
        'catalog_content_mismatches':mismatches,'pantry_seed_mismatches':state_diffs,'xml_validation':raw_validation}
(root/'reconciliation.json').write_text(json.dumps(result,indent=2,ensure_ascii=False,default=str),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,default=str))
