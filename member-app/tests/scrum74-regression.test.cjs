/* global __dirname, URL, FormData */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const req = createRequire(path.join(process.env.TEST_TOOLS, 'package.json'));
const React = req('react');
const { create, act } = req('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const src = path.resolve(__dirname, '../src');
const deferred = () => { let resolve, reject; const promise = new Promise((y,n) => { resolve=y; reject=n; }); return {promise,resolve,reject}; };
function load(file, deps = {}, globals = {}) {
 const code = ts.transpileModule(fs.readFileSync(path.join(src,file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name => {if(name==='react')return React;if(name in deps)return deps[name];throw Error('Unexpected import '+name);},console,setTimeout,clearTimeout,setInterval,clearInterval,Date,...globals});
 return module.exports;
}
class ApiError extends Error { constructor(status,message,errors){ super(message); this.status=status; this.errors=errors; } }
const settle = async () => { await Promise.resolve(); await new Promise(r=>setImmediate(r)); };
function authHarness({ restored=null, getProfile, loginResponse }={}) {
 let token=restored, cached=null, unauthorized, current, tree;
 const requests=[], requestHandlers=new Map(); let index=0;
 const storage={getToken:async()=>token,getUserData:async()=>cached,saveToken:async v=>{token=v;},saveUserData:async v=>{cached=v;},clearToken:async()=>{token=null;},clearUserData:async()=>{cached=null;}};
 const api={defaults:{headers:{common:{}}},interceptors:{request:{use:f=>{requestHandlers.set(++index,f);return index;},eject:id=>requestHandlers.delete(id)}}};
 let profile=getProfile || (()=>Promise.resolve({data:{data:{id:1,name:'Fixture',role:'member',membership:{status:'active',is_active:true}}}}));
 api.get=async url=>{const config={url,headers:{delete(key){delete this[key];}}}; for(const f of requestHandlers.values())await f(config);requests.push(config);try{return await profile(config);}catch(e){e.config=config; if(e.response?.status===401)unauthorized?.(e);throw e;}};
 api.post=async(url,body,options={})=>{const config={url,headers:{...options.headers,delete(key){delete this[key];}}};for(const f of requestHandlers.values())await f(config);requests.push(config);if(url.endsWith('/login'))return loginResponse ? loginResponse() : {data:{data:{token:'fixture-session',user:{id:1}}}};return {data:{}};};
 const auth=load('context/AuthContext.tsx',{'@/lib/auth':storage,'@/lib/api':{apiClient:api,ApiError,registerUnauthorizedHandler:f=>{unauthorized=f;return()=>{unauthorized=null;};}}});
 function Consumer(){current=auth.useAuth();return null;}
 return {api,requests,storage,get state(){return current;},get token(){return token;},get cached(){return cached;},profile:f=>{profile=f;},async mount(){await act(async()=>{tree=create(React.createElement(auth.AuthProvider,null,React.createElement(Consumer)));await settle();});},async close(){await act(async()=>tree.unmount());},async run(fn){await act(async()=>{await fn();await settle();});}};
}
test('N1: login /me 401 clears session and cannot resurrect login fallback',async()=>{
 const h=authHarness({getProfile:()=>Promise.reject({response:{status:401}})});await h.mount();let error;await h.run(async()=>{try{await h.state.login('fixture@example.test','fixture-only');}catch(e){error=e;}});assert.equal(error.status,401);assert.equal(h.state.userToken,null);assert.equal(h.state.user,null);assert.equal(h.token,null);await h.close();
});
for(const failure of [new Error('offline'),{response:{status:500}}]) test('profile network/500 is retryable, never grants unverified eligibility '+(failure.message||500),async()=>{
 const h=authHarness({getProfile:()=>Promise.reject(failure)});await h.mount();await h.run(()=>h.state.login('fixture@example.test','fixture-only'));assert.equal(h.state.profileStatus,'error');assert.equal(h.state.userToken,'fixture-session');h.profile(()=>Promise.resolve({data:{data:{id:1,membership:{status:'pending'}}}}));await h.run(()=>h.state.refreshUser());assert.equal(h.state.profileStatus,'loaded');assert.equal(h.state.user.membership.status,'pending');assert.equal(h.requests.at(-1).headers.Authorization,'Bearer fixture-session');await h.close();
});
test('restore validates /me and logout prevents delayed profile from restoring session',async()=>{
 const pending=deferred();const h=authHarness({restored:'old-fixture',getProfile:()=>pending.promise});await h.mount();assert.equal(h.state.profileStatus,'loading');await h.run(()=>h.state.logout());await h.run(()=>pending.resolve({data:{data:{id:1}}}));assert.equal(h.state.user,null);assert.equal(h.token,null);assert.equal(h.state.profileStatus,'idle');assert.equal(h.requests.at(-1).headers.Authorization,'Bearer old-fixture');await h.close();
});
test('older login response cannot replace a newer session',async()=>{
 const first=deferred();let calls=0;const h=authHarness({loginResponse:()=>++calls===1?first.promise:{data:{data:{token:'new-fixture'}}}});await h.mount();let old;await act(async()=>{old=h.state.login('old@example.test','fixture-only');await settle();});await h.run(()=>h.state.login('new@example.test','fixture-only'));await h.run(()=>first.resolve({data:{data:{token:'old-fixture'}}}));await old;assert.equal(h.state.userToken,'new-fixture');assert.equal(h.token,'new-fixture');await h.close();
});
const membership=load('lib/membership.ts');
const plans=[{id:1,name:'Plan A',price:100,duration_days:30},{id:2,name:'Plan B',price:200,duration_days:60}];
test('API plan parser accepts active public shape and rejects malformed/inactive plans',()=>{
 assert.equal(membership.parseMembershipPlans([...plans,{...plans[0],is_active:false},{id:8,name:'bad',price:null}]).length,2);assert.equal(membership.getMembershipAction({status:'none'}),'register');assert.equal(membership.getMembershipAction({status:'active'}),'renew');assert.equal(membership.getMembershipAction({status:'rejected'}),'apply');
});
function screenHarness({planId='2',profileStatus='loaded',membershipStatus='active',confirmed=true,cache=null,compress,post,now}={}) {
 let auth={userToken:'fixture-session',profileStatus,user:{id:1,name:'Fixture',email:'fixture@example.test',phone_number:'TEST ONLY',membership:{status:membershipStatus,is_active:membershipStatus==='active',end_date:'2099-01-31'}}};
 const postCalls=[],nav=[],alerts=[],store=new Map(cache?[['membership_application_1',JSON.stringify(cache)]]:[]);let tree;
 const Native=Object.fromEntries(['View','Text','ScrollView','TouchableOpacity','Image','ActivityIndicator'].map(n=>[n,n]));
 Native.Platform={OS:'android'};Native.Alert={alert:(...args)=>alerts.push(args)};Native.Linking={openSettings:async()=>{}};Native.AppState={addEventListener:()=>({remove(){}})};
 const secure={getItemAsync:async key=>store.get(key)||null,setItemAsync:async(key,val)=>{store.set(key,val);}};
 let clock=now||Date.now();class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const expiry=[];
 const pending=load('hooks/useMembershipApplication.ts',{'expo-secure-store':secure},{Date:Clock,setTimeout:fn=>{expiry.push(fn);return expiry.length;},clearTimeout:()=>{}});
 const card=load('components/MembershipPlanCard.tsx',{'react-native':Native,'@/lib/membership':membership,'@/utils/formatCurrency':{formatRupiah:v=>'Rp '+v}}).MembershipPlanCard;
 const image={compressPaymentReceipt:compress||asyncUri,ReceiptTooLargeError:class extends Error{}};
 let picker=async()=>({canceled:false,assets:[{uri:'file:///new.jpg',width:2000}]});
 const api={get:async()=>({data:{data:plans}}),post:async(...args)=>{postCalls.push(args);return post?post(...args):{status:201,data:{data:{membership:{id:99,status:'pending'}}}};}};
 class Multipart {constructor(){this.fields=new Map();}append(k,v){this.fields.set(k,v);}}
 const deps={'react-native':Native,'expo-router':{useRouter:()=>({replace:v=>nav.push(v),back:()=>{}}),useLocalSearchParams:()=>({planId})},'expo-image-picker':{requestCameraPermissionsAsync:async()=>({granted:true}),launchCameraAsync:()=>picker(),launchImageLibraryAsync:()=>picker()},'@react-native-community/datetimepicker':{default:'DatePicker',__esModule:true},'@expo/vector-icons':{Ionicons:'Icon'},'@/lib/api':{apiClient:api,ApiError},'@/context/AuthContext':{useAuth:()=>({...auth,refreshUser:async()=>{}})},'@/constants/payment':{PAYMENT_INSTRUCTIONS:{confirmed,bankName:'TEST ONLY',accountNumber:'TEST ONLY',accountName:'TEST ONLY',instruction:'Rekening belum dikonfirmasi.'}},'@/lib/image':image,'@/lib/membership':membership,'@/components/MembershipPlanCard':{MembershipPlanCard:card},'@/hooks/useMembershipApplication':pending};
 const Screen=load('app/(app)/membership/apply.tsx',deps,{FormData:Multipart,Date:Clock}).default;
 function text(node){if(typeof node==='string')return node;if(!node)return '';return (node.children||[]).map(text).join(' ');}
 const harness={postCalls,nav,alerts,store,image,expirePending:()=>expiry.at(-1)?.(),async mount(){await act(async()=>{tree=create(React.createElement(Screen));await settle();});},async close(){await act(async()=>tree.unmount());},button(label){return tree.root.findAllByType('TouchableOpacity').find(n=>(text(n)+' '+(n.props.accessibilityLabel||'')).includes(label));},text(){return text(tree.toJSON());},async click(label){const b=this.button(label);assert.ok(b,'Missing button '+label);await act(async()=>{await b.props.onPress();await settle();});},async run(f){await act(async()=>{await f();await settle();});},setPicker(f){picker=f;},update(patch){auth={...auth,...patch};return this.run(()=>tree.update(React.createElement(Screen)));},datePicker(){return tree.root.findByType('DatePicker');},setClock(value){clock=value;}};
 return harness;
}
async function asyncUri(uri){return uri;}
test('F1/F4: selected route plan matches summary/POST and on_the_spot never sends receipt',async()=>{
 const h=screenHarness();await h.mount();assert.match(h.text(),/Plan B/);await h.click('Bayar di Tempat');await h.click('Kirim Pengajuan');assert.equal(h.postCalls.length,1);const f=h.postCalls[0][1].fields;assert.equal(f.get('membership_plan_id'),'2');assert.equal(f.get('payment_method'),'on_the_spot');assert.equal(f.has('receipt_image'),false);assert.match(h.text(),/Menunggu Verifikasi/);await h.click('Kembali ke Beranda');assert.equal(h.nav[0],'/(app)');await h.close();
});
test('invalid route gets notice and manual plan selection wins',async()=>{
 const h=screenHarness({planId:'invalid'});await h.mount();assert.match(h.text(),/tidak tersedia/);await h.click('Pilih Paket Plan A');await h.click('Bayar di Tempat');await h.click('Kirim Pengajuan');assert.equal(h.postCalls[0][1].fields.get('membership_plan_id'),'1');await h.close();
});
test('N2: synchronous submit guard blocks old photo during deferred replacement and uses new photo afterwards',async()=>{
 const replacement=deferred();let calls=0;const h=screenHarness({compress:()=>++calls===1?Promise.resolve('file:///old.jpg'):replacement.promise});await h.mount();await h.click('Galeri');let picking;await act(async()=>{picking=h.button('Ganti dari Galeri').props.onPress();await settle();});const submit=h.button('Kirim Pengajuan').props.onPress;await h.run(()=>submit());assert.equal(h.postCalls.length,0);await h.run(()=>replacement.resolve('file:///replacement.jpg'));await picking;await h.click('Kirim Pengajuan');assert.equal(h.postCalls[0][1].fields.get('receipt_image').uri,'file:///replacement.jpg');await h.close();
});
test('submit twice before rerender creates one request',async()=>{
 const posting=deferred();const h=screenHarness({post:()=>posting.promise});await h.mount();await h.click('Bayar di Tempat');const submit=h.button('Kirim Pengajuan').props.onPress;let first;await act(async()=>{first=submit();await submit();await settle();});assert.equal(h.postCalls.length,1);await h.run(()=>posting.resolve({status:201,data:{data:{membership:{id:99}}}}));await first;await h.close();
});
for(const status of ['loading','error','idle'])test('unverified profile blocks form '+status,async()=>{const h=screenHarness({profileStatus:status});await h.mount();assert.equal(h.button('Kirim Pengajuan'),undefined);await h.close();});
test('known server pending blocks form without changing active membership',async()=>{const h=screenHarness({membershipStatus:'pending'});await h.mount();assert.match(h.text(),/Menunggu Verifikasi/);assert.equal(h.button('Kirim Pengajuan'),undefined);await h.close();});
test('422 pending rejection is explicit and blocks current-session form',async()=>{
 const h=screenHarness({post:()=>Promise.reject({response:{status:422,data:{errors:{membership:['Masih ada pengajuan yang menunggu verifikasi.']}}}})});await h.mount();await h.click('Bayar di Tempat');await h.click('Kirim Pengajuan');assert.match(h.text(),/Menunggu Verifikasi/);await h.close();
});
for(const error of [new ApiError(422,'validation',{start_date:['Overlap fixture'],unrecognized:['Extra fixture']}),{response:{status:500,data:{message:'Server fixture'}}},new Error('offline')])test('API errors render field/fallback and allow retry '+(error.status||error.response?.status||'offline'),async()=>{
 const h=screenHarness({post:()=>Promise.reject(error)});await h.mount();await h.click('Bayar di Tempat');await h.click('Kirim Pengajuan');assert.equal(h.button('Kirim Pengajuan').props.disabled,false);assert.match(h.text(),error.errors?/Overlap fixture.*Extra fixture/:error.response?/Server fixture/:/Tidak dapat terhubung/);await h.close();
});
test('unconfirmed payment configuration cannot send a transfer or display account',async()=>{
 const h=screenHarness({confirmed:false});await h.mount();await h.click('Galeri');await h.click('Kirim Pengajuan');assert.equal(h.postCalls.length,0);assert.match(h.text(),/belum dikonfirmasi/);assert.doesNotMatch(h.text(),/TEST ONLY TEST ONLY/);await h.close();
});
test('cache after restart is unverified, nonblocking and contains metadata only',async()=>{
 const h=screenHarness({cache:{applicationId:7,status:'pending',recordedAt:Date.now()-86400000}});await h.mount();assert.match(h.text(),/Status terbaru belum dapat dipastikan/);assert.ok(h.button('Kirim Pengajuan'));await h.click('Bayar di Tempat');await h.click('Kirim Pengajuan');const value=JSON.parse(h.store.get('membership_application_1'));assert.deepEqual(Object.keys(value).sort(),['applicationId','recordedAt','status']);await h.close();
});
test('cached hint does not leak to another account',async()=>{
 const h=screenHarness({cache:{status:'pending',recordedAt:Date.now()}});await h.mount();assert.match(h.text(),/Pengajuan terakhir tercatat/);await h.update({userToken:'other-fixture',user:{id:2,membership:{status:'none'}}});assert.doesNotMatch(h.text(),/Pengajuan terakhir tercatat/);await h.close();
});
test('WITA date at UTC day boundary and month-end renewal remain calendar dates',async()=>{
 const h=screenHarness({membershipStatus:'none',now:Date.parse('2026-12-31T16:30:00Z')});await h.mount();await h.click('Bayar di Tempat');await h.click('Kirim Pengajuan');assert.equal(h.postCalls[0][1].fields.get('start_date'),'2027-01-01');await h.close();
 const renewal=screenHarness();await renewal.mount();await renewal.click('Bayar di Tempat');await renewal.click('Kirim Pengajuan');assert.equal(renewal.postCalls[0][1].fields.get('start_date'),'2099-02-01');await renewal.close();
});
test('calendar updates at submit if form crosses WITA midnight',async()=>{
 const h=screenHarness({membershipStatus:'none',now:Date.parse('2026-12-31T15:30:00Z')});await h.mount();await h.click('Bayar di Tempat');h.setClock(Date.parse('2026-12-31T16:30:00Z'));await h.click('Kirim Pengajuan');assert.equal(h.postCalls.length,0);await h.click('Kirim Pengajuan');assert.equal(h.postCalls[0][1].fields.get('start_date'),'2027-01-01');await h.close();
});
test('image helper checks bytes, retries boundedly, and outputs JPEG',async()=>{
 let attempts=0;const requests=[];const image=load('lib/image.ts',{'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},manipulateAsync:async(uri,actions,options)=>{attempts++;requests.push({actions,options});return{uri:'file:///compressed.jpg'};}}},{fetch:async()=>({blob:async()=>({size:attempts<3?3*1024*1024:500000})})});assert.equal(await image.compressPaymentReceipt('file:///large.jpg',3000),'file:///compressed.jpg');assert.equal(attempts,3);assert.equal(requests[0].actions[0].resize.width,1280);assert.equal(requests[0].options.compress,0.7);assert.equal(requests[0].options.format,'jpeg');
});
test('native branding/permissions and root provider survive integration',()=>{
 const app=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../app.json'),'utf8')).expo;assert.ok(app.android.blockedPermissions.includes('android.permission.SYSTEM_ALERT_WINDOW'));assert.equal(app.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-image-picker')[1].microphonePermission,false);assert.ok(app.plugins.includes('@react-native-community/datetimepicker'));assert.match(fs.readFileSync(path.join(src,'app/_layout.tsx'),'utf8'),/<AuthProvider>/);assert.match(fs.readFileSync(path.join(src,'app/(app)/index.tsx'),'utf8'),/<ChatAdminButton context="home"/);
});

test('pending knowledge expires to an unverified hint instead of permanently blocking the form',async()=>{
 const h=screenHarness();await h.mount();await h.click('Bayar di Tempat');await h.click('Kirim Pengajuan');assert.match(h.text(),/Menunggu Verifikasi/);await h.run(()=>h.expirePending());assert.match(h.text(),/Status terbaru belum dapat dipastikan/);assert.ok(h.button('Kirim Pengajuan'));await h.close();
});
test('stale 401 from restored session cannot invalidate a newer login',async()=>{
 const old=deferred();const h=authHarness({restored:'old-fixture',getProfile:()=>old.promise});await h.mount();h.profile(()=>Promise.resolve({data:{data:{id:2,membership:{status:'none'}}}}));await h.run(()=>h.state.login('new@example.test','fixture-only'));await h.run(()=>old.reject({response:{status:401}}));assert.equal(h.state.user.id,2);assert.equal(h.state.userToken,'fixture-session');assert.equal(h.state.profileStatus,'loaded');await h.close();
});
test('FormData interceptor removes JSON without altering auth or setting a boundary',()=>{
 const interceptors=[];const client={interceptors:{request:{use:f=>interceptors.push(f)}}};class Multipart{}
 load('lib/api.ts',{axios:{create:()=>client}},{FormData:Multipart,process:{env:{}}});const headers={Authorization:'Bearer fixture',values:{'Content-Type':'application/json'},delete(name){delete this.values[name];}};const config={headers,data:new Multipart()};interceptors[0](config);assert.equal(headers.values['Content-Type'],undefined);assert.equal(headers.Authorization,'Bearer fixture');assert.equal(Object.values(headers.values).some(v=>String(v).includes('boundary=')),false);
});

test('transfer requires a receipt before POST',async()=>{const h=screenHarness();await h.mount();await h.click('Kirim Pengajuan');assert.equal(h.postCalls.length,0);assert.match(h.text(),/Bukti transfer wajib/);await h.close();});
test('out-of-order refresh cannot overwrite a newer profile within the same session',async()=>{
 const h=authHarness();await h.mount();await h.run(()=>h.state.login('fixture@example.test','fixture-only'));const first=deferred();let count=0;h.profile(()=>++count===1?first.promise:Promise.resolve({data:{data:{id:1,membership:{status:'pending'}}}}));let old;await act(async()=>{old=h.state.refreshUser();await settle();});await h.run(()=>h.state.refreshUser());await h.run(()=>first.resolve({data:{data:{id:1,membership:{status:'active'}}}}));await old;assert.equal(h.state.user.membership.status,'pending');await h.close();
});
