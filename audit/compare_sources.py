import json
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent
books = json.loads((ROOT / "workbook-evidence.json").read_text(encoding="utf-8"))
db = json.loads((ROOT / "html-database.json").read_text(encoding="utf-8"))
by_name = [{s["name"]: s for s in b["sheets"]} for b in books]
diffs = []
for name, s1 in by_name[0].items():
    a = {c["cell"]: c for c in s1["cells"]}
    b = {c["cell"]: c for c in by_name[1][name]["cells"]}
    for cell in sorted(set(a) | set(b)):
        v1, v2 = a.get(cell, {}).get("value"), b.get(cell, {}).get("value")
        if v1 != v2:
            diffs.append({"sheet": name, "cell": cell, "v2": v1, "final": v2})
print("VALUE_OR_FORMULA_DIFFERENCES", json.dumps(diffs, ensure_ascii=False))
for book in books:
    with zipfile.ZipFile(book["file"]) as archive:
        validations = []
        for name in archive.namelist():
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
                tree = ET.fromstring(archive.read(name))
                for el in tree.iter():
                    if el.tag.rsplit("}", 1)[-1] == "dataValidation":
                        validations.append({"part": name, "namespace": el.tag.split("}")[0][1:],
                                            "attributes": el.attrib,
                                            "content": " | ".join(el.itertext())})
        (ROOT / (Path(book["file"]).stem + "-xml-validation.json")).write_text(json.dumps(validations, indent=2, ensure_ascii=False), encoding="utf-8")
        print("XML_VALIDATIONS", Path(book["file"]).name, json.dumps(validations, ensure_ascii=False))

final = by_name[1]
for name, max_row in [("Home", 51), ("Pantry", 7), ("Shopping List", 8), ("What Can I Cook", 4), ("Recipe Card", 11), ("Data", 3)]:
    print("DETAIL", name)
    for c in final[name]["cells"]:
        row = int("".join(x for x in c["cell"] if x.isdigit()))
        if row <= max_row:
            print(c["cell"], json.dumps(c["value"], ensure_ascii=False), "CACHE", json.dumps(c["cached"], ensure_ascii=False))

recipe_cells = {c["cell"]: c["value"] for c in final["Recipes"]["cells"]}
recipes = [{"id": recipe_cells.get(f"A{row}"), "name": recipe_cells.get(f"B{row}"),
            "serves": recipe_cells.get(f"C{row}"), "video": recipe_cells.get(f"E{row}"),
            "url": recipe_cells.get(f"F{row}"), "notes": recipe_cells.get(f"H{row}")}
           for row in range(6, 28)]
recipe_ids = {r["id"] for r in recipes}
html_ids = {r["id"] for r in db["R"]}
ing_cells = {c["cell"]: c["value"] for c in final["Pantry"]["cells"]}
ingredient_ids = {ing_cells.get(f"A{row}") for row in range(7, 69)}
html_ing_ids = set(db["ING"])
ingredient_diffs = []
for row in range(7, 69):
    key = ing_cells.get(f"A{row}")
    expected = [ing_cells.get(f"C{row}"), ing_cells.get(f"I{row}")]
    if key in db["ING"] and db["ING"][key][0] != expected[0]:
        ingredient_diffs.append({"ingredient": key, "excel_unit": expected[0], "html_unit": db["ING"][key][0]})
catalog = {"recipe_count_excel": len(recipes), "recipe_count_html": len(db["R"]),
           "missing_recipe_ids_html": sorted(recipe_ids-html_ids), "extra_recipe_ids_html": sorted(html_ids-recipe_ids),
           "ingredient_count_excel": len(ingredient_ids), "ingredient_count_html": len(html_ing_ids),
           "missing_ingredient_ids_html": sorted(ingredient_ids-html_ing_ids),
           "extra_ingredient_ids_html": sorted(html_ing_ids-ingredient_ids), "unit_diffs": ingredient_diffs,
           "recipes": recipes}
(ROOT / "catalog-comparison.json").write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")
print("CATALOG_COMPARISON", json.dumps({k:v for k,v in catalog.items() if k != "recipes"}, ensure_ascii=False))
