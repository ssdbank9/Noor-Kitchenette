import fs from 'node:fs';
const coverage = JSON.parse(fs.readFileSync(new URL('./verification-2026-10-06-coverage/coverage-final.json', import.meta.url)));
const entries = [];
for (const [file, result] of Object.entries(coverage)) {
  const source = fs.readFileSync(file,'utf8').split(/\r?\n/);
  const name = file.replaceAll('\\','/').split('/src/')[1];
  for (const [id, counts] of Object.entries(result.b)) {
    for (let branch = 0; branch < counts.length; branch++) {
      if (counts[branch] !== 0) continue;
      const location = result.branchMap[id].locations[branch] ?? result.branchMap[id].loc;
      entries.push({ file:'app/src/'+name, line:location.start.line, endLine:location.end.line,
        branchId:id, arm:branch, type:result.branchMap[id].type,
        source:source[location.start.line-1]?.trim().slice(0,180) });
    }
  }
}
const inventory = { description:'Zero-count branches in the instrumented logic run. Browser coverage is not merged. This is a coverage gap inventory, not a defect list or a claim that every branch was exercised.', count:entries.length, entries };
fs.writeFileSync(new URL('./verification-2026-10-06-coverage-gaps.json',import.meta.url),JSON.stringify(inventory,null,2)+'\n');
console.log('Uncovered instrumented logic branches:',entries.length);
