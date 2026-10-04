const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/Aly Jafferani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = "C:/Users/Aly Jafferani/Documents/Codex/2026-07-08/fianc-video-file-project/outputs/Noor_Kitchen_App_v3.html";
const out = __dirname;
const results = [];
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-gpu']});
  async function review(name, action) {
    const context = await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Karachi',acceptDownloads:true});
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(pathToFileURL(source).href,{waitUntil:'domcontentloaded'});
      const evidence = await action(page);
      results.push({name,status:'observed',evidence,pageErrors:errors});
    } catch (e) { results.push({name,status:'verification_error',error:e.message,pageErrors:errors}); }
    await context.close();
  }
  await review('navigation_and_mobile_layout', async p => {
    const views=[];
    for(const name of ['tonight','recipes','pantry','shop','stats']) {
      await p.locator('#nav-'+name).click();
      views.push({name,visibleText:(await p.locator('#view').innerText()).slice(0,180),overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
    }
    await p.locator('#nav-tonight').click();
    await p.screenshot({path:path.join(out,'old-app-tonight-390.png'),fullPage:true});
    return {views,...await p.evaluate(()=>({recipes:DB.R.length,ingredients:Object.keys(DB.ING).length,scaledChicken4:needQty(DB.R[0],1)}))};
  });
  await review('ordinary_search_typing', async p => {
    await p.locator('#nav-recipes').click();
    await p.getByPlaceholder('🔍 Search a dish… (biryani, daal, karahi)').pressSequentially('biryani',{delay:20});
    const recipe=await p.evaluate(()=>({query:q1,activeTag:document.activeElement.tagName}));
    await p.locator('#nav-pantry').click();
    await p.getByPlaceholder('🔍 Find an ingredient…').pressSequentially('chicken',{delay:20});
    return {recipe,pantry:await p.evaluate(()=>({query:q2,activeTag:document.activeElement.tagName}))};
  });
  await review('manual_pantry_edit_persists', async p => {
    const before=await p.evaluate(()=>S.pantry.Chicken);
    await p.locator('#nav-pantry').click();
    await p.locator('.prow').filter({has:p.getByText('Chicken',{exact:true})}).getByRole('button',{name:'+',exact:true}).click();
    const edited=await p.evaluate(()=>S.pantry.Chicken);
    await p.reload({waitUntil:'domcontentloaded'});
    return {before,edited,reloaded:await p.evaluate(()=>S.pantry.Chicken)};
  });
  await review('photo_is_preview_and_manual_tiles', async p => {
    await p.locator('#nav-pantry').click();
    await p.getByRole('button',{name:'📷 Update by photo',exact:true}).click();
    await p.locator('#pfile').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jc7sAAAAASUVORK5CYII=','base64')});
    return {preview:await p.locator('#pzone img').count(),manualTiles:await p.locator('#pzone .gtile').count(),instructions:await p.locator('#sheet').innerText()};
  });
  await review('paste_ignores_units_and_overwrites_stock', async p => {
    const parsed=await p.evaluate(()=>parsePaste('Chicken - 500 g\nCooking Oil - 500 ml\nTomato - -2'));
    await p.evaluate(()=>{S.pantry.Chicken=1;save();});
    await p.locator('#nav-pantry').click();
    await p.getByRole('button',{name:"📋 Paste Claude's list",exact:true}).click();
    await p.locator('#pastebox').fill('Chicken - 500 g');
    await p.getByRole('button',{name:'✨ Read & update pantry',exact:true}).click();
    return {parsed,saved:await p.evaluate(()=>({quantity:S.pantry.Chicken,unit:DB.ING.Chicken[0],snapshots:S.snaps.length}))};
  });
  await review('cooking_deduction_and_undo_log', async p => {
    await p.evaluate(()=>{for(const n in S.pantry)S.pantry[n]=1000;save();rerender();});
    const before=await p.evaluate(()=>S.pantry.Chicken);
    await p.locator('#view .card').filter({has:p.getByRole('heading',{name:'Chicken Biryani (Extreme)',exact:true})}).getByRole('button',{name:'✅ I cooked this',exact:true}).click();
    await p.getByRole('button',{name:'Confirm — update pantry',exact:true}).click();
    const after=await p.evaluate(()=>({stock:S.pantry.Chicken,logs:S.log.length}));
    await p.getByRole('button',{name:'↩ Undo last pantry change',exact:true}).click();
    const undone=await p.evaluate(()=>({stock:S.pantry.Chicken,logs:S.log.length}));
    await p.locator('#nav-stats').click();
    return {before,after,undone,stats:await p.locator('#view').innerText()};
  });
  await review('threshold_shopping_uses_assumed_purchase', async p => {
    await p.evaluate(()=>{S.pantry.Onion=0;save();rerender();});
    await p.locator('#nav-shop').click();
    const row=p.locator('#view .prow').filter({has:p.getByText('Onion',{exact:true})});
    const before=await row.innerText();
    await row.locator('.tick').click();
    const purchased=await p.evaluate(()=>({stock:S.pantry.Onion,marked:S.got.Onion}));
    await p.getByRole('button',{name:'↩ Undo',exact:true}).click();
    return {before,purchased,afterUndo:await p.evaluate(()=>({stock:S.pantry.Onion,marked:S.got.Onion})),rowAfterUndo:await p.locator('#view .prow').filter({has:p.getByText('Onion',{exact:true})}).innerText()};
  });
  await review('custom_recipe_creation_backup_restore', async p => {
    await p.locator('#nav-recipes').click();
    await p.getByRole('button',{name:'➕ Add your own recipe',exact:true}).click();
    await p.getByPlaceholder('e.g. Chicken Jalfrezi').fill('Audit family recipe');
    await p.locator('#ingsel').selectOption('Chicken');
    await p.getByRole('button',{name:'Add ↑',exact:true}).click();
    await p.getByRole('button',{name:'💾 Save recipe',exact:true}).click();
    const created=await p.evaluate(()=>({custom:S.myRecipes.length,all:DB.R.length,recipe:S.myRecipes[0]}));
    const downloaded=p.waitForEvent('download');
    await p.getByRole('button',{name:'💾 Backup',exact:true}).click();
    const download=await downloaded;
    const backupPath=path.join(out,'fixture-backup.json');
    await download.saveAs(backupPath);
    await p.evaluate(()=>{S=defaultState();applyCustom();save();rerender();});
    await p.getByRole('button',{name:'📥 Restore',exact:true}).click();
    await p.locator('#sheet input[type=file]').setInputFiles(backupPath);
    await p.waitForFunction(()=>S.myRecipes.length===1);
    await p.reload({waitUntil:'domcontentloaded'});
    return {created,afterRestore:await p.evaluate(()=>({custom:S.myRecipes.length,all:DB.R.length})),backupSize:fs.statSync(backupPath).size};
  });
  await review('local_date_month_boundary', async p => {
    await p.clock.install({time:new Date('2026-09-30T20:30:00Z')});
    await p.evaluate(()=>{for(const n in S.pantry)S.pantry[n]=1000;askCook('R001');});
    await p.getByRole('button',{name:'Confirm — update pantry',exact:true}).click();
    await p.locator('#nav-stats').click();
    return {log:await p.evaluate(()=>S.log[0]),stats:await p.locator('#view').innerText()};
  });
  await review('storage_failure_is_silent', async p => {
    await p.evaluate(()=>save());
    const before=await p.evaluate(()=>S.pantry.Chicken);
    await p.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Fixture quota','QuotaExceededError')};bump('Chicken',1);});
    const inMemory=await p.evaluate(()=>S.pantry.Chicken);
    await p.reload({waitUntil:'domcontentloaded'});
    return {before,inMemory,reloaded:await p.evaluate(()=>S.pantry.Chicken),message:await p.locator('#toast').innerText()};
  });
  await browser.close();
  fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
