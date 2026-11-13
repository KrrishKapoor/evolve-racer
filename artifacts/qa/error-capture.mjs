// Install before navigation: Vite consumes errors that Playwright pageerror misses.
export async function captureErrors(page,result){
 result.errors=[];
 await page.exposeFunction('__qaRawError',message=>result.errors.push({type:'windowerror',message}));
 await page.addInitScript(()=>addEventListener('error',e=>window.__qaRawError(e.message),true));
 page.on('pageerror',e=>result.errors.push({type:'pageerror',message:e.message}));
 page.on('console',m=>{if(['error','warning'].includes(m.type()))result.errors.push({type:m.type(),message:m.text()})});
 page.on('requestfailed',r=>result.errors.push({type:'network',url:r.url(),error:r.failure()}));
 page.on('response',r=>{if(r.status()>=400)result.errors.push({type:'http',url:r.url(),status:r.status()})});
}
