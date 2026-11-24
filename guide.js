// Characters for the Ironday guide page (same drawings as the app).
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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

document.querySelectorAll('[data-char]').forEach(el=>{const [pose,who]=el.dataset.char.split(' ');el.innerHTML=character(pose,who,el.dataset.label||'')});
