/* Ironday: standalone web app (installable on Android and iPhone).
   Google Sign-In via Firebase Auth, private per-user storage in Firestore,
   optional sync to the user's own Google Sheet. */
import {firebaseConfig} from './firebase-config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,onAuthStateChanged,signOut,reauthenticateWithPopup,deleteUser} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {initializeFirestore,getFirestore,persistentLocalCache,persistentMultipleTabManager,doc,getDoc,setDoc,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ---------- data ---------- */
const DAYS=['mon','tue','wed','thu','fri','sat','sun'];
const DAY_NAMES={mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday',sun:'Sunday'};
const GROUP_NAMES={chest:'Chest',back:'Back',shoulders:'Shoulders',triceps:'Triceps',biceps:'Biceps',legs:'Legs',glutes:'Glutes',core:'Core',cardio:'Cardio'};
const LIB={
  chest:['Barbell bench press','Incline dumbbell press','Cable fly','Push-up','Chest dip'],
  back:['Deadlift','Pull-up','Barbell row','Lat pulldown','Seated cable row'],
  shoulders:['Overhead press','Dumbbell lateral raise','Rear delt fly','Arnold press','Face pull'],
  triceps:['Close-grip bench press','Rope pushdown','Overhead triceps extension','Skull crusher','Bench dip'],
  biceps:['Barbell curl','Hammer curl','Incline dumbbell curl','Preacher curl','Cable curl'],
  legs:['Back squat','Romanian deadlift','Leg press','Walking lunge','Leg curl','Calf raise'],
  glutes:['Hip thrust','Bulgarian split squat','Cable kickback'],
  core:['Plank','Hanging leg raise','Cable crunch','Russian twist'],
  cardio:['Treadmill intervals','Rowing machine','Stationary bike','Jump rope']
};
const SPLITS=[
  {id:'shoulders-triceps',name:'Shoulders & Triceps',groups:['shoulders','triceps'],plate:'yellow',kg:15},
  {id:'chest-triceps',name:'Chest & Triceps',groups:['chest','triceps'],plate:'red',kg:25},
  {id:'chest-biceps',name:'Chest & Biceps',groups:['chest','biceps'],plate:'red',kg:25},
  {id:'back-biceps',name:'Back & Biceps',groups:['back','biceps'],plate:'blue',kg:20},
  {id:'legs',name:'Legs & Glutes',groups:['legs','glutes'],plate:'green',kg:10},
  {id:'arms',name:'Arms',groups:['biceps','triceps'],plate:'yellow',kg:15},
  {id:'full',name:'Full Body',groups:['legs','chest','back','shoulders'],plate:'blue',kg:20},
  {id:'cardio-core',name:'Cardio & Core',groups:['cardio','core'],plate:'green',kg:10},
  {id:'rest',name:'Rest & Recover',groups:[],plate:'gray',kg:0},
  {id:'custom',name:'Custom',groups:[],plate:'gray',kg:5}
];
const SPLIT=Object.fromEntries(SPLITS.map(s=>[s.id,s]));
/* illustrated characters: [pose, person] per split */
const CAST={'shoulders-triceps':['press','a'],'chest-triceps':['flex','b'],'chest-biceps':['curl','b'],'back-biceps':['curl','c'],legs:['squat','a'],arms:['curl','b'],full:['lunge','c'],'cardio-core':['run','a'],rest:['meditate','c'],custom:['flex','a']};
const PEOPLE={
  a:{skin:'#E8B08A',hair:'#3A2A22',bun:true,top:'#1FA383',pants:'#2E4A52',shoe:'#F7F7F2'},
  b:{skin:'#94603F',hair:'#1F1A17',bun:false,top:'#F07A5A',pants:'#384057',shoe:'#F7F7F2'},
  c:{skin:'#F2C7A5',hair:'#8B4A2B',bun:true,top:'#6C8CF5',pants:'#2F3A56',shoe:'#F7F7F2'}
};
/* joints: h head, n neck, p hip, e/h elbow/hand, k/f knee/foot; a = back limb, b = front limb */
const POSES={
  press:{h:[100,40],n:[100,64],p:[100,126],ea:[74,58],ha:[72,26],eb:[126,58],hb:[128,26],ka:[88,166],fa:[84,204],kb:[112,166],fb:[118,204],db:'ab'},
  curl:{h:[100,40],n:[100,64],p:[100,126],ea:[86,104],ha:[82,140],eb:[116,104],hb:[132,80],ka:[90,166],fa:[86,204],kb:[110,166],fb:[114,204],db:'ab'},
  squat:{h:[86,74],n:[92,96],p:[124,140],ea:[72,112],ha:[48,106],eb:[76,116],hb:[52,114],ka:[84,152],fa:[96,204],kb:[90,158],fb:[110,204],db:''},
  run:{h:[110,36],n:[106,60],p:[96,122],ea:[80,86],ha:[70,108],eb:[126,82],hb:[136,60],ka:[82,162],fa:[56,180],kb:[126,148],fb:[120,190],db:''},
  meditate:{h:[100,72],n:[100,96],p:[100,150],ea:[72,128],ha:[62,152],eb:[128,128],hb:[138,152],ka:[58,178],fa:[112,190],kb:[142,178],fb:[88,190],db:'',bare:true},
  lunge:{h:[100,34],n:[100,58],p:[100,120],ea:[82,92],ha:[98,80],eb:[118,92],hb:[102,82],ka:[76,176],fa:[46,200],kb:[140,150],fb:[144,202],db:''},
  flex:{h:[100,44],n:[100,68],p:[100,128],ea:[70,72],ha:[74,44],eb:[130,72],hb:[126,44],ka:[86,168],fa:[80,204],kb:[114,168],fb:[120,204],db:''}
};
function character(pose,who,label){
  const P=POSES[pose]||POSES.flex,C=PEOPLE[who]||PEOPLE.a;
  const pl=a=>a.map(p=>p.join(',')).join(' ');
  const seg=(pts,col,w,sh)=>`<polyline points="${pl(pts)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`+(sh?`<polyline points="${pl(pts)}" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`:'');
  const s=[P.n[0],P.n[1]+6];
  const arm=(e,h,sh)=>seg([s,e],C.top,13,sh)+seg([e,h],C.skin,10,sh);
  const leg=(k,f,sh)=>seg([P.p,k,f],C.pants,16,sh)+(P.bare?'':`<line x1="${f[0]-4}" y1="${f[1]}" x2="${f[0]+11}" y2="${f[1]}" stroke="${C.shoe}" stroke-width="10" stroke-linecap="round"/><line x1="${f[0]-4}" y1="${f[1]+3}" x2="${f[0]+11}" y2="${f[1]+3}" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linecap="round"/>`);
  const db=([x,y])=>`<rect x="${x-15}" y="${y-2.5}" width="30" height="5" rx="2.5" fill="#56666C"/><rect x="${x-19}" y="${y-9}" width="8" height="18" rx="3" fill="#2E3B40"/><rect x="${x+11}" y="${y-9}" width="8" height="18" rx="3" fill="#2E3B40"/>`;
  const [hx,hy]=P.h,r=15;
  return`<svg class="char" viewBox="0 0 200 215" role="img" aria-label="${esc(label||'Workout character')}">
    <circle cx="100" cy="116" r="90" style="fill:var(--plate);opacity:.2"/><circle cx="100" cy="116" r="66" style="fill:var(--plate);opacity:.16"/>
    <ellipse cx="100" cy="208" rx="56" ry="6" fill="rgba(0,0,0,.08)"/>
    ${leg(P.ka,P.fa,true)}${arm(P.ea,P.ha,true)}${P.db.includes('a')?db(P.ha):''}
    <circle cx="${P.p[0]}" cy="${P.p[1]}" r="15" fill="${C.pants}"/>
    ${seg([[P.n[0],P.n[1]+4],[P.p[0],P.p[1]-6]],C.top,30)}
    ${leg(P.kb,P.fb,false)}
    ${seg([P.n,[hx,hy+10]],C.skin,9)}
    <circle cx="${hx}" cy="${hy}" r="${r}" fill="${C.skin}"/>
    <path d="M${hx-r-1} ${hy+1} A${r+1} ${r+1} 0 0 1 ${hx+r+1} ${hy+1} Q${hx} ${hy-5} ${hx-r-1} ${hy+1}Z" fill="${C.hair}"/>
    ${C.bun?`<circle cx="${hx-4}" cy="${hy-17}" r="8" fill="${C.hair}"/>`:''}
    ${arm(P.eb,P.hb,false)}${P.db.includes('b')?db(P.hb):''}
  </svg>`;
}
function castFor(day){const c=CAST[day.split]||CAST.custom;return c}
const FOODS=[
  ['Chicken breast, grilled','150 g',248,46,0,5],['Rice, cooked','1 cup',205,4,45,0.4],['Eggs','2 large',143,13,1,10],
  ['Oats','50 g dry',190,7,33,3.5],['Banana','1 medium',105,1,27,0.4],['Greek yogurt, nonfat','170 g',100,17,6,0.7],
  ['Whey protein shake','1 scoop',120,24,3,1.5],['Salmon fillet','150 g',312,33,0,19],['Sweet potato','200 g',172,3,40,0.2],
  ['Broccoli','1 cup',31,3,6,0.3],['Peanut butter','2 tbsp',190,7,7,16],['Milk, whole','1 cup',149,8,12,8],
  ['Apple','1 medium',95,0.5,25,0.3],['Lean beef','150 g',250,39,0,10],['Tuna, canned in water','1 can',120,26,0,1],
  ['Whole wheat bread','1 slice',80,4,14,1],['Avocado','half',120,1.5,6,11],['Almonds','28 g',164,6,6,14],
  ['Pasta, cooked','1 cup',220,8,43,1.3],['Cottage cheese','1 cup',206,28,8,9],['Tofu, firm','150 g',216,24,4,13],
  ['Protein bar','1 bar',210,20,22,7],['Mixed salad with olive oil','1 bowl',150,2,8,12],['Black beans','1 cup',227,15,41,1]
];
const MEALS=[['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['snack','Snacks']];
const QUOTES=[
  'Show up first. Motivation usually arrives after the warm-up.',
  'Small plates add up. So do small days.',
  'You don’t need a perfect week. You need the next session.',
  'Strong is built on ordinary Tuesdays.',
  'Every rep you log today is proof for the person you’ll be next year.',
  'Rest is part of the program, not a break from it.',
  'Eat like you train: on purpose.',
  'Progress hides in your logbook. Write it down.',
  'Beginners who keep going become the regulars everyone asks for advice.',
  'One more set is a decision, not a feeling.',
  'Ten minutes beats zero minutes every time.',
  'The bar doesn’t care how you feel. Lift it anyway, then feel proud.'
];

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,10);
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmt=n=>Math.round(n||0).toLocaleString();
const clone=o=>JSON.parse(JSON.stringify(o));
function iso(d=new Date()){const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}
function fromIso(s){return new Date(s+'T12:00:00')}
function addDays(s,n){const d=fromIso(s);d.setDate(d.getDate()+n);return iso(d)}
function dkOf(s){return DAYS[(fromIso(s).getDay()+6)%7]}
function mondayIso(s=iso()){const d=fromIso(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d)}
function fmtTime(t){const [h,m]=(t||'18:00').split(':').map(Number);const d=new Date();d.setHours(h,m,0,0);return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}
function fmtDate(s,o={weekday:'short',month:'short',day:'numeric'}){return fromIso(s).toLocaleDateString([],o)}
function mealNow(){const h=new Date().getHours()+new Date().getMinutes()/60;return h<11?'breakfast':h<16?'lunch':h<21?'dinner':'snack'}

function mkEx(name,g,k){
  if(g==='cardio')return{id:uid(),name,group:g,sets:1,reps:'20 min'};
  if(g==='core')return{id:uid(),name,group:g,sets:3,reps:'15'};
  return{id:uid(),name,group:g,sets:k===0?4:3,reps:k===0?'6-8':'10-12'};
}
function defaultExercises(id){
  const sp=SPLIT[id];if(!sp||!sp.groups.length)return[];
  const cap=sp.groups.length>2?6:5,cnt=sp.groups.map(()=>0);let n=0,i=0;
  while(n<cap&&i<60){const gi=i%sp.groups.length;if(cnt[gi]<LIB[sp.groups[gi]].length){cnt[gi]++;n++}i++}
  const out=[];sp.groups.forEach((g,gi)=>{for(let k=0;k<cnt[gi];k++)out.push(mkEx(LIB[g][k],g,k))});return out;
}
function mkDay(split,time){return{split,name:'',time,remind:split!=='rest',exercises:defaultExercises(split)}}
function freshState(){
  return{v:1,created:iso(),profile:{name:'',photo:''},prefs:{theme:'light'},sheet:{id:'',url:'',auto:true,last:0},privacy:{cache:true,greetName:true},
    plan:{mon:mkDay('shoulders-triceps','18:00'),tue:mkDay('back-biceps','18:00'),wed:mkDay('legs','18:00'),thu:mkDay('rest','18:00'),fri:mkDay('chest-biceps','18:00'),sat:mkDay('cardio-core','09:00'),sun:mkDay('rest','09:00')},
    overrides:{},sessions:[],active:null,food:{},water:{},
    targets:{kcal:2400,p:150,c:260,f:75,water:8},
    goals:[{id:uid(),type:'weekly',title:'Train 4 times a week',target:4},{id:uid(),type:'lift',title:'Overhead press 50 kg',exercise:'Overhead press',target:50}],
    weights:[],notif:{system:false,workout:true,lead:30,meals:true,water:true,streak:true,milestones:true,preview:true,rest:90},
    seen:{},inbox:[],starter:true,_u:0};
}
function migrate(s){
  const f=freshState();if(!s||typeof s!=='object')return f;
  for(const k in f)if(s[k]===undefined)s[k]=f[k];
  ['notif','targets','profile','prefs','privacy','sheet'].forEach(g=>{if(!s[g]||typeof s[g]!=='object')s[g]={};for(const k in f[g])if(s[g][k]===undefined)s[g][k]=f[g][k]});
  DAYS.forEach(d=>{if(!s.plan[d])s.plan[d]=f.plan[d]});
  return s;
}
function prune(){
  const cut=addDays(iso(),-120);
  for(const k of Object.keys(state.food))if(k<cut)delete state.food[k];
  for(const k of Object.keys(state.water))if(k<cut)delete state.water[k];
  for(const k of Object.keys(state.overrides))if(k<addDays(iso(),-14))delete state.overrides[k];
  if(state.sessions.length>160)state.sessions=state.sessions.slice(-160);
  if(state.weights.length>200)state.weights=state.weights.slice(-200);
  const old=Date.now()-3*864e5;for(const k in state.seen)if(state.seen[k]<old)delete state.seen[k];
  state.inbox=state.inbox.slice(0,40);
}

/* ---------- accounts & storage: Google Sign-In (Firebase Auth) + one private Firestore document per user ---------- */
const CONFIGURED=!!(firebaseConfig&&firebaseConfig.apiKey&&firebaseConfig.projectId);
const LOCALHOST=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const DEMO=LOCALHOST&&/[?&]demo\b/.test(location.search);
const SHEETS_SCOPE='https://www.googleapis.com/auth/drive.file';
let fb=null,state=freshState(),me=null,uidv=null,phase='loading',gateError='',saveTimer=null,lastSync=0,started=false,pendingImport=null,pendingJump=null,installEvt=null;
let syncMsg='Connecting…',syncOn=false;
const lsKey=()=>'ironday.data.'+uidv;
function lsGet(){try{return JSON.parse(localStorage.getItem(lsKey()))}catch{return null}}
function lsSet(s){if(!uidv)return;try{if(s.privacy&&s.privacy.cache===false)localStorage.removeItem(lsKey());else localStorage.setItem(lsKey(),JSON.stringify(s))}catch{}}
function lsDel(){try{localStorage.removeItem(lsKey())}catch{}}
function syncLine(){return syncMsg+(lastSync?` · last saved ${new Date(lastSync).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`:'')}
function setSync(txt,on){syncMsg=txt;syncOn=!!on;const t=$('#syncTxt'),d=$('#syncDot'),l=$('#syncLong');if(t)t.textContent=txt;if(d)d.classList.toggle('on',!!on);if(l)l.textContent=syncLine()}
function save(){state._u=Date.now();prune();lsSet(state);clearTimeout(saveTimer);saveTimer=setTimeout(pushCloud,1000);queueSheetSync()}
function pushCloud(){
  if(DEMO){lastSync=Date.now();setSync('Preview mode: saved on this computer only',true);return Promise.resolve(true)}
  if(!fb||!uidv)return Promise.resolve(false);
  if(navigator.onLine===false)setSync('Offline. Changes will sync when you reconnect.');
  return setDoc(doc(fb.db,'users',uidv),{json:JSON.stringify(state),updatedAt:serverTimestamp()})
    .then(()=>{lastSync=Date.now();setSync('Saved to your account',true);return true})
    .catch(e=>{setSync(e&&e.code==='permission-denied'?'The server refused the save. Log out and sign in again.':'Couldn’t reach the server. Changes are kept on this device.');return false});
}
const timeout=ms=>new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout'}),ms));
function applyTheme(){const t=(state.prefs&&state.prefs.theme)||'light',r=document.documentElement;if(t==='system')r.removeAttribute('data-theme');else r.setAttribute('data-theme',t);const m=document.querySelector('meta[name=theme-color]');if(m)m.content=(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))?'#0D1716':'#EEF5F1'}
function friendlyAuthError(e){
  const c=e&&e.code||'';
  if(c==='auth/unauthorized-domain')return'This web address isn’t allowed to sign in yet. Add it under Authentication › Settings › Authorized domains in Firebase.';
  if(c==='auth/network-request-failed')return'No connection. Check your internet and try again.';
  if(c==='auth/popup-blocked')return'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
  if(c==='auth/configuration-not-found'||c==='auth/internal-error')return'Google sign-in isn’t switched on for Ironday yet. In Firebase, open Authentication, click Get started, then enable Google.';
  if(c==='auth/operation-not-allowed')return'Google sign-in is turned off for this app. Turn it on in Firebase › Authentication › Sign-in method.';
  if(c==='auth/user-mismatch')return'Choose the same Google account you’re signed in with.';
  return'Sign-in didn’t finish. Please try again.';
}
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
async function loadUserData(user){
  uidv=user.uid;me={id:user.uid,name:user.displayName||'',email:user.email||'',avatarUrl:user.photoURL||''};
  const cached=lsGet();state=cached?migrate(cached):freshState();phase='loading';render();
  if(DEMO){phase='app';setSync('Preview mode: saved on this computer only',true);return}
  try{
    const snap=await Promise.race([getDoc(doc(fb.db,'users',uidv)),timeout(9000)]);
    if(snap.exists()){let remote=null;try{remote=JSON.parse(snap.data().json)}catch{}
      if(remote&&(remote._u||0)>=(state._u||0)){state=migrate(remote);lsSet(state)}else pushCloud()}
    else pushCloud();
    lastSync=Date.now();setSync('Saved to your account',true);
  }catch(e){setSync(cached?'Offline. Showing the copy on this device.':'Couldn’t reach the server yet.')}
  phase='app';
}
async function boot(){
  applyTheme();render();
  if(DEMO){await loadUserData({uid:'demo',displayName:'Demo athlete',email:'',photoURL:''});applyTheme();render();startApp();return}
  if(!CONFIGURED){phase='setup';render();return}
  const app=initializeApp(firebaseConfig);
  let db;try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch{db=getFirestore(app)}
  const auth=getAuth(app);
  const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
  fb={app,db,auth,provider};
  try{const r=await getRedirectResult(auth);if(r)captureToken(r)}catch(e){gateError=friendlyAuthError(e)}
  onAuthStateChanged(auth,async user=>{
    if(!user){uidv=null;me=null;state=freshState();phase='signedout';applyTheme();render();return}
    await loadUserData(user);applyTheme();render();startApp();
  });
}
async function signIn(){
  if(!fb)return;gateError='';
  try{const r=await signInWithPopup(fb.auth,fb.provider);captureToken(r)}
  catch(e){
    const c=e&&e.code;
    if(c==='auth/popup-blocked'||c==='auth/operation-not-supported-in-this-environment'){try{await signInWithRedirect(fb.auth,fb.provider);return}catch(e2){gateError=friendlyAuthError(e2)}}
    else if(c!=='auth/popup-closed-by-user'&&c!=='auth/cancelled-popup-request')gateError=friendlyAuthError(e);
    render();
  }
}
function startApp(){if(started)return;started=true;setTimeout(tickAlerts,1500);setInterval(tickAlerts,30000)}

/* ---------- Google Sheets: a spreadsheet in the user's own Drive, written with their own Google sign-in ---------- */
const TKEY='ironday.gtoken';
function captureToken(result,sheets){try{const c=GoogleAuthProvider.credentialFromResult(result);if(c&&c.accessToken&&result.user)sessionStorage.setItem(TKEY,JSON.stringify({uid:result.user.uid,t:c.accessToken,exp:Date.now()+55*60e3,sheets:!!sheets}))}catch{}}
function getToken(){try{const o=JSON.parse(sessionStorage.getItem(TKEY));if(o&&o.uid===uidv&&o.exp>Date.now()&&o.sheets)return o.t}catch{}return null}
function clearToken(){try{sessionStorage.removeItem(TKEY)}catch{}}
let sheetBusy=false,sheetAgain=false,sheetTimer=null,sheetMsg='';
const SAPI='https://sheets.googleapis.com/v4/spreadsheets';
const TABS=['Workouts','Sets','Food','Water','Body weight','Goals','Weekly plan'];
const qTab=n=>`'${n.replace(/'/g,"''")}'`;
async function gfetch(url,opts={}){
  const t=getToken();if(!t)throw{code:'no-token'};
  const r=await fetch(url,{...opts,headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'}});
  if(r.status===401){clearToken();throw{code:'no-token'}}
  if(!r.ok){let m='';try{m=(await r.json()).error.message}catch{}throw{code:'http',status:r.status,message:m}}
  return r.json();
}
async function connectSheets(){
  if(DEMO){toast('Not available in preview mode','Connect Firebase to use Google Sheets.');return}
  const user=fb&&fb.auth.currentUser;if(!user)return;
  const p=new GoogleAuthProvider();p.addScope(SHEETS_SCOPE);p.setCustomParameters({login_hint:user.email||''});
  try{const r=await reauthenticateWithPopup(user,p);captureToken(r,true);
    if(!getToken()){toast('Google Sheets wasn’t allowed','Tick the Google Drive permission when Google asks, then try again.');return}
    if(!state.sheet.id)await createSheet();
    await syncSheet(true);
  }catch(e){if(e&&e.code!=='auth/popup-closed-by-user'&&e.code!=='auth/cancelled-popup-request')toast('Couldn’t connect Google Sheets',e.code==='http'?(e.message||'Google returned an error.'):friendlyAuthError(e))}
  render();
}
async function createSheet(){
  const j=await gfetch(SAPI,{method:'POST',body:JSON.stringify({properties:{title:`Ironday – ${displayName()||'my training'}`},sheets:TABS.map(t=>({properties:{title:t,gridProperties:{frozenRowCount:1}}}))})});
  state.sheet.id=j.spreadsheetId;state.sheet.url=j.spreadsheetUrl;state.sheet.last=0;save();
}
async function ensureTabs(id){
  const j=await gfetch(`${SAPI}/${id}?fields=sheets.properties.title`);
  const have=new Set((j.sheets||[]).map(s=>s.properties.title)),add=TABS.filter(t=>!have.has(t));
  if(add.length)await gfetch(`${SAPI}/${id}:batchUpdate`,{method:'POST',body:JSON.stringify({requests:add.map(t=>({addSheet:{properties:{title:t,gridProperties:{frozenRowCount:1}}}}))})});
}
async function syncSheet(manual){
  const id=state.sheet&&state.sheet.id;if(!id)return;
  if(sheetBusy){sheetAgain=true;return}
  sheetBusy=true;sheetMsg='Syncing…';refreshSheetUI();
  try{
    await ensureTabs(id);const T=tables();
    await gfetch(`${SAPI}/${id}/values:batchClear`,{method:'POST',body:JSON.stringify({ranges:TABS.map(qTab)})});
    await gfetch(`${SAPI}/${id}/values:batchUpdate`,{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data:TABS.map(n=>({range:qTab(n)+'!A1',values:T[n]}))})});
    state.sheet.last=Date.now();sheetMsg='';lsSet(state);clearTimeout(saveTimer);saveTimer=setTimeout(pushCloud,1000);
    if(manual)toast('Google Sheet updated','Your spreadsheet matches Ironday.');
  }catch(e){
    sheetMsg=e.code==='no-token'?'Paused: Google sign-ins for Sheets last one hour. Reconnect to keep syncing.':e.status===403?'Ironday isn’t allowed to edit Google Drive files. Reconnect and allow the Google Drive permission.':e.status===404?'The spreadsheet was deleted or you lost access. Create a new one.':`Sync failed: ${e.message||'network error'}`;
    if(manual)toast('Couldn’t sync Google Sheet',sheetMsg);
  }finally{sheetBusy=false;refreshSheetUI();if(sheetAgain){sheetAgain=false;queueSheetSync()}}
}
function queueSheetSync(){if(!state.sheet||!state.sheet.id||!state.sheet.auto||!getToken())return;clearTimeout(sheetTimer);sheetTimer=setTimeout(()=>syncSheet(false),5000)}
function sheetLine(){if(sheetMsg)return sheetMsg;if(!state.sheet.id)return'';const tok=getToken();return(state.sheet.last?`Last synced ${new Date(state.sheet.last).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'})}. `:'Not synced yet. ')+(tok?(state.sheet.auto?'Updates automatically while Ironday is open.':'Automatic sync is off.'):'Reconnect to sync again.')}
function refreshSheetUI(){const l=$('#sheetLine');if(l)l.textContent=sheetLine();const a=document.activeElement;if(route()==='account'&&!(a&&/INPUT|SELECT|TEXTAREA/.test(a.tagName))&&!sheetBusy)render()}

/* ---------- derived ---------- */
function effDay(s){return state.overrides[s]||state.plan[dkOf(s)]}
const SHORT={'shoulders-triceps':'Shoulders + Tri','chest-triceps':'Chest + Tri','chest-biceps':'Chest + Bi','back-biceps':'Back + Bi',legs:'Legs',arms:'Arms',full:'Full body','cardio-core':'Cardio + Core',rest:'Rest'};
function shortName(day){return SHORT[day.split]||dayName(day)}
function dayName(day){return day.split==='custom'?(day.name||'Custom workout'):SPLIT[day.split].name}
function splitOf(day){return SPLIT[day.split]||SPLIT.custom}
function sessionsOn(s){return state.sessions.filter(x=>x.date===s)}
function estMin(day){return Math.round(day.exercises.reduce((a,e)=>a+(+e.sets||0),0)*2.6+8)}
function setsCount(day){return day.exercises.reduce((a,e)=>a+(+e.sets||0),0)}
function calcStreak(){
  if(!state.sessions.length)return 0;const dates=new Set(state.sessions.map(s=>s.date));
  let k=iso(),count=0,has=false;
  if(!dates.has(k)&&effDay(k).split!=='rest')k=addDays(k,-1);
  for(let i=0;i<400;i++){
    if(dates.has(k)){count++;has=true}
    else if(k>=state.created&&effDay(k).split==='rest')count++;
    else break;
    k=addDays(k,-1);
  }
  return has?count:0;
}
function foodTotals(s){return(state.food[s]||[]).reduce((t,e)=>({kcal:t.kcal+e.kcal,p:t.p+e.p,c:t.c+e.c,f:t.f+e.f}),{kcal:0,p:0,c:0,f:0})}
function sessionsSince(s){return state.sessions.filter(x=>x.date>=s)}
function bestLift(name){
  const n=(name||'').toLowerCase().trim();let best=0;if(!n)return 0;
  state.sessions.forEach(s=>s.exercises.forEach(e=>{if(e.name.toLowerCase().includes(n))e.sets.forEach(x=>{const w=parseFloat(x.w);if(w>best)best=w})}));
  return best;
}
function lastFor(name){
  for(let i=state.sessions.length-1;i>=0;i--){const e=state.sessions[i].exercises.find(x=>x.name===name);if(e&&e.sets.length){const top=e.sets.reduce((a,b)=>(parseFloat(b.w)||0)>(parseFloat(a.w)||0)?b:a);return top}}
  return null;
}
function volume(sess){return sess.exercises.reduce((a,e)=>a+e.sets.reduce((b,x)=>b+(parseFloat(x.w)||0)*(parseFloat(x.r)||0),0),0)}
function goalProgress(g){
  if(g.type==='weekly'){const c=sessionsSince(mondayIso()).length;return{pct:c/g.target,label:`${c} of ${g.target} workouts this week`}}
  if(g.type==='lift'){const b=bestLift(g.exercise);return{pct:b/g.target,label:b?`Best logged: ${b} kg of ${g.target} kg`:`No ${g.exercise} sets logged yet`}}
  if(g.type==='weight'){
    if(!state.weights.length)return{pct:0,label:'Log your body weight to track this goal'};
    const cur=state.weights[state.weights.length-1].kg,start=g.start??state.weights[0].kg,tot=start-g.target;
    const pct=tot===0?1:(start-cur)/tot;return{pct,label:`${cur} kg now, started at ${start} kg, target ${g.target} kg`};
  }
  return{pct:(g.current||0)/(g.target||1),label:`${g.current||0} of ${g.target} ${g.unit||''}`.trim()};
}

/* ---------- smart notifications ---------- */
function computeAlerts(now=new Date()){
  const out=[],t=iso(now),day=effDay(t),h=now.getHours()+now.getMinutes()/60,n=state.notif;
  const done=sessionsOn(t).length>0,T=state.targets,tot=foodTotals(t),water=state.water[t]||0,food=state.food[t]||[];
  if(day.split!=='rest'&&!done&&!state.active&&n.workout&&day.remind){
    const [hh,mm]=day.time.split(':').map(Number),wt=hh+mm/60;
    if(h>=wt-n.lead/60&&h<wt+3)out.push({id:`wk-${t}`,kind:'workout',plate:splitOf(day).plate,title:`${dayName(day)} at ${fmtTime(day.time)}`,body:`${day.exercises.length} exercises, ${setsCount(day)} sets, about ${estMin(day)} minutes. Fill your water bottle.`,act:'start',actLabel:'Start workout'});
    else if(h>=wt+3&&h<23)out.push({id:`miss-${t}`,kind:'workout',plate:'red',title:`Today's ${dayName(day)} is still open`,body:'Short on time? Do the first two exercises. A short session still counts toward your streak.',act:'start',actLabel:'Start now'});
  }
  const streak=calcStreak();
  if(n.streak&&streak>=2&&day.split!=='rest'&&!done&&h>=19&&h<23.5)out.push({id:`streak-${t}`,kind:'streak',plate:'red',title:`Your ${streak}-day streak ends tonight`,body:'Log any workout before midnight to keep it alive.',act:'start',actLabel:'Start workout'});
  if(n.meals&&h>=13.5&&h<17&&!food.some(e=>e.meal==='lunch'))out.push({id:`lunch-${t}`,kind:'meal',plate:'green',title:'Lunch not logged yet',body:'Log what you ate so your calorie and protein numbers stay accurate.',act:'food',actLabel:'Log lunch'});
  if(n.meals&&h>=15&&tot.p<T.p*0.5)out.push({id:`protein-${t}`,kind:'meal',plate:'green',title:`${fmt(tot.p)} g of ${T.p} g protein so far`,body:'A whey shake adds about 24 g. Greek yogurt adds about 17 g.',act:'food',actLabel:'Add food'});
  if(n.water&&h>=10&&h<21){const exp=Math.floor(T.water*(h-8)/13);if(water<exp-1)out.push({id:`water-${t}-${Math.floor(h/2)}`,kind:'water',plate:'blue',title:`Drink some water: ${water} of ${T.water} glasses`,body:`You'd usually be around ${exp} by now. Have a glass before your next task.`,act:'water',actLabel:'Add a glass'})}
  if(n.milestones)state.goals.forEach(g=>{const p=goalProgress(g).pct;const m=p>=1?100:p>=.75?75:p>=.5?50:0;if(m)out.push({id:`goal-${g.id}-${m}`,kind:'goal',plate:'yellow',title:m===100?`Goal reached: ${g.title}`:`${m}% of the way: ${g.title}`,body:m===100?'Set a new target on the Goals tab to keep progressing.':'Keep the routine steady. You are closer than you were last week.',act:'goals',actLabel:'See goals'})});
  if(n.preview&&h>=20.5){const tm=addDays(t,1),td=effDay(tm);out.push({id:`tmr-${t}`,kind:'preview',plate:splitOf(td).plate,title:td.split==='rest'?'Tomorrow is a rest day':`Tomorrow: ${dayName(td)}${td.remind?' at '+fmtTime(td.time):''}`,body:td.split==='rest'?'Sleep well and let your muscles recover.':'Sleep 7 to 9 hours tonight so you can lift well tomorrow.',act:'plan',actLabel:'View plan'})}
  return out;
}
let sysOK=false;try{sysOK='Notification' in window&&Notification.permission==='granted'}catch{}
async function sysNotify(a){try{if(!state.notif.system||!('Notification' in window)||Notification.permission!=='granted')return;const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();if(reg)await reg.showNotification(a.title,{body:a.body,icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:a.id||'ironday'});else new Notification(a.title,{body:a.body})}catch{}}
function tickAlerts(){
  if(phase!=='app')return;
  const fresh=computeAlerts().filter(a=>!state.seen[a.id]);if(!fresh.length)return;
  fresh.forEach(a=>{state.seen[a.id]=Date.now();state.inbox.unshift({id:a.id,kind:a.kind,plate:a.plate,title:a.title,body:a.body,act:a.act,actLabel:a.actLabel,at:Date.now(),read:false});toast(a.title,a.body,a.act?{label:a.actLabel,act:a.act}:null);sysNotify(a)});
  save();updateUnread();if(['today','alerts'].includes(route()))render();
}
function updateUnread(){const n=state.inbox.filter(i=>!i.read).length;document.querySelectorAll('.unread-count').forEach(el=>{el.textContent=n;el.hidden=!n});const b=$('#bellBtn');if(b)b.setAttribute('aria-label',n?`Alerts, ${n} unread`:'Alerts')}

/* ---------- toasts / sound ---------- */
function toast(title,body,action){
  const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');
  el.innerHTML=`<b>${esc(title)}</b>${body?`<p>${esc(body)}</p>`:''}${action?`<div class="row"><button class="btn sm" data-act="alertGo" data-go="${esc(action.act)}">${esc(action.label)}</button></div>`:''}`;
  $('#toasts').prepend(el);setTimeout(()=>el.remove(),action?9000:4500);
}
let actx=null;
function beep(){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();[0,.25,.5].forEach(t=>{const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=880;g.gain.setValueAtTime(.0001,actx.currentTime+t);g.gain.exponentialRampToValueAtTime(.3,actx.currentTime+t+.02);g.gain.exponentialRampToValueAtTime(.0001,actx.currentTime+t+.18);o.connect(g).connect(actx.destination);o.start(actx.currentTime+t);o.stop(actx.currentTime+t+.2)})}catch{}}

/* ---------- small renderers ---------- */
function ring(pct,label,val,sub,plate){
  const r=42,c=2*Math.PI*r,off=c*(1-clamp(pct,0,1));
  return`<div class="ring p-${plate}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" class="track"/><circle cx="50" cy="50" r="${r}" class="fill" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 50 50)"/></svg><div class="ring-txt"><b class="num">${val}</b><span>${sub}</span></div><div class="ring-label">${label}</div></div>`;
}
function bar(pct,plate){return`<div class="bar p-${plate}${pct>1.05?' over':''}"><i style="width:${(clamp(pct,0,1)*100).toFixed(1)}%"></i></div>`}
const ICON={
  workout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>',
  streak:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 2 1 3 3 3 3s1-3 0-7z"/></svg>',
  meal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2 6 0 8v10"/></svg>',
  water:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>',
  goal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></svg>',
  preview:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/></svg>'
};
function alertRow(a,inbox){
  return`<div class="alert p-${a.plate}${inbox&&!a.read?' unread':''}"><div class="alert-ico" aria-hidden="true">${ICON[a.kind]||ICON.goal}</div><div class="alert-body"><b>${esc(a.title)}</b><p>${esc(a.body)}</p>${inbox?`<span class="muted" style="font-size:.8rem">${new Date(a.at).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'})}</span>`:''}</div>${a.act?`<button class="btn sm" data-act="alertGo" data-go="${esc(a.act)}">${esc(a.actLabel)}</button>`:''}</div>`;
}

/* ---------- views ---------- */
function vToday(){
  const now=new Date(),t=iso(now),dk=dkOf(t),day=effDay(t),sp=splitOf(day),done=sessionsOn(t),streak=calcStreak();
  const T=state.targets,tot=foodTotals(t),water=state.water[t]||0,alerts=computeAlerts(now);
  const hr=now.getHours(),greet=hr<12?'Good morning':hr<18?'Good afternoon':'Good evening';
  const nm=state.privacy.greetName&&displayName()?`, ${esc(displayName().split(' ')[0])}`:'';
  const quote=QUOTES[Math.floor(fromIso(t).getTime()/864e5)%QUOTES.length];
  let actions,meta;
  if(state.active){actions=`<button class="btn primary" data-act="go" data-go="session">Resume workout</button>`;meta=`<span><b>In progress</b> since ${new Date(state.active.startedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span>`}
  else if(done.length){const s=done[done.length-1];actions=`<button class="btn" data-act="editToday">Log another workout</button>`;meta=`<span><b>Done.</b> ${plural(s.exercises.reduce((a,e)=>a+e.sets.length,0),'set')}, ${fmt(volume(s))} kg moved, ${Math.max(1,Math.round((s.endedAt-s.startedAt)/6e4))} min</span>`}
  else if(day.split==='rest'){actions=`<button class="btn" data-act="editToday">Train anyway</button>`;meta=`<span>A 20-minute walk and some stretching help your muscles rebuild.</span>`}
  else{actions=`<button class="btn primary" data-act="start">Start workout</button><button class="btn" data-act="editToday">Change today's workout</button>`;meta=`<span><b>${day.exercises.length}</b> exercises</span><span><b>${setsCount(day)}</b> sets</span><span>about <b>${estMin(day)}</b> min</span>${day.remind?`<span>reminder <b>${fmtTime(day.time)}</b></span>`:''}`}
  const monday=mondayIso(t);
  const week=DAYS.map((d,i)=>{const k=addDays(monday,i),dd=effDay(k),s=splitOf(dd),did=sessionsOn(k).length>0;
    const st=did?'<span class="st" style="color:var(--good)">Done</span>':k===t?'<span class="st" style="color:var(--accent)">Today</span>':dd.split==='rest'?'<span class="st muted">Rest</span>':k<t?'<span class="st" style="color:var(--bad)">Missed</span>':`<span class="st muted">${dd.remind?fmtTime(dd.time):''}</span>`;
    return`<button class="wd p-${s.plate}${k===t?' today':''}" data-act="openDay" data-dk="${d}" aria-label="${DAY_NAMES[d]}: ${esc(dayName(dd))}"><span class="d">${d}</span><span class="s">${esc(shortName(dd))}</span>${st}</button>`}).join('');
  const sub=state.active?'Your workout is in progress.':done.length?'Great work today. Recover well.':day.split==='rest'?'Rest day. Let your muscles rebuild.':'Ready to crush your goals?';
  return`
  <div class="topbar">
    <a class="icon-btn" id="bellBtn" href="#alerts" aria-label="Alerts"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><span class="badge-count unread-count" hidden>0</span></a>
    <div class="hello"><b>${greet}${nm}</b><span>${sub}</span></div>
    <a class="avatar-link" href="#account" aria-label="Profile and settings">${avatarImg()}</a>
  </div>
  <section class="hero p-${sp.plate}">
    <div class="hero-char">${character(...castFor(day),dayName(day)+' illustration')}</div>
    <div class="spread" style="max-width:100%"><span class="eyebrow">${DAY_NAMES[dk]}, ${fmtDate(t,{month:'long',day:'numeric'})}</span><span class="streak"><b class="num">${streak}</b>day streak</span></div>
    <h1 class="split-title">${esc(dayName(day))}</h1>
    <p class="quote">${esc(quote)}</p>
    <div class="hero-meta">${meta}</div>
    <div class="row">${actions}</div>
  </section>
  <section><div class="card-head"><h2>This week</h2><a class="btn ghost sm" href="#plan">Edit weekly split</a></div><div class="week">${week}</div></section>
  <div class="grid g2">
    <section class="card"><div class="card-head"><h2>Fuel today</h2><a class="btn ghost sm" href="#food">Log food</a></div>
      <div class="rings">${ring(tot.kcal/T.kcal,'Calories',fmt(tot.kcal),`of ${fmt(T.kcal)}`,'red')}${ring(tot.p/T.p,'Protein',fmt(tot.p)+'g',`of ${T.p} g`,'green')}
      <div class="ring" style="width:auto;align-items:flex-start;gap:10px"><span class="lbl">Water</span><div class="glasses">${Array.from({length:T.water},(_,i)=>`<button class="glass${i<water?' full':''}" data-act="water" data-n="${i+1}" aria-label="Set water to ${i+1} glasses"></button>`).join('')}</div><span class="muted num">${water} of ${T.water} glasses</span></div></div>
    </section>
    <section class="card"><div class="card-head"><h2>Smart alerts</h2><a class="btn ghost sm" href="#alerts">Settings</a></div>
      ${alerts.length?alerts.slice(0,3).map(a=>alertRow(a)).join(''):`<p class="empty">Nothing needs your attention right now. Reminders for your workout, meals, water and streak show up here and as pop-ups while Ironday is open.</p>`}
    </section>
  </div>`;
}

function vPlan(){
  const t=iso(),tk=dkOf(t);
  const cards=DAYS.map(d=>{const day=state.plan[d],s=splitOf(day);
    const list=day.exercises.slice(0,5).map(e=>`<li><span>${esc(e.name)}</span><span class="num">${esc(e.sets)} × ${esc(e.reps)}</span></li>`).join('')+(day.exercises.length>5?`<li class="muted">+${day.exercises.length-5} more</li>`:'');
    return`<article class="day p-${s.plate}${d===tk?' today':''}"><div class="day-char" aria-hidden="true">${character(...castFor(day))}</div><span class="eyebrow">${DAY_NAMES[d]}${d===tk?' · today':''}</span><h3>${esc(dayName(day))}</h3>
      ${day.split==='rest'?'<p class="muted">Recovery. Walk, stretch, sleep well.</p>':`<ul>${list||'<li class="muted">No exercises yet</li>'}</ul>`}
      <div class="day-foot"><span class="pill${day.remind?' good':''}">${day.split==='rest'?'No reminder':day.remind?'Reminder '+fmtTime(day.time):'Reminder off'}</span><button class="btn sm" data-act="openDay" data-dk="${d}">Edit</button></div></article>`}).join('');
  const hist=state.sessions.slice(-12).reverse();
  return`
  <div class="page-head"><div class="ttl"><div class="ch p-green" aria-hidden="true">${character('lunge','a')}</div><div><span class="eyebrow">Workout management</span><h2>Weekly split</h2></div></div>${state.active?'<button class="btn primary" data-act="go" data-go="session">Resume workout</button>':'<button class="btn primary" data-act="start">Start today’s workout</button>'}</div>
  ${state.starter?`<div class="banner"><span>This is a starter split. Pick what you want to train on each day, and set a reminder time for it.</span><button class="btn sm" data-act="hideStarter">Got it</button></div>`:''}
  <div class="days">${cards}</div>
  <section class="card"><div class="card-head"><h2>Workout history</h2><span class="muted">${state.sessions.length} logged</span></div>
    ${hist.length?`<div class="scroll-x"><table class="hist"><thead><tr><th>Date</th><th>Workout</th><th>Sets</th><th>Volume</th><th>Time</th></tr></thead><tbody>${hist.map(s=>`<tr><td>${fmtDate(s.date)}</td><td>${esc(s.name)}</td><td>${s.exercises.reduce((a,e)=>a+e.sets.length,0)}</td><td>${fmt(volume(s))} kg</td><td>${Math.max(1,Math.round((s.endedAt-s.startedAt)/6e4))} min</td></tr>`).join('')}</tbody></table></div>`:`<p class="empty">Finished workouts appear here with sets, total kilograms lifted and duration. Start today's workout to log your first one.</p>`}
  </section>`;
}

function vSession(){
  const a=state.active;if(!a){location.hash='#today';return''}
  const total=a.exercises.reduce((x,e)=>x+e.sets.length,0),dn=a.exercises.reduce((x,e)=>x+e.sets.filter(s=>s.done).length,0);
  return`
  <div class="session-head"><div class="row" style="flex-wrap:nowrap;gap:14px"><div class="ch p-${(SPLIT[a.split]||SPLIT.custom).plate}" aria-hidden="true">${character(...(CAST[a.split]||CAST.custom))}</div><div><span class="eyebrow">Workout in progress</span><h1>${esc(a.name)}</h1></div></div>
    <div class="row" style="gap:24px"><div><span class="lbl">Time</span><div class="big-num num" id="elapsed">0:00</div></div><div><span class="lbl">Sets done</span><div class="big-num num">${dn}/${total}</div></div></div></div>
  ${a.exercises.map((e,ei)=>{const last=lastFor(e.name);return`<article class="card ex"><div class="ex-head"><h3>${esc(e.name)}</h3><span class="muted" style="font-size:.9rem">Target ${esc(e.target)}${last?` · Last time ${esc(last.w)} kg × ${esc(last.r)}`:''}</span></div>
    <div class="scroll-x"><table class="sets"><thead><tr><th>Set</th><th>kg</th><th>Reps</th><th>Done</th></tr></thead><tbody>
    ${e.sets.map((s,si)=>`<tr class="${s.done?'done':''}"><td>${si+1}</td><td><input id="w-${ei}-${si}" inputmode="decimal" aria-label="Weight in kg, set ${si+1}" data-in="setW" data-e="${ei}" data-s="${si}" value="${esc(s.w)}" placeholder="0"></td><td><input id="r-${ei}-${si}" inputmode="numeric" aria-label="Reps, set ${si+1}" data-in="setR" data-e="${ei}" data-s="${si}" value="${esc(s.r)}" placeholder="0"></td><td><button class="tick${s.done?' on':''}" data-act="tick" data-e="${ei}" data-s="${si}" aria-pressed="${s.done}" aria-label="Mark set ${si+1} done">✓</button></td></tr>`).join('')}
    </tbody></table></div><div class="row"><button class="btn sm ghost" data-act="addSet" data-e="${ei}">+ Add set</button>${e.sets.length>1?`<button class="btn sm ghost" data-act="rmSet" data-e="${ei}">Remove last set</button>`:''}</div></article>`}).join('')}
  <div class="session-bar"><div class="row"><span class="lbl">Rest</span><span class="rest num" id="rest">--</span><div class="seg">${[60,90,120].map(s=>`<button data-act="rest" data-s="${s}" class="${state.notif.rest===s?'on':''}">${s}s</button>`).join('')}</div></div>
    <div class="row"><button class="btn danger sm" data-act="discard" id="discardBtn">Discard</button><button class="btn primary" data-act="finish">Finish workout</button></div></div>`;
}

let foodDate=iso();
function vFood(){
  const d=foodDate,T=state.targets,tot=foodTotals(d),items=state.food[d]||[],water=state.water[d]||0,left=T.kcal-tot.kcal,isToday=d===iso();
  const macro=(k,label,plate)=>`<div class="macro"><div class="spread"><span class="lbl">${label}</span><span class="num"><b>${fmt(tot[k])}</b> / ${T[k]} g</span></div>${bar(tot[k]/T[k],plate)}</div>`;
  return`
  <div class="page-head"><div class="ttl"><div class="ch p-red" aria-hidden="true">${character('run','b')}</div><div><span class="eyebrow">Nutrition &amp; food tracker</span><h2>${isToday?'Today':fmtDate(d,{weekday:'long',month:'long',day:'numeric'})}</h2></div></div>
    <div class="date-nav"><button class="btn sm" data-act="fday" data-n="-1" aria-label="Previous day">‹ Prev</button>${isToday?'':'<button class="btn sm" data-act="fday" data-n="0">Today</button>'}<button class="btn sm" data-act="fday" data-n="1" ${isToday?'disabled':''} aria-label="Next day">Next ›</button></div></div>
  <div class="grid g2">
    <section class="card"><div class="card-head"><h2>Calories</h2><span class="pill ${left<0?'bad':'good'}">${left<0?fmt(-left)+' over':fmt(left)+' left'}</span></div>
      <div class="row" style="gap:28px;align-items:flex-end;margin-bottom:16px"><div><div class="kcal-big num">${fmt(tot.kcal)}</div><span class="muted">of ${fmt(T.kcal)} kcal eaten</span></div></div>
      ${bar(tot.kcal/T.kcal,'red')}
      <div class="grid" style="margin-top:18px;gap:12px">${macro('p','Protein','green')}${macro('c','Carbs','yellow')}${macro('f','Fat','blue')}</div>
    </section>
    <section class="card"><div class="card-head"><h2>Water</h2><span class="muted num">${water} of ${T.water} glasses</span></div>
      <div class="glasses" style="gap:10px">${Array.from({length:Math.max(T.water,water)},(_,i)=>`<button class="glass${i<water?' full':''}" style="width:34px;height:44px" data-act="water" data-n="${i+1}" data-date="${d}" aria-label="Set water to ${i+1} glasses"></button>`).join('')}</div>
      <div class="row" style="margin-top:16px"><button class="btn sm" data-act="waterAdd" data-date="${d}">+ 1 glass</button><button class="btn sm ghost" data-act="waterSub" data-date="${d}">− 1</button></div>
      <p class="muted" style="margin-top:14px;font-size:.92rem">One glass is about 250 ml. Drink more on training days and in hot weather.</p>
    </section>
  </div>
  <div class="grid g2">${MEALS.map(([k,label])=>{const es=items.filter(e=>e.meal===k),kc=es.reduce((a,e)=>a+e.kcal,0);
    return`<section class="card meal"><div class="card-head" style="margin-bottom:4px"><h3>${label} <span class="muted num" style="font-family:var(--f-body);font-size:.9rem;font-weight:500">${fmt(kc)} kcal</span></h3><button class="btn sm" data-act="addFood" data-meal="${k}">+ Add</button></div>
      ${es.length?es.map(e=>`<div class="food-row"><span class="nm">${esc(e.name)}</span><span class="row" style="gap:6px;flex-wrap:nowrap"><span class="mx">${fmt(e.kcal)} kcal · P ${fmt(e.p)} · C ${fmt(e.c)} · F ${fmt(e.f)}</span><button class="xbtn" data-act="rmFood" data-id="${e.id}" aria-label="Remove ${esc(e.name)}">×</button></span></div>`).join(''):`<p class="empty" style="padding:6px 0">Nothing logged.</p>`}
    </section>`}).join('')}</div>`;
}

function weightChart(){
  const w=state.weights.slice(-30);if(w.length<2)return`<p class="empty">Log your weight on two different days to see your trend line.</p>`;
  const W=340,H=130,pl=38,pr=40,pt=14,pb=22;let mn=Math.min(...w.map(x=>x.kg)),mx=Math.max(...w.map(x=>x.kg));if(mx-mn<1){mx+=.5;mn-=.5}
  const x=i=>pl+i/(w.length-1)*(W-pl-pr),y=v=>pt+(1-(v-mn)/(mx-mn))*(H-pt-pb);
  const pts=w.map((p,i)=>`${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const last=w[w.length-1];
  return`<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Body weight trend from ${w[0].kg} to ${last.kg} kg">
    ${[mx,(mx+mn)/2,mn].map(v=>`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl-6}" y="${y(v)+3}" text-anchor="end">${v.toFixed(1)}</text>`).join('')}
    <polygon points="${x(0)},${H-pb} ${pts} ${x(w.length-1)},${H-pb}" fill="var(--accent)" opacity=".12"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(w.length-1)}" cy="${y(last.kg)}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
    <text x="${x(w.length-1)+8}" y="${y(last.kg)+4}" style="fill:var(--ink);font-weight:700">${last.kg}</text>
    <text x="${pl}" y="${H-6}">${fmtDate(w[0].date,{month:'short',day:'numeric'})}</text><text x="${W-pr}" y="${H-6}" text-anchor="end">${fmtDate(last.date,{month:'short',day:'numeric'})}</text>
  </svg></div>`;
}
function weeksChart(){
  const wk=state.goals.find(g=>g.type==='weekly'),tgt=wk?wk.target:4,m=mondayIso();
  const data=Array.from({length:8},(_,i)=>{const s=addDays(m,-7*(7-i)),e=addDays(s,7);return{s,n:state.sessions.filter(x=>x.date>=s&&x.date<e).length}});
  const W=340,H=130,pl=24,pb=22,pt=12,max=Math.max(tgt,...data.map(d=>d.n),1),bw=(W-pl-8)/8;
  const y=v=>pt+(1-v/max)*(H-pt-pb);
  return`<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Workouts per week, last 8 weeks">
    <line x1="${pl}" x2="${W-8}" y1="${y(tgt)}" y2="${y(tgt)}" stroke="var(--yellow)" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${pl-4}" y="${y(tgt)+3}" text-anchor="end">${tgt}</text><text x="${pl-4}" y="${y(0)+3}" text-anchor="end">0</text>
    ${data.map((d,i)=>`<rect x="${pl+i*bw+bw*.18}" y="${y(d.n)}" width="${bw*.64}" height="${Math.max(0,y(0)-y(d.n))}" rx="3" fill="${d.n>=tgt?'var(--green)':'var(--accent)'}" opacity="${i===7?1:.75}"/>${d.n?`<text x="${pl+i*bw+bw/2}" y="${y(d.n)-4}" text-anchor="middle" style="fill:var(--ink)">${d.n}</text>`:''}<text x="${pl+i*bw+bw/2}" y="${H-6}" text-anchor="middle">${i===7?'This wk':fmtDate(d.s,{month:'numeric',day:'numeric'})}</text>`).join('')}
    <line x1="${pl}" x2="${W-8}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>
  </svg></div>`;
}
function badges(){
  const s=state.sessions,T=state.targets,streak=calcStreak();
  const protein=Object.keys(state.food).some(k=>foodTotals(k).p>=T.p),hyd=Object.values(state.water).some(v=>v>=T.water);
  const weeks={};s.forEach(x=>{const m=mondayIso(x.date);weeks[m]=(weeks[m]||0)+1});
  return[
    ['First rep','Log your first workout',s.length>=1,'red'],['Ten strong','Log 10 workouts',s.length>=10,'blue'],
    ['Week warrior','Reach a 7-day streak',streak>=7,'yellow'],['Full week','Train 4 times in one week',Object.values(weeks).some(v=>v>=4),'green'],
    ['Protein pro','Hit your protein target',protein,'green'],['Hydrated','Drink all your water in a day',hyd,'blue']
  ];
}
function vGoals(){
  const T=state.targets;
  return`
  <div class="page-head"><div class="ttl"><div class="ch p-yellow" aria-hidden="true">${character('flex','c')}</div><div><span class="eyebrow">Personal fitness goals</span><h2>Goals &amp; progress</h2></div></div></div>
  <div class="grid g2">
    <section class="card"><div class="card-head"><h2>Your goals</h2><button class="btn sm primary" data-act="addGoal">+ New goal</button></div>
      ${state.goals.length?state.goals.map(g=>{const p=goalProgress(g),pc=clamp(p.pct,0,1);return`<div class="goal"><div class="spread"><b>${esc(g.title)}</b><span class="row" style="gap:4px"><span class="pill ${pc>=1?'good':''}">${Math.round(pc*100)}%</span><button class="xbtn" data-act="rmGoal" data-id="${g.id}" aria-label="Delete goal ${esc(g.title)}">×</button></span></div>${bar(pc,pc>=1?'green':'blue')}<span class="muted" style="font-size:.9rem">${esc(p.label)}</span>
        ${g.type==='custom'?`<div class="row"><input type="number" id="gc-${g.id}" style="max-width:120px" value="${esc(g.current||0)}" data-ch="goalCur" data-id="${g.id}" aria-label="Current value"><span class="muted">${esc(g.unit||'')} now</span></div>`:''}</div>`}).join(''):`<p class="empty">Set a goal like "Bench press 80 kg" or "Reach 70 kg body weight" and Ironday tracks it from your logs.</p>`}
    </section>
    <section class="card"><div class="card-head"><h2>Body weight</h2><span class="muted">${state.weights.length?state.weights[state.weights.length-1].kg+' kg latest':''}</span></div>
      ${weightChart()}
      <div class="row" style="margin-top:14px;flex-wrap:nowrap"><input type="number" step="0.1" id="wIn" placeholder="Today's weight in kg" aria-label="Today's weight in kg"><button class="btn primary" data-act="logWeight">Log</button></div>
    </section>
  </div>
  <div class="grid g2">
    <section class="card"><div class="card-head"><h2>Consistency</h2><span class="muted">workouts per week</span></div>${weeksChart()}</section>
    <section class="card"><div class="card-head"><h2>Daily targets</h2><span class="muted">used by the nutrition tracker</span></div>
      <div class="form-grid">${[['kcal','Calories','kcal'],['p','Protein','g'],['c','Carbs','g'],['f','Fat','g']].map(([k,l,u])=>`<div class="field"><label for="t-${k}">${l} (${u})</label><input type="number" id="t-${k}" value="${T[k]}" data-ch="target" data-k="${k}"></div>`).join('')}</div>
      <div class="form-grid" style="margin-top:10px"><div class="field"><label for="t-water">Water (glasses)</label><input type="number" id="t-water" value="${T.water}" min="1" max="20" data-ch="target" data-k="water"></div><div class="field" style="grid-column:span 3"><label for="pName">Your name</label><input type="text" id="pName" value="${esc(state.profile.name)}" placeholder="Shown in your greeting" data-ch="pname"></div></div>
      <p class="muted" style="font-size:.88rem;margin-top:12px">A common starting point for building muscle is 1.6 to 2.2 g of protein per kg of body weight.</p>
    </section>
  </div>
  <section class="card"><div class="card-head"><h2>Badges</h2><span class="muted">${badges().filter(b=>b[2]).length} of 6 earned</span></div>
    <div class="badges">${badges().map(([n,d,ok,pl])=>`<div class="bdg p-${pl}${ok?'':' locked'}"><span class="coin" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg></span><b>${n}</b><span class="muted">${d}</span></div>`).join('')}</div></section>`;
}

function displayName(){return(state.profile.name||'').trim()||(me&&me.name)||''}
function avatarSrc(){return state.profile.photo||(me&&me.avatarUrl)||''}
function avatarImg(cls){const s=avatarSrc();return s&&/^(https:|data:image\/)/.test(s)?`<img class="avatar ${cls||''}" src="${esc(s)}" alt="" referrerpolicy="no-referrer">`:`<span class="avatar initials ${cls||''}" aria-hidden="true">${esc((displayName()||'?').trim().charAt(0).toUpperCase())}</span>`}
const APK_URL='https://github.com/Jasperolino/ironday/releases/latest/download/ironday.apk';
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const ANDROID_ICON='<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22a11.5 11.5 0 0 0-9.84 0L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg>';
function getAppHtml(){if(isStandalone())return'';return isIOS()?'<p class="muted small get-app">On iPhone: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b> to install Ironday.</p>':'<a class="btn big get-app" href="'+APK_URL+'" rel="noopener">'+ANDROID_ICON+'<span>Download for Android</span></a>'}
const GOOGLE_G='<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

function vGate(){
  let body;
  if(phase==='loading')body=`<p class="muted">Loading your account…</p>`;
  else if(phase==='setup')body=`<div class="notice warn" style="text-align:left"><b>Almost ready.</b> Add your Firebase settings to <code>firebase-config.js</code> to turn on Google Sign-In. The README explains each step.</div>${LOCALHOST?'<a class="btn big" href="?demo#today">Preview on this computer</a><p class="muted small">Preview mode saves to this browser only and skips sign-in.</p>':''}`;
  else body=`<button class="btn google big" data-act="signIn">${GOOGLE_G}<span>Continue with Google</span></button>
    ${gateError?`<p class="small" style="color:var(--bad)">${esc(gateError)}</p>`:''}
    <p class="muted small">Your workouts, meals and goals are saved to your own private account. Other people who use Ironday can't see them.</p>${getAppHtml()}<a class="small" href="guide.html" style="color:var(--accent);font-weight:700">New here? See how Ironday works</a>`;
  return`<section class="gate"><div class="gate-card"><div class="gate-char p-green">${character('lunge','a','Ironday')}</div>
    <div class="brand" style="margin:0;padding:0"><span class="brand-mark" aria-hidden="true"></span>Ironday</div>
    <h1>Your <em>fitness</em> journey starts here</h1><p class="muted">Plan your weekly split, log every set, track your food and reach your goals.</p>${body}</div></section>`;
}

function vAlerts(){
  return`
  <div class="page-head"><div class="ttl"><a class="icon-btn" href="#today" aria-label="Back to Today"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a><div class="ch p-blue" aria-hidden="true">${character('meditate','a')}</div><div><span class="eyebrow">Smart notifications</span><h2>Alerts</h2></div></div><button class="btn sm" data-act="goSettings" data-sec="notifications">Reminder settings</button></div>
  <section class="card"><div class="card-head"><h2>Inbox</h2>${state.inbox.some(i=>!i.read)?'<button class="btn sm ghost" data-act="readAll">Mark all read</button>':''}</div>
    ${state.inbox.length?state.inbox.slice(0,25).map(a=>alertRow(a,true)).join(''):`<p class="empty">No alerts yet. When it's time for your workout, when you're behind on protein or water, or when your streak is at risk, the alert appears here.</p>`}
  </section>`;
}

function vAccount(){
  const n=state.notif,pv=state.privacy,pr=state.prefs,sh=state.sheet,tok=getToken();
  const sw=(obj,k,label,desc,act)=>`<div class="set-row"><div><b>${label}</b><p>${desc}</p></div><button class="switch" role="switch" aria-checked="${!!obj[k]}" aria-label="${label}" data-act="${act}" data-k="${k}"></button></div>`;
  const sec=(id,title,sub,html)=>`<section class="card set-sec" id="s-${id}"><div class="card-head"><div><h2>${title}</h2>${sub?`<p class="muted" style="font-size:.95rem;margin-top:2px">${sub}</p>`:''}</div></div>${html}</section>`;
  const nav=[['profile','Profile'],['account','Account'],['sheets','Google Sheets'],['install','Phone app'],['sync','Sync & backup'],['notifications','Notifications'],['privacy','Privacy & security'],['data','Export & import'],['appearance','Appearance']];
  let sysTxt;try{sysTxt=!('Notification' in window)?(/iPhone|iPad/.test(navigator.userAgent)?'On iPhone, add Ironday to your Home Screen first (iOS 16.4 or later), then turn this on.':'This browser has no system notifications, so alerts show inside Ironday.'):Notification.permission==='granted'&&n.system?'System notifications are on for this device.':Notification.permission==='denied'?'Notifications are blocked for Ironday. Allow them in your browser or phone settings.':'Get reminders as phone or desktop notifications while Ironday is open.'}catch{sysTxt='Alerts show inside Ironday while it is open.'}
  const imp=pendingImport?`<div class="notice warn"><b>Replace your data with this backup?</b><p class="muted" style="margin:4px 0 10px">${pendingImport.sessions.length} workouts, ${Object.keys(pendingImport.food||{}).length} food days, ${(pendingImport.weights||[]).length} weigh-ins. Your current data will be overwritten.</p><div class="row"><button class="btn sm primary" data-act="confirmImport">Replace my data</button><button class="btn sm ghost" data-act="cancelImport">Cancel</button></div></div>`:'';
  const sheetUrl=sh.url&&/^https:\/\/docs\.google\.com\//.test(sh.url)?sh.url:'';
  const sheetsHtml=!sh.id?`
    <div class="set-row"><div><b>Not connected</b><p>Ironday creates a spreadsheet in your own Google Drive and keeps it updated with your workouts, sets, food, water, weight, goals and weekly plan. Ironday can only open files it creates, not the rest of your Drive.</p></div><button class="btn sm primary" data-act="connectSheets">Connect Google Sheets</button></div>`:`
    <div class="set-row"><div><b>Connected</b><p id="sheetLine">${esc(sheetLine())}</p></div><span class="pill ${tok?'good':'warn'}">${tok?'Connected':'Needs reconnect'}</span></div>
    <div class="row" style="padding:4px 0 12px">${sheetUrl?`<a class="btn sm primary" href="${esc(sheetUrl)}" target="_blank" rel="noopener">Open spreadsheet</a>`:''}${tok?'<button class="btn sm" data-act="syncSheet">Sync now</button>':'<button class="btn sm primary" data-act="connectSheets">Reconnect</button>'}</div>
    ${sw(sh,'auto','Sync automatically','Updates the sheet a few seconds after each change while Ironday is open.','sheetAuto')}
    <div class="set-row"><div><b>Start a new spreadsheet</b><p>Use this if you deleted the old one.</p></div><button class="btn sm" data-act="newSheet">Create new</button></div>
    <div class="set-row"><div><b>Disconnect</b><p>Stops syncing. The spreadsheet stays in your Google Drive.</p></div><button class="btn sm danger" data-act="disconnectSheets">Disconnect</button></div>`;
  return`
  <div class="page-head"><div class="ttl"><div class="ch p-yellow" aria-hidden="true">${character('flex','b')}</div><div><span class="eyebrow">Your account</span><h2>Settings</h2></div></div></div>
  <nav class="set-nav" aria-label="Settings sections">${nav.map(([k,l])=>`<button class="chip" data-act="jump" data-sec="${k}">${l}</button>`).join('')}</nav>

  ${sec('profile','Profile','How you appear in Ironday.',`
    <div class="profile-top">${avatarImg('lg')}<div class="row"><label class="btn sm file-btn">Upload photo<input type="file" id="photoIn" accept="image/*" data-ch="photo"></label>${state.profile.photo?'<button class="btn sm ghost" data-act="rmPhoto">Use Google photo</button>':''}</div></div>
    <div class="form-grid" style="margin-top:16px;grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="field"><label for="pName">Display name</label><input type="text" id="pName" value="${esc(state.profile.name)}" placeholder="${esc((me&&me.name)||'Your name')}" data-ch="pname"></div>
      <div class="field"><label for="pMail">Email</label><input type="text" id="pMail" value="${esc((me&&me.email)||'')}" readonly></div>
    </div>
    <p class="muted small" style="margin-top:10px">Your email comes from your Google account.</p>`)}

  ${sec('account','Account','Your Google sign-in.',`
    <div class="set-row"><div class="row" style="flex-wrap:nowrap">${avatarImg()}<div style="min-width:0"><b>${esc(displayName()||'Your account')}</b><p>${esc((me&&me.email)||'')}</p></div></div><span class="pill good">${GOOGLE_G.replace('width="20" height="20"','width="14" height="14"')} Google</span></div>
    <div class="set-row"><div><b>Log out</b><p>Signs you out on this device. Your data stays saved in your account.</p></div><button class="btn sm" data-act="logout">Log out</button></div>
    <div class="set-row"><div><b>Delete my account</b><p>Permanently deletes your Ironday account and all its data. Your Google account and any Google Sheet are not touched. This can't be undone.</p></div><button class="btn sm danger" data-act="deleteAcct">Delete account</button></div>`)}

  ${sec('sheets','Google Sheets','Keep your data in a spreadsheet you own.',sheetsHtml)}

  ${sec('install','Phone app','Install Ironday on Android or iPhone like a regular app.',`
    ${isStandalone()?'<div class="notice">Ironday is installed on this device.</div>':''}
    <div class="set-row"><div><b>How Ironday works</b><p>A step-by-step guide to every part of the app.</p></div><a class="btn sm" href="guide.html">Open guide</a></div>
    <div class="set-row"><div><b>Android app</b><p>Download the Ironday app (.apk), open it, and allow installing from your browser if Android asks.</p></div><a class="btn sm primary" href="${APK_URL}" rel="noopener">Download</a></div>
    <div class="set-row"><div><b>Android, from Chrome</b><p>Or tap Install app, or open the Chrome menu (⋮) and choose <b>Install app</b>.</p></div>${installEvt?'<button class="btn sm" data-act="install">Install app</button>':''}</div>
    <div class="set-row"><div><b>iPhone and iPad</b><p>Open Ironday in Safari, tap the Share button, then <b>Add to Home Screen</b>.</p></div></div>`)}

  ${sec('sync','Sync & backup','Every change is saved to your account and works offline.',`
    <div class="set-row"><div><b>Status</b><p id="syncLong">${esc(syncLine())}</p></div><button class="btn sm" data-act="syncNow">Sync now</button></div>
    <div class="set-row"><div><b>Backup file</b><p>A complete copy of your data you can restore later.</p></div><button class="btn sm" data-act="exportJson">Download backup</button></div>`)}

  ${sec('notifications','Notifications & reminders','Choose what Ironday reminds you about.',`
    ${sw(n,'workout','Workout reminders','Before each planned workout, at the time you set for that day.','toggle')}
    <div class="set-row"><div><b>Remind me</b><p>How early workout reminders arrive.</p></div><select id="lead" style="width:auto" data-ch="lead">${[15,30,60,90].map(m=>`<option value="${m}" ${n.lead===m?'selected':''}>${m} min before</option>`).join('')}</select></div>
    ${sw(n,'streak','Streak protection','In the evening if you planned a workout and haven’t logged it.','toggle')}
    ${sw(n,'meals','Meal and protein nudges','If lunch isn’t logged, or protein is under half your target by 3 PM.','toggle')}
    ${sw(n,'water','Water reminders','During the day when you fall behind your glasses target.','toggle')}
    ${sw(n,'milestones','Goal milestones','At 50%, 75% and 100% of each goal.','toggle')}
    ${sw(n,'preview','Tomorrow preview','In the evening, what you’re training tomorrow.','toggle')}
    <div class="set-row"><div><b>Phone and desktop notifications</b><p>${sysTxt}</p></div><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="sysOn">Turn on</button><button class="btn sm ghost" data-act="testAlert">Test</button></div></div>`)}

  ${sec('privacy','Privacy & security','Your data stays separate from everyone else’s.',`
    <div class="notice" style="margin-bottom:12px">Your data is stored in a private record that only your signed-in Google account can read or change. The database refuses every request from anyone else, including other Ironday users.</div>
    ${sw(pv,'cache','Keep a copy on this device','Loads faster and works offline. Turn off on a shared computer.','ptoggle')}
    ${sw(pv,'greetName','Show my name on the home screen','Turn off if people can see your screen at the gym.','ptoggle')}
    <div class="set-row"><div><b>Erase all my data</b><p>Clears your workouts, food log, weights and goals but keeps your account. This can't be undone.</p></div><button class="btn sm danger" data-act="wipe" id="wipeBtn">Erase all data</button></div>`)}

  ${sec('data','Export & import','Take your data with you, or bring it back.',`
    ${imp}
    <div class="set-row"><div><b>Spreadsheet (.xlsx)</b><p>Opens in Google Sheets, Excel and Numbers.</p></div><button class="btn sm" data-act="exportXlsx">Export</button></div>
    <div class="set-row"><div><b>Backup (.json)</b><p>Everything, including your plan and settings.</p></div><button class="btn sm" data-act="exportJson">Export</button></div>
    <div class="set-row"><div><b>Restore from backup</b><p>Choose an Ironday .json backup. You'll confirm before anything is replaced.</p></div><label class="btn sm file-btn">Import<input type="file" id="importIn" accept=".json,application/json" data-ch="importJson"></label></div>`)}

  ${sec('appearance','Appearance','',`
    <div class="set-row"><div><b>Theme</b><p>Light is the default. System follows your device.</p></div><div class="seg">${[['light','Light'],['dark','Dark'],['system','System']].map(([k,l])=>`<button data-act="theme" data-v="${k}" class="${pr.theme===k?'on':''}">${l}</button>`).join('')}</div></div>`)}

  <div class="row" style="justify-content:center;padding:6px 0 10px"><button class="btn" data-act="logout">Log out</button></div>`;
}

/* ---------- export / import ---------- */
function tables(){
  const T={};const H=(name,head,rows)=>{T[name]=[head,...rows]};
  H('Workouts',['Date','Workout','Sets','Volume (kg)','Minutes'],state.sessions.map(s=>[s.date,s.name,s.exercises.reduce((a,e)=>a+e.sets.length,0),Math.round(volume(s)),Math.max(1,Math.round((s.endedAt-s.startedAt)/6e4))]));
  H('Sets',['Date','Workout','Exercise','Set','Weight (kg)','Reps'],state.sessions.flatMap(s=>s.exercises.flatMap(e=>e.sets.map((x,i)=>[s.date,s.name,e.name,i+1,parseFloat(x.w)||0,parseFloat(x.r)||0]))));
  H('Food',['Date','Meal','Food','kcal','Protein (g)','Carbs (g)','Fat (g)'],Object.keys(state.food).sort().flatMap(d=>state.food[d].map(e=>[d,e.meal,e.name,e.kcal,e.p,e.c,e.f])));
  H('Water',['Date','Glasses'],Object.keys(state.water).sort().map(d=>[d,state.water[d]]));
  H('Body weight',['Date','Weight (kg)'],state.weights.map(w=>[w.date,w.kg]));
  H('Goals',['Goal','Type','Target','Progress %','Status'],state.goals.map(g=>{const p=goalProgress(g);return[g.title,g.type,g.target,Math.round(clamp(p.pct,0,1)*100),p.label]}));
  H('Weekly plan',['Day','Workout','Reminder','Exercises'],DAYS.map(d=>{const day=state.plan[d];return[DAY_NAMES[d],dayName(day),day.split==='rest'||!day.remind?'off':day.time,day.exercises.map(e=>`${e.name} ${e.sets}x${e.reps}`).join('; ')]}));
  return T;
}
function buildWorkbook(){const wb=XLSX.utils.book_new(),T=tables();TABS.forEach(n=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(T[n]),n));return XLSX.write(wb,{bookType:'xlsx',type:'array'})}
function offerFile(filename,data){
  const type=filename.endsWith('.xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/json';
  try{const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);toast('Download started',filename)}
  catch{toast('Couldn’t save the file','Try again in a moment.')}
}
function resizePhoto(file){return new Promise((res,rej)=>{const r=new FileReader();r.onerror=rej;r.onload=()=>{const img=new Image();img.onerror=rej;img.onload=()=>{const S=160,c=document.createElement('canvas');c.width=c.height=S;const k=Math.max(S/img.width,S/img.height),w=img.width*k,h=img.height*k;c.getContext('2d').drawImage(img,(S-w)/2,(S-h)/2,w,h);res(c.toDataURL('image/jpeg',.82))};img.src=r.result};r.readAsDataURL(file)})}

/* ---------- sheets ---------- */
let sheet=null;
function openSheet(s){sheet=s;renderSheet();$('#overlay').hidden=false;setTimeout(()=>{const f=$('#sheet [data-autofocus]')||$('#sheet button');f&&f.focus()},30)}
function closeSheet(){sheet=null;$('#overlay').hidden=true;$('#sheet').innerHTML=''}
function renderSheet(){
  if(!sheet)return;const el=$('#sheet'),top=el.scrollTop;
  el.innerHTML=sheet.kind==='day'?sDay():sheet.kind==='food'?sFood():sGoal();
  el.scrollTop=top;
}
function sDay(){
  const s=sheet,d=s.day,sp=SPLIT[d.split];
  const groups=[...(sp.groups||[]),...Object.keys(LIB).filter(g=>!(sp.groups||[]).includes(g))];
  return`<div class="sheet-head"><div><span class="eyebrow">${s.date?'Today, '+DAY_NAMES[s.dk]:'Every '+DAY_NAMES[s.dk]}</span><h2>Choose your workout</h2></div><button class="btn ghost sm" data-act="close">Close</button></div>
  <div class="sheet-body">
    ${s.date?`<div class="field"><span class="lbl">Apply to</span><div class="seg"><button data-act="scope" data-v="today" class="${s.scope==='today'?'on':''}">Just today</button><button data-act="scope" data-v="week" class="${s.scope==='week'?'on':''}">Every ${DAY_NAMES[s.dk]}</button></div></div>`:''}
    <div class="field"><span class="lbl">Muscle groups</span><div class="chips">${SPLITS.map(x=>`<button class="chip${x.id===d.split?' on':''}" data-act="pickSplit" data-id="${x.id}" aria-pressed="${x.id===d.split}"><span class="dot p-${x.plate}"></span>${x.name}</button>`).join('')}</div></div>
    ${d.split==='custom'?`<div class="field"><label for="dName">Workout name</label><input type="text" id="dName" value="${esc(d.name)}" placeholder="e.g. Upper body power" data-in="dName"></div>`:''}
    ${d.split==='rest'?'<p class="muted">Rest days count toward your streak. No reminder is sent.</p>':`
    <div class="spread" style="flex-wrap:nowrap"><div><b>Reminder</b><p class="muted" style="font-size:.9rem">Ironday alerts you ${state.notif.lead} min before.</p></div><div class="row" style="flex-wrap:nowrap"><input type="time" id="dTime" value="${esc(d.time)}" style="width:130px" data-in="dTime" aria-label="Workout time"><button class="switch" role="switch" aria-checked="${!!d.remind}" aria-label="Reminder on" data-act="dRemind"></button></div></div>
    <div class="field"><span class="lbl">Exercises</span>
      <div class="ex-edit hdr"><span>Name</span><span>Sets</span><span>Reps</span><span></span></div>
      ${d.exercises.map((e,i)=>`<div class="ex-edit"><input type="text" id="en-${e.id}" value="${esc(e.name)}" data-in="exF" data-i="${i}" data-f="name" aria-label="Exercise name"><input type="number" id="es-${e.id}" min="1" max="10" value="${esc(e.sets)}" data-in="exF" data-i="${i}" data-f="sets" aria-label="Sets"><input type="text" id="er-${e.id}" value="${esc(e.reps)}" data-in="exF" data-i="${i}" data-f="reps" aria-label="Reps"><button class="xbtn" data-act="rmEx" data-i="${i}" aria-label="Remove ${esc(e.name)}">×</button></div>`).join('')||'<p class="muted">No exercises yet. Add some below.</p>'}
      <div class="row" style="margin-top:6px;flex-wrap:nowrap"><select id="addExSel" data-ch="addEx" aria-label="Add an exercise from the library"><option value="">Add from library…</option>${groups.map(g=>`<optgroup label="${GROUP_NAMES[g]}">${LIB[g].map(n=>`<option value="${g}|${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="row" style="flex-wrap:nowrap"><input type="text" id="customEx" placeholder="Or type your own exercise"><button class="btn sm" data-act="addCustomEx">Add</button></div>
    </div>`}
  </div>
  <div class="sheet-foot"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="saveDay">Save</button></div>`;
}
function sFood(){
  const s=sheet,q=(s.q||'').toLowerCase();
  const recent=[];const seen=new Set(FOODS.map(f=>f[0]));
  Object.keys(state.food).sort().reverse().forEach(k=>state.food[k].forEach(e=>{if(!seen.has(e.name)&&recent.length<8){seen.add(e.name);recent.push([e.name,'as logged',e.kcal,e.p,e.c,e.f])}}));
  const all=[...recent,...FOODS].filter(f=>!q||f[0].toLowerCase().includes(q));
  return`<div class="sheet-head"><div><span class="eyebrow">${fmtDate(s.date,{weekday:'long',month:'short',day:'numeric'})}</span><h2>Add food</h2></div><button class="btn ghost sm" data-act="close">Close</button></div>
  <div class="sheet-body">
    <div class="field"><span class="lbl">Meal</span><div class="seg">${MEALS.map(([k,l])=>`<button data-act="fMeal" data-v="${k}" class="${s.meal===k?'on':''}">${l}</button>`).join('')}</div></div>
    <div class="row" style="flex-wrap:nowrap"><input type="text" id="fq" placeholder="Search foods" value="${esc(s.q||'')}" data-in="fq" data-autofocus aria-label="Search foods"><div class="field" style="width:120px;flex:none"><input type="number" id="fserv" min="0.25" step="0.25" value="${esc(s.serv)}" data-in="fserv" aria-label="Servings"></div><span class="muted" style="flex:none">servings</span></div>
    <div class="quick" id="quick">${all.length?all.map(f=>`<button data-act="quickAdd" data-f="${esc(JSON.stringify(f))}"><span><b>${esc(f[0])}</b> <span class="muted">${esc(f[1])}</span></span><small>${fmt(f[2])} kcal · P ${fmt(f[3])} g</small></button>`).join(''):'<p class="empty" style="padding:12px">No match. Add it as a custom food below.</p>'}</div>
    <div class="field"><span class="lbl">Custom food</span>
      <input type="text" id="cfName" placeholder="Name, e.g. Chicken adobo with rice" value="${esc(s.q||'')}">
      <div class="form-grid"><div class="field"><label for="cfK">kcal</label><input type="number" id="cfK" min="0"></div><div class="field"><label for="cfP">Protein g</label><input type="number" id="cfP" min="0"></div><div class="field"><label for="cfC">Carbs g</label><input type="number" id="cfC" min="0"></div><div class="field"><label for="cfF">Fat g</label><input type="number" id="cfF" min="0"></div></div>
      <div class="row"><button class="btn" data-act="customFood">Add custom food</button><span class="muted" id="cfErr" style="font-size:.9rem"></span></div>
    </div>
  </div>`;
}
function sGoal(){
  const g=sheet.g;
  const types=[['weight','Body weight'],['lift','Lift target'],['weekly','Workouts per week'],['custom','Custom']];
  let fields='';
  if(g.type==='weight')fields=`<div class="field"><label for="gT">Target weight (kg)</label><input type="number" step="0.1" id="gT" value="${esc(g.target||'')}" data-in="gF" data-f="target"></div><p class="muted" style="font-size:.9rem">Progress starts from your latest logged weight.</p>`;
  if(g.type==='lift')fields=`<div class="field"><label for="gE">Exercise</label><input type="text" id="gE" list="exList" value="${esc(g.exercise||'')}" data-in="gF" data-f="exercise" placeholder="e.g. Barbell bench press"><datalist id="exList">${Object.values(LIB).flat().map(n=>`<option value="${esc(n)}">`).join('')}</datalist></div><div class="field"><label for="gT">Target (kg)</label><input type="number" id="gT" value="${esc(g.target||'')}" data-in="gF" data-f="target"></div><p class="muted" style="font-size:.9rem">Ironday checks your heaviest logged set for this exercise.</p>`;
  if(g.type==='weekly')fields=`<div class="field"><label for="gT">Workouts per week</label><input type="number" min="1" max="14" id="gT" value="${esc(g.target||4)}" data-in="gF" data-f="target"></div>`;
  if(g.type==='custom')fields=`<div class="field"><label for="gN">Goal</label><input type="text" id="gN" value="${esc(g.title||'')}" data-in="gF" data-f="title" placeholder="e.g. Run 5 km"></div><div class="form-grid"><div class="field"><label for="gC">Now</label><input type="number" id="gC" value="${esc(g.current||0)}" data-in="gF" data-f="current"></div><div class="field"><label for="gT">Target</label><input type="number" id="gT" value="${esc(g.target||'')}" data-in="gF" data-f="target"></div><div class="field" style="grid-column:span 2"><label for="gU">Unit</label><input type="text" id="gU" value="${esc(g.unit||'')}" data-in="gF" data-f="unit" placeholder="km, push-ups, days"></div></div>`;
  return`<div class="sheet-head"><h2>New goal</h2><button class="btn ghost sm" data-act="close">Close</button></div>
  <div class="sheet-body"><div class="field"><span class="lbl">Type</span><div class="chips">${types.map(([k,l])=>`<button class="chip${g.type===k?' on':''}" data-act="gType" data-v="${k}">${l}</button>`).join('')}</div></div>${fields}<span class="muted" id="gErr"></span></div>
  <div class="sheet-foot"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="saveGoal">Save goal</button></div>`;
}

/* ---------- actions ---------- */
let restEnd=0;
function startWorkout(){
  const t=iso(),day=effDay(t);
  if(day.split==='rest'||!day.exercises.length){openSheet({kind:'day',dk:dkOf(t),date:t,scope:'today',day:clone(day.split==='rest'?{...mkDay('full','18:00')}:day)});toast('Pick a workout first','Choose muscle groups for today, then start.');return}
  state.active={date:t,dk:dkOf(t),split:day.split,name:dayName(day),startedAt:Date.now(),
    exercises:day.exercises.map(e=>{const last=lastFor(e.name);return{name:e.name,group:e.group,target:`${e.sets} × ${e.reps}`,sets:Array.from({length:+e.sets||3},()=>({w:last?String(last.w):'',r:String(parseInt(e.reps)||''),done:false}))}})};
  save();location.hash='#session';
}
const ACT={
  go:el=>{location.hash='#'+el.dataset.go},
  start:startWorkout,
  alertGo:el=>{const g=el.dataset.go;if(g==='start')startWorkout();else if(g==='water'){const t=iso();state.water[t]=(state.water[t]||0)+1;save();toast('Glass logged',`${state.water[t]} of ${state.targets.water} today`);render()}else if(g==='food'){foodDate=iso();location.hash='#food'}else location.hash='#'+g},
  editToday:()=>{const t=iso();openSheet({kind:'day',dk:dkOf(t),date:t,scope:'today',day:clone(effDay(t))})},
  openDay:el=>{const dk=el.dataset.dk;const t=iso();if(dk===dkOf(t)&&route()==='today'){ACT.editToday();return}openSheet({kind:'day',dk,date:null,scope:'week',day:clone(state.plan[dk])})},
  close:closeSheet,
  scope:el=>{sheet.scope=el.dataset.v;renderSheet()},
  pickSplit:el=>{const id=el.dataset.id,d=sheet.day;d.split=id;if(id==='rest'){d.exercises=[];d.remind=false}else{if(id!=='custom')d.exercises=defaultExercises(id);d.remind=true}renderSheet()},
  dRemind:()=>{sheet.day.remind=!sheet.day.remind;renderSheet()},
  rmEx:el=>{sheet.day.exercises.splice(+el.dataset.i,1);renderSheet()},
  addCustomEx:()=>{const v=$('#customEx').value.trim();if(!v)return;sheet.day.exercises.push({id:uid(),name:v,group:'custom',sets:3,reps:'10'});renderSheet()},
  saveDay:()=>{const s=sheet,d=s.day;d.exercises=d.exercises.filter(e=>e.name.trim()).map(e=>({...e,sets:clamp(parseInt(e.sets)||3,1,10)}));
    if(s.scope==='today'&&s.date)state.overrides[s.date]=d;else{state.plan[s.dk]=d;if(s.date)delete state.overrides[s.date]}
    save();closeSheet();render();toast('Saved',s.scope==='today'?`Today is ${dayName(d)}.`:`Every ${DAY_NAMES[s.dk]} is now ${dayName(d)}.`)},
  hideStarter:()=>{state.starter=false;save();render()},
  tick:el=>{const s=state.active.exercises[+el.dataset.e].sets[+el.dataset.s];s.done=!s.done;if(s.done)startRest(state.notif.rest);save();render()},
  addSet:el=>{const e=state.active.exercises[+el.dataset.e],l=e.sets[e.sets.length-1]||{w:'',r:''};e.sets.push({w:l.w,r:l.r,done:false});save();render()},
  rmSet:el=>{state.active.exercises[+el.dataset.e].sets.pop();save();render()},
  rest:el=>{state.notif.rest=+el.dataset.s;startRest(+el.dataset.s);save();render()},
  discard:el=>{if(el.dataset.armed){state.active=null;restEnd=0;save();location.hash='#today';toast('Workout discarded');return}el.dataset.armed='1';el.textContent='Tap again to discard';setTimeout(()=>{if(el.isConnected){delete el.dataset.armed;el.textContent='Discard'}},4000)},
  finish:()=>{const a=state.active,ex=a.exercises.map(e=>({name:e.name,group:e.group,sets:e.sets.filter(s=>s.done).map(s=>({w:s.w,r:s.r}))})).filter(e=>e.sets.length);
    if(!ex.length){toast('No sets ticked yet','Tick at least one set as done before you finish.');return}
    const rec={id:uid(),date:a.date,dk:a.dk,split:a.split,name:a.name,startedAt:a.startedAt,endedAt:Date.now(),exercises:ex};
    const prs=ex.filter(e=>{const top=Math.max(...e.sets.map(s=>parseFloat(s.w)||0));return top>0&&top>bestLift(e.name)}).map(e=>e.name);
    state.sessions.push(rec);state.active=null;restEnd=0;save();location.hash='#today';
    toast('Workout logged',`${plural(ex.reduce((x,e)=>x+e.sets.length,0),'set')}, ${fmt(volume(rec))} kg moved. Streak: ${plural(calcStreak(),'day')}.`);
    if(prs.length)setTimeout(()=>toast('New personal best',prs.slice(0,3).join(', ')),600)},
  water:el=>{const t=el.dataset.date||iso(),n=+el.dataset.n;state.water[t]=(state.water[t]===n?n-1:n);save();render()},
  waterAdd:el=>{const t=el.dataset.date;state.water[t]=(state.water[t]||0)+1;save();render()},
  waterSub:el=>{const t=el.dataset.date;state.water[t]=Math.max(0,(state.water[t]||0)-1);save();render()},
  fday:el=>{const n=+el.dataset.n;foodDate=n===0?iso():addDays(foodDate,n);if(foodDate>iso())foodDate=iso();render()},
  addFood:el=>openSheet({kind:'food',date:foodDate,meal:el.dataset.meal||mealNow(),q:'',serv:1}),
  fMeal:el=>{sheet.meal=el.dataset.v;renderSheet()},
  quickAdd:el=>{const f=JSON.parse(el.dataset.f),m=parseFloat(sheet.serv)||1;addEntry(sheet.date,sheet.meal,(m!==1?`${m} × `:'')+f[0],f[2]*m,f[3]*m,f[4]*m,f[5]*m)},
  customFood:()=>{const n=$('#cfName').value.trim(),k=parseFloat($('#cfK').value);if(!n||!(k>=0)){$('#cfErr').textContent='Enter a name and calories to add it.';return}
    addEntry(sheet.date,sheet.meal,n,k,parseFloat($('#cfP').value)||0,parseFloat($('#cfC').value)||0,parseFloat($('#cfF').value)||0)},
  rmFood:el=>{const d=foodDate;state.food[d]=(state.food[d]||[]).filter(e=>e.id!==el.dataset.id);save();render()},
  addGoal:()=>openSheet({kind:'goal',g:{type:'lift',target:'',exercise:''}}),
  gType:el=>{sheet.g={type:el.dataset.v,target:el.dataset.v==='weekly'?4:''};renderSheet()},
  saveGoal:()=>{const g={...sheet.g,id:uid()},T=parseFloat(g.target);const err=m=>{$('#gErr').textContent=m};
    if(!(T>0))return err('Enter a target number above zero.');g.target=T;
    if(g.type==='weight'){g.title=`Reach ${T} kg body weight`;g.start=state.weights.length?state.weights[state.weights.length-1].kg:null}
    if(g.type==='lift'){if(!g.exercise||!g.exercise.trim())return err('Choose the exercise.');g.title=`${g.exercise.trim()} ${T} kg`}
    if(g.type==='weekly')g.title=`Train ${T} times a week`;
    if(g.type==='custom'){if(!g.title||!g.title.trim())return err('Name your goal.');g.current=parseFloat(g.current)||0}
    state.goals.push(g);save();closeSheet();render();toast('Goal added',g.title)},
  rmGoal:el=>{state.goals=state.goals.filter(g=>g.id!==el.dataset.id);save();render()},
  logWeight:()=>{const v=parseFloat($('#wIn').value);if(!(v>20&&v<400)){toast('Check the number','Enter your weight in kilograms, for example 72.5.');return}
    const t=iso();state.weights=state.weights.filter(w=>w.date!==t);state.weights.push({date:t,kg:Math.round(v*10)/10});state.weights.sort((a,b)=>a.date<b.date?-1:1);
    state.goals.forEach(g=>{if(g.type==='weight'&&g.start==null)g.start=v});save();render();toast('Weight logged',`${v} kg today`)},
  toggle:el=>{const k=el.dataset.k;state.notif[k]=!state.notif[k];save();render()},
  readAll:()=>{state.inbox.forEach(i=>i.read=true);save();updateUnread();render()},
  sysOn:async()=>{try{if(!('Notification' in window))throw 0;const p=await Notification.requestPermission();sysOK=p==='granted';state.notif.system=sysOK;save();toast(sysOK?'Notifications on':'Notifications not allowed',sysOK?'Reminders will also appear as notifications while Ironday is open.':'Allow notifications for Ironday in your browser or phone settings.')}catch{state.notif.system=false;toast('Notifications aren’t available here',/iPhone|iPad/.test(navigator.userAgent)?'Add Ironday to your Home Screen first, then try again.':'Ironday will keep showing alerts inside the app.')}render()},
  testAlert:()=>{const a={title:'Test alert',body:'This is how Ironday reminders look.'};toast(a.title,a.body);sysNotify(a)},
  signIn:()=>signIn(),
  connectSheets:()=>connectSheets(),
  syncSheet:()=>syncSheet(true),
  sheetAuto:()=>{state.sheet.auto=!state.sheet.auto;save();render()},
  newSheet:async()=>{if(!getToken()){await connectSheets();return}try{await createSheet();await syncSheet(true)}catch(e){toast('Couldn’t create the spreadsheet',e.code==='no-token'?'Reconnect Google Sheets first.':(e.message||'Try again.'))}render()},
  disconnectSheets:el=>{if(!el.dataset.armed){el.dataset.armed='1';el.textContent='Tap again to disconnect';setTimeout(()=>{if(el.isConnected){delete el.dataset.armed;el.textContent='Disconnect'}},4000);return}
    state.sheet={id:'',url:'',auto:true,last:0};sheetMsg='';clearToken();save();render();toast('Google Sheets disconnected','The spreadsheet is still in your Google Drive.')},
  install:async()=>{if(!installEvt)return;installEvt.prompt();try{await installEvt.userChoice}catch{}installEvt=null;render()},
  deleteAcct:async el=>{if(!el.dataset.armed){el.dataset.armed='1';el.textContent='Tap again to delete forever';setTimeout(()=>{if(el.isConnected){delete el.dataset.armed;el.textContent='Delete account'}},5000);return}
    if(DEMO){lsDel();state=freshState();save();render();toast('Preview data erased');return}
    const user=fb&&fb.auth.currentUser;if(!user)return;
    try{await deleteDoc(doc(fb.db,'users',user.uid));lsDel();clearToken();
      try{await deleteUser(user)}catch(e){if(e&&e.code==='auth/requires-recent-login'){await reauthenticateWithPopup(user,fb.provider);await deleteUser(user)}else throw e}
      toast('Account deleted','Your Ironday data has been removed.')}
    catch(e){toast('Couldn’t delete the account',e&&e.code==='auth/popup-closed-by-user'?'Confirm with Google to finish deleting.':'Check your connection and try again.')}},
  logout:async()=>{if(state.privacy.cache===false)lsDel();clearToken();closeSheet();if(DEMO){location.href=location.pathname;return}try{history.replaceState(null,'',location.pathname)}catch{}try{await signOut(fb.auth)}catch{}toast('Logged out','Your data stays saved in your account.')},
  jump:el=>{const t=document.getElementById('s-'+el.dataset.sec);t&&t.scrollIntoView({behavior:'smooth',block:'start'})},
  goSettings:el=>{pendingJump=el.dataset.sec;location.hash='#account'},
  rmPhoto:()=>{state.profile.photo='';save();render()},
  ptoggle:el=>{const k=el.dataset.k;state.privacy[k]=!state.privacy[k];if(k==='cache'&&!state.privacy.cache)lsDel();save();render()},
  theme:el=>{state.prefs.theme=el.dataset.v;applyTheme();save();render()},
  syncNow:async()=>{clearTimeout(saveTimer);setSync('Saving…');const ok=await pushCloud();toast(ok?'Synced':'Couldn’t sync yet',ok?'Everything is saved to your account.':'Your changes are kept on this device and will sync when you’re back online.')},
  exportXlsx:()=>{if(typeof XLSX==='undefined'){toast('The spreadsheet tool didn’t load','Reload the page, or download a backup (.json) instead.');return}let buf;try{buf=buildWorkbook()}catch(e){toast('Couldn’t build the spreadsheet','Try again, or download a backup (.json).');return}offerFile(`ironday-${iso()}.xlsx`,buf)},
  exportJson:()=>offerFile(`ironday-backup-${iso()}.json`,JSON.stringify({app:'ironday',version:2,exported:new Date().toISOString(),data:state},null,1)),
  confirmImport:()=>{if(!pendingImport)return;const keepPhoto=state.profile.photo;state=migrate(pendingImport);if(!state.profile.photo)state.profile.photo=keepPhoto;state.active=null;pendingImport=null;save();applyTheme();render();toast('Backup restored',`${state.sessions.length} workouts loaded.`)},
  cancelImport:()=>{pendingImport=null;render()},
  wipe:el=>{if(el.dataset.armed){state=freshState();save();applyTheme();render();toast('All data erased','You have a fresh starter plan.');return}el.dataset.armed='1';el.textContent='Tap again to erase everything';setTimeout(()=>{if(el.isConnected){delete el.dataset.armed;el.textContent='Erase all data'}},4000)}
};
function addEntry(d,meal,name,kcal,p,c,f){
  (state.food[d]=state.food[d]||[]).push({id:uid(),meal,name,kcal:Math.round(kcal),p:Math.round(p*10)/10,c:Math.round(c*10)/10,f:Math.round(f*10)/10});
  save();closeSheet();render();toast('Added',`${name}, ${fmt(kcal)} kcal`);
}
const IN={
  setW:el=>{state.active.exercises[+el.dataset.e].sets[+el.dataset.s].w=el.value;save()},
  setR:el=>{state.active.exercises[+el.dataset.e].sets[+el.dataset.s].r=el.value;save()},
  dName:el=>{sheet.day.name=el.value},
  dTime:el=>{sheet.day.time=el.value||'18:00'},
  exF:el=>{sheet.day.exercises[+el.dataset.i][el.dataset.f]=el.value},
  fq:el=>{sheet.q=el.value;const pos=el.selectionStart;renderSheet();const n=$('#fq');n.focus();try{n.setSelectionRange(pos,pos)}catch{}},
  fserv:el=>{sheet.serv=el.value},
  gF:el=>{sheet.g[el.dataset.f]=el.value}
};
const CH={
  addEx:el=>{if(!el.value)return;const [g,n]=el.value.split('|');const k=sheet.day.exercises.filter(e=>e.group===g).length;sheet.day.exercises.push(mkEx(n,g,k));renderSheet()},
  target:el=>{const v=parseFloat(el.value);if(v>0){state.targets[el.dataset.k]=el.dataset.k==='water'?clamp(Math.round(v),1,20):Math.round(v);save()}},
  pname:el=>{state.profile.name=el.value.trim().slice(0,40);save()},
  goalCur:el=>{const g=state.goals.find(x=>x.id===el.dataset.id);if(g){g.current=parseFloat(el.value)||0;save();render()}},
  lead:el=>{state.notif.lead=+el.value;save()},
  photo:async el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;if(!/^image\//.test(f.type)){toast('Choose an image file','JPG, PNG or WebP photos work.');return}
    try{state.profile.photo=await resizePhoto(f);save();render();toast('Profile photo updated')}catch{toast('Couldn’t read that image','Try a different photo.')}},
  importJson:el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;const r=new FileReader();
    r.onload=()=>{try{const o=JSON.parse(r.result),d=o&&o.data?o.data:o;if(!d||!d.plan||!Array.isArray(d.sessions))throw 0;pendingImport=d;render();setTimeout(()=>{const s=document.getElementById('s-data');s&&s.scrollIntoView({block:'start'})},30)}catch{toast('That file isn’t an Ironday backup','Choose a .json file made with Download backup.')}};
    r.onerror=()=>toast('Couldn’t read the file','Try again.');r.readAsText(f)}
};
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;const f=ACT[el.dataset.act];if(f){e.preventDefault();f(el,e)}});
document.addEventListener('input',e=>{const el=e.target.closest('[data-in]');if(el&&IN[el.dataset.in])IN[el.dataset.in](el)});
document.addEventListener('change',e=>{const el=e.target.closest('[data-ch]');if(el&&CH[el.dataset.ch])CH[el.dataset.ch](el)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheet)closeSheet();if(e.key==='Enter'&&e.target.id==='wIn')ACT.logWeight();if(e.key==='Enter'&&e.target.id==='customEx')ACT.addCustomEx()});
$('#overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeSheet()});

/* ---------- timers ---------- */
function startRest(sec){restEnd=Date.now()+sec*1000}
setInterval(()=>{
  const el=$('#elapsed');if(el&&state.active){const s=Math.floor((Date.now()-state.active.startedAt)/1000);el.textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
  const r=$('#rest');
  if(restEnd){const left=Math.ceil((restEnd-Date.now())/1000);if(left<=0){restEnd=0;beep();toast('Rest is over','Next set. You’ve got this.');if(r){r.textContent='Go';r.classList.remove('live')}}else if(r){r.textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;r.classList.add('live')}}
},250);

/* ---------- router ---------- */
const VIEWS={today:vToday,plan:vPlan,food:vFood,goals:vGoals,alerts:vAlerts,account:vAccount,session:vSession};
function route(){const h=location.hash.slice(1);return VIEWS[h]?h:'today'}
function renderMeChip(){const el=$('#meChip');if(!el)return;const s=avatarSrc();el.innerHTML=(s&&/^(https:|data:image\/)/.test(s)?`<img src="${esc(s)}" alt="" referrerpolicy="no-referrer">`:'')+`<span>${esc(displayName()||'Your account')}</span>`}
function render(){
  const gated=phase!=='app';document.body.classList.toggle('gated',gated);
  if(gated){$('#view').innerHTML=vGate();return}
  const r=route();$('#view').innerHTML=VIEWS[r]();
  document.querySelectorAll('.tab').forEach(t=>{const on=t.dataset.route===r||(r==='session'&&t.dataset.route==='plan')||(r==='alerts'&&t.dataset.route==='today');on?t.setAttribute('aria-current','page'):t.removeAttribute('aria-current')});
  if(r==='alerts'&&state.inbox.some(i=>!i.read)){setTimeout(()=>{if(route()==='alerts'){state.inbox.forEach(i=>i.read=true);save();updateUnread()}},2500)}
  if(r==='account'&&pendingJump){const id=pendingJump;pendingJump=null;setTimeout(()=>{const el=document.getElementById('s-'+id);el&&el.scrollIntoView({block:'start'})},30)}
  setSync(syncMsg,syncOn);renderMeChip();updateUnread();
  const wk=document.querySelector('.week'),td=wk&&wk.querySelector('.wd.today');if(wk&&td&&wk.scrollWidth>wk.clientWidth)wk.scrollLeft=Math.max(0,td.offsetLeft-wk.offsetLeft-(wk.clientWidth-td.offsetWidth)/2);
}
let lastRoute=route();
window.addEventListener('hashchange',()=>{const r=route();if(r!==lastRoute){window.scrollTo(0,0);lastRoute=r}render()});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(route()==='account'&&phase==='app')render()});
window.addEventListener('online',()=>{if(phase==='app')pushCloud()});
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
boot();
