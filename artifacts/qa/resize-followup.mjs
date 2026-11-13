import {chromium} from 'playwright';
import fs from 'node:fs';
import {execSync} from 'node:child_process';
import {captureErrors} from './error-capture.mjs';
const sizes=[['desktop',1440,900],['portrait',390,844],['landscape',844,390]];
const result={sha:execSync('git rev-parse HEAD').toString().trim(),contexts:[]};
const save=()=>fs.writeFileSync('artifacts/qa/resize-results.json',JSON.stringify(result,null,2));
const browser=await chromium.launch({headless:true});
for(const dpr of [1,2])for(const [name,width,height]of sizes){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:name!=='desktop',isMobile:name!=='desktop'});
 const page=await context.newPage(),r={name,dpr,checks:[]};result.contexts.push(r);await captureErrors(page,r);
 const assert=(v,m)=>{if(!v)throw Error(m)};
 const check=async(label,fn)=>{try{r.checks.push({label,pass:true,data:await fn()})}catch(e){r.checks.push({label,pass:false,error:e.message})}save();console.log(name,dpr,label,JSON.stringify(r.checks.at(-1)))};
 const painted=async()=>{await page.waitForTimeout(300);const data=await page.locator('#sections canvas').evaluateAll(cs=>cs.map(c=>{const copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;const ctx=copy.getContext('2d',{willReadFrequently:true});ctx.drawImage(c,0,0);const a=ctx.getImageData(0,0,c.width,c.height).data;let painted=0;const colors=new Set();for(let i=0;i<a.length;i+=16){if(a[i+3])painted++;colors.add(`${a[i]},${a[i+1]},${a[i+2]},${a[i+3]}`)}const b=c.getBoundingClientRect();return {label:c.getAttribute('aria-label'),width:c.width,height:c.height,cssWidth:b.width,painted,colors:colors.size}}));assert(data.length===6&&data.every(c=>c.painted>20&&c.colors>3),'Blank canvas');assert(data.every(c=>Math.abs(c.width-c.cssWidth*dpr)<=1),'Incorrect DPR backing size');assert(r.errors.length===0,JSON.stringify(r.errors));return data};
 const inspector=async()=>{await page.evaluate(()=>scrollTo(0,0));if(await page.getByRole('button',{name:'Pause',exact:true}).count())await page.getByRole('button',{name:'Pause',exact:true}).click();await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(200);const p=await page.evaluate(()=>{const {client,view:v}=window.__hero,s=client.latest,b=document.querySelector('.stage-canvas').getBoundingClientRect();const i=Array.from(s.fade).findIndex(f=>f>=1);return {x:b.x+(v.rot?-s.y[i]:s.x[i])*v.s+v.ox,y:b.y+(v.rot?s.x[i]:s.y[i])*v.s+v.oy}});if(name==='desktop')await page.mouse.click(p.x,p.y);else await page.touchscreen.tap(p.x,p.y);await page.waitForTimeout(250);assert(await page.locator('.nv-inspector').isVisible(),'Inspector absent');const data=await painted();await page.getByRole('button',{name:'Close car inspector'}).click();return data};
 try{
 await page.goto('http://localhost:5180/');await page.waitForFunction(()=>window.__evolve?.generation>=11);
 await check('initial paint',painted);await check('initial inspector',inspector);
 for(const theme of ['dark','light']){await page.locator('#theme-toggle').click();await page.reload();await page.waitForFunction(()=>window.__evolve?.generation>=11);await check('initial size '+theme+' reload',async()=>{assert(await page.locator('html').getAttribute('data-theme')===theme,'Theme mismatch');return painted()})}
 for(const [target,w,h]of sizes){await page.setViewportSize({width:w,height:h});await page.evaluate(()=>scrollTo(0,0));await check('resize to '+target,painted);await check('inspector at '+target,inspector)}
 for(const theme of ['dark','light']){await page.locator('#theme-toggle').click();await page.reload();await page.waitForFunction(()=>window.__evolve?.generation>=11);await check(theme+' reload',async()=>{assert(await page.locator('html').getAttribute('data-theme')===theme,'Theme mismatch');return painted()})}
 }catch(e){r.fatal=e.stack}
 await check('no browser errors',async()=>{assert(r.errors.length===0,JSON.stringify(r.errors));return r.errors});await context.close();save();
}
await browser.close();if(result.contexts.some(r=>r.fatal||r.checks.some(c=>!c.pass)))process.exitCode=1;
