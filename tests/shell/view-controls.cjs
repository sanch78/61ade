const {expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
// Shared steps of the view-control specs (command-bar.spec.cjs, settings-form.spec.cjs; docs/toolkit.md#commandbar,
// #settingsform): a record page's control panel and the viewer's bars above and below it, built from public components
// by a project module fixture on the managed feature demo. The module only hands `app` to the page; keys and ids carry
// no project data.
const MODULE='/view-controls-fixture.mjs';
const runtime=process.env.BLADE_TMP_DIR||'tmp';

async function fixture(page){
 await page.route(url=>url.pathname===MODULE,route=>route.fulfill({contentType:'text/javascript',body:'export default app=>{window.__bladeApp=app;};'}));
 await page.route(url=>url.pathname==='/'&&!url.searchParams.has('blade'),async route=>{
  const request=route.request();
  if(request.method()!=='GET'||request.resourceType()!=='document')return route.fallback();
  const response=await route.fetch();
  const body=(await response.text()).replace(/(<script type="application\/json" id="blade-config">)([\s\S]*?)(<\/script>)/,(all,open,json,close)=>{
   const config=JSON.parse(json);if(!config.authenticated)return all;
   config.modules=[...(config.modules??[]),MODULE];
   return open+JSON.stringify(config).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')+close;
  });
  await route.fulfill({response,body});
 });
}
async function start(page,{width=1366,height=900,email='demo@example.test',theme,skin}={}){
 await fixture(page);await page.setViewportSize({width,height});
 if(theme||skin){await page.goto('/');await page.evaluate(([theme,skin])=>{if(theme)localStorage.setItem('blade-theme',theme);else localStorage.removeItem('blade-theme');if(skin)localStorage.setItem('blade-skin',skin);else localStorage.removeItem('blade-skin');},[theme,skin]);}
 await signIn(page,email);
 await expect(page.getByRole('dialog',{name:/^(Bejelentkezés|Sign in)$/})).toHaveCount(0);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
}
/** WCAG contrast of each element's text over its painted background (alpha layers composited up the tree). */
const contrast=(page,selectors)=>page.evaluate(selectors=>{
 const parse=value=>{
  const srgb=value.match(/color\(srgb ([^)]+)\)/);
  if(srgb){const p=srgb[1].split(/[ \/]+/).filter(Boolean).map(Number);return [p[0]*255,p[1]*255,p[2]*255,p[3]??1];}
  const m=value.match(/rgba?\(([^)]+)\)/);if(!m)return [0,0,0,0];const p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);return [p[0],p[1],p[2],p[3]??1];};
 const over=(top,bottom)=>{const a=top[3];return [0,1,2].map(i=>top[i]*a+bottom[i]*(1-a)).concat(1);};
 const background=element=>{const layers=[];for(let e=element;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor);if(c[3]>0)layers.push(c);if(c[3]>=1)break;}
  return layers.reverse().reduce((bottom,top)=>over(top,bottom),[255,255,255,1]);};
 const luminance=c=>{const [r,g,b]=c.slice(0,3).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
 const ratio=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
 return Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{const e=document.querySelector(selector);if(!e)return [name,null];const bg=background(e),fg=over(parse(getComputedStyle(e).color),bg);return [name,Math.round(ratio(fg,bg)*100)/100];}));
},selectors);
const errors=page=>{const list=[];page.on('pageerror',error=>list.push(error.message));return list;};
/** The page under test: control panel (SettingsForm), viewer with a bar above and below (same ids in both bars). */
const build=(page,options={})=>page.evaluate(options=>{
 const app=window.__bladeApp,box=document.createElement('div');
 box.id='vc';Object.assign(box.style,{position:'fixed',left:'0',right:'0',top:'48px',bottom:'32px',zIndex:'5',background:'var(--dhx-background-primary, #fff)'});
 document.body.append(box);
 const t=key=>app.i18n.t(key),narrow=innerWidth<768;
 const tree=narrow?{rows:[{rows:[{id:'top',height:48},{id:'viewer',minHeight:120},{id:'bottom',height:48}]},{id:'panel',header:'Beállítások',height:380}]}
  :{cols:[{id:'panel',header:'Beállítások',width:340},{rows:[{id:'top',height:48},{id:'viewer'},{id:'bottom',height:48}]}]};
 const layout=new app.components.PageLayout({id:'vc-page',tree});
 const log=[];
 layout.mount(box);
/*<form>*/
 const dot='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="9" fill="#e07000"/></svg>');
 const form=new app.components.SettingsForm({key:options.key??'vc-settings',...(options.submit?{submit:{label:'Alkalmaz'}}:{}),fields:[
  {group:'Megjelenés',fields:[
   {name:'fit',label:'Igazítás',type:'segmented',options:{contain:'Teljes',cover:'Kitöltés',fill:'Nyújtás'}},
   {name:'zoom',label:'Nagyítás',type:'range',min:25,max:400,step:5,unit:'%',defaultValue:100},
   {name:'grid',label:'Rács',type:'switch'},
   {name:'gridColor',label:'Rács színe',type:'color',defaultValue:'#336699',visibleWhen:{field:'grid',in:['1']}},
  ]},
  {group:'Szűrés',fields:[
   {name:'tags',label:'Címkék',type:'chips',multiple:true,options:{warm:{label:'Meleg',image:dot},cold:'Hideg',other:'Egyéb'}},
   {name:'side',label:'Oldal',type:'chips',options:{left:'Bal',right:'Jobb'},defaultValue:'left'},
   {name:'speed',label:'Sebesség',type:'select',options:{'1':'1×','2':'2×'},defaultValue:'1',required:true},
   {name:'caption',label:'Felirat',type:'text',required:options.submit===true,max:20},
   {name:'auto',label:'Automatikus',type:'checkbox',clears:['caption']},
  ]}]});
 form.on('change',e=>log.push(['form',e.field,e.value]));
 form.on('submit',e=>log.push(['submit',e.values]));
 form.mount(layout.cell('panel'));
/*</form>*/
 const bar=placement=>{
  const commands=new app.components.CommandBar({label:placement==='top'?'Nézet eszközei':'Lejátszás',placement,items:placement==='top'?[
   {id:'back',label:t('Vissza'),icon:'bi bi-arrow-left'},{type:'separator'},
   {type:'toggle',id:'loop',label:'Ismétlés',icon:'bi bi-repeat',pressed:true},
   {type:'group',items:[{id:'zoomIn',label:'Nagyít',icon:'bi bi-plus-lg',iconOnly:true},{id:'zoomOut',label:'Kicsinyít',icon:'bi bi-dash-lg',iconOnly:true}]},
   {type:'select',id:'speed',label:'Sebesség',options:[{value:'1',label:'1×'},{value:'2',label:'2×'},{value:'4',label:'4×'}]},
   {type:'spacer'},
   {type:'segmented',id:'view',label:'Nézet',options:[{value:'one',label:'Egy'},{value:'two',label:'Kettő'}],value:'two'},
  ]:[
   {type:'toggle',id:'loop',label:'Lejátszás',icon:'bi bi-play-fill',iconOnly:true},
   {type:'range',id:'position',label:'Pozíció',min:0,max:120,value:30,valueLabel:v=>`${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`},
   {type:'select',id:'speed',label:'Sebesség',icon:'bi bi-clock',iconOnly:true,options:[{value:'1',label:'1×'},{value:'2',label:'2×'}]},
  ]});
  for(const event of ['click','toggle','change'])commands.on(event,e=>log.push([placement,event,e.id,e.pressed??e.value]));
  commands.mount(layout.cell(placement));
  return commands;
 };
 window.__vc={layout,/*<form>*/form,/*</form>*/top:bar('top'),bottom:bar('bottom'),log};
},options);
const teardown=page=>page.evaluate(()=>{const vc=window.__vc;if(!vc)return;vc.form?.destroy();vc.top.destroy();vc.bottom.destroy();vc.layout.destroy();document.getElementById('vc')?.remove();window.__vc=undefined;
 for(const key of Object.keys(localStorage))if(key.includes('vc-'))localStorage.removeItem(key);});
const log=page=>page.evaluate(()=>window.__vc.log.splice(0));
const panel=page=>page.locator('#vc [data-cell-id="panel"]');
module.exports={runtime,fixture,start,contrast,errors,build,teardown,log,panel};
