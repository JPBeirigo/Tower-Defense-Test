const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const GRID = 50;
const GW = 900, GH = 460;
const MAX_WAVES = 20;
const UPGRADE_COSTS = [100, 200];
const GRASS_COLOR = "#5c8c3a";

// ═══════════════════════════════════════════════════
//  AUDIO ENGINE
// ═══════════════════════════════════════════════════

const AC = (() => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return null; } })();
let audioEnabled = true;

let _rapidBuf = null;
function getRapidBuf() {
  if (_rapidBuf) return _rapidBuf;
  const len = Math.ceil(AC.sampleRate * 0.03);
  _rapidBuf = AC.createBuffer(1, len, AC.sampleRate);
  const d = _rapidBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return _rapidBuf;
}

function resumeAudio() {
  if (AC && AC.state === "suspended") AC.resume().then(startMusic);
  else startMusic();
}
document.addEventListener("click",      resumeAudio, { once: true });
document.addEventListener("keydown",    resumeAudio, { once: true });
document.addEventListener("touchstart", resumeAudio, { once: true });

function playSound(type) {
  if (!AC || !audioEnabled || AC.state === "suspended") return;
  const now = AC.currentTime;
  const master = AC.createGain();
  master.connect(AC.destination);
  master.gain.value = 0.5;

  const shape = (freq, type_, dur, gainAmt, freqEnd) => {
    const osc = AC.createOscillator(), g = AC.createGain();
    osc.connect(g); g.connect(master);
    osc.type = type_; osc.frequency.setValueAtTime(freq, now);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    g.gain.setValueAtTime(gainAmt, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now); osc.stop(now + dur);
  };
  const noise = (dur, gainAmt, freqLo = 200, freqHi = 1800) => {
    const bufLen = Math.ceil(AC.sampleRate * dur);
    const buf = AC.createBuffer(1, bufLen, AC.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = AC.createBufferSource(), flt = AC.createBiquadFilter(), g = AC.createGain();
    flt.type = "bandpass"; flt.frequency.value = (freqLo + freqHi) / 2; flt.Q.value = 0.5;
    src.buffer = buf; src.connect(flt); flt.connect(g); g.connect(master);
    g.gain.setValueAtTime(gainAmt, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.start(now); src.stop(now + dur);
  };

  switch (type) {
    case "cannon":  shape(90,"sawtooth",0.18,0.8,30); noise(0.18,0.6,80,600); break;
    case "sniper":  shape(600,"sawtooth",0.06,0.5,80); noise(0.05,0.4,800,4000); break;
    case "rapid": {
      const hp = AC.createBiquadFilter(), src = AC.createBufferSource(), ng = AC.createGain();
      hp.type = "highpass"; hp.frequency.value = 2800;
      src.buffer = getRapidBuf();
      src.connect(hp); hp.connect(ng); ng.connect(master);
      ng.gain.setValueAtTime(0.6, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
      src.start(now); src.stop(now + 0.025);

      const osc = AC.createOscillator(), og = AC.createGain();
      osc.type = "square"; osc.frequency.value = 1100;
      osc.connect(og); og.connect(master);
      og.gain.setValueAtTime(0.2, now);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);
      osc.start(now); osc.stop(now + 0.018);
      break;
    }

    case "freeze": shape(1200,"sine",0.12,0.4,600); shape(1800,"sine",0.10,0.25,900); shape(900,"sine",0.14,0.2,450); break;
    case "fire":   noise(0.15,0.35,200,1000); shape(150,"sawtooth",0.12,0.2,80); break;
    case "tesla":  shape(800,"sawtooth",0.08,0.5,1600); shape(400,"square",0.1,0.3,200); noise(0.08,0.3,600,4000); break;
    case "mortar": shape(60,"sawtooth",0.28,0.9,20); noise(0.28,0.7,40,500); shape(180,"sawtooth",0.22,0.6,50); break;
    case "kill":   shape(300,"sine",0.08,0.25,80); break;
    case "bossKill": shape(60,"sawtooth",0.45,0.9,25); noise(0.45,0.7,50,400); shape(120,"sawtooth",0.3,0.5,40); break;
    case "finalBossKill": shape(40,"sawtooth",0.7,1.0,15); noise(0.7,0.9,30,300); shape(80,"sawtooth",0.5,0.7,30); shape(160,"sine",0.6,0.4,50); noise(0.5,0.6,200,800); break;
    case "wave":
      [0,0.12,0.24].forEach((dt,i) => {
        const osc = AC.createOscillator(), g = AC.createGain();
        osc.connect(g); g.connect(master); osc.type = "sine";
        osc.frequency.value = [440,550,660][i];
        g.gain.setValueAtTime(0.3, now + dt);
        g.gain.exponentialRampToValueAtTime(0.001, now + dt + 0.18);
        osc.start(now + dt); osc.stop(now + dt + 0.2);
      }); break;
  }
}

// ═══════════════════════════════════════════════════
//  S-CURVE PATH
// ═══════════════════════════════════════════════════

const BEZIER_SEGS = [
  [{x:-70,y:125},{x:220,y:125},{x:190,y:335},{x:450,y:335}],
  [{x:450,y:335},{x:710,y:335},{x:680,y:125},{x:970,y:125}]
];

function cubicBez(t, p0, c1, c2, p1) {
  const u = 1 - t;
  return {
    x: u**3*p0.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t**3*p1.x,
    y: u**3*p0.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t**3*p1.y
  };
}

const PATH_PTS = [];
const SAMP = 400;
for (const seg of BEZIER_SEGS)
  for (let i = 0; i < SAMP; i++)
    PATH_PTS.push(cubicBez(i/SAMP, seg[0], seg[1], seg[2], seg[3]));
PATH_PTS.push(cubicBez(1, BEZIER_SEGS[1][0], BEZIER_SEGS[1][1], BEZIER_SEGS[1][2], BEZIER_SEGS[1][3]));

const PATH_DISTS = [0];
for (let i = 1; i < PATH_PTS.length; i++)
  PATH_DISTS.push(PATH_DISTS[i-1] + Math.hypot(PATH_PTS[i].x-PATH_PTS[i-1].x, PATH_PTS[i].y-PATH_PTS[i-1].y));
const PATH_LEN = PATH_DISTS[PATH_DISTS.length-1];

function posAtDist(d) {
  d = Math.max(0, Math.min(PATH_LEN, d));
  let lo = 0, hi = PATH_PTS.length - 1;
  while (lo < hi - 1) { const m = (lo+hi)>>1; PATH_DISTS[m] <= d ? lo=m : hi=m; }
  const t = (d-PATH_DISTS[lo])/(PATH_DISTS[hi]-PATH_DISTS[lo]);
  return { x: PATH_PTS[lo].x+t*(PATH_PTS[hi].x-PATH_PTS[lo].x), y: PATH_PTS[lo].y+t*(PATH_PTS[hi].y-PATH_PTS[lo].y) };
}

const PATH_W = 54, PATH_BLOCK_R = PATH_W/2+4;

const blockedCells = new Set();
for (const p of PATH_PTS) {
  const x0=Math.floor((p.x-PATH_BLOCK_R-GRID)/GRID)*GRID, x1=Math.floor((p.x+PATH_BLOCK_R+GRID)/GRID)*GRID;
  const y0=Math.floor((p.y-PATH_BLOCK_R-GRID)/GRID)*GRID, y1=Math.floor((p.y+PATH_BLOCK_R+GRID)/GRID)*GRID;
  for (let gx=x0; gx<=x1; gx+=GRID)
    for (let gy=y0; gy<=y1; gy+=GRID) {
      const cx=gx+GRID/2, cy=gy+GRID/2;
      if (gx>=0&&gx<GW&&gy>=0&&gy<GH&&Math.hypot(cx-p.x,cy-p.y)<PATH_BLOCK_R)
        blockedCells.add(`${gx},${gy}`);
    }
}

// ═══════════════════════════════════════════════════
//  TOWER DEFINITIONS
// ═══════════════════════════════════════════════════

const TDEFS = {
  cannon: { cost: 50,  range:160, fireRate:55,  damage:25,  color:"#2e8b57", label:"Cannon", icon:"💣" },
  sniper: { cost: 70,  range:270, fireRate:90,  damage:65,  color:"#7b3fb5", label:"Sniper",  icon:"🎯" },
  rapid:  { cost: 45,  range:125, fireRate:12,  damage:10,  color:"#d97c00", label:"Rapid",   icon:"⚡" },
  freeze: { cost: 85,  range:155, fireRate:115, damage:0,   color:"#00aadd", label:"Freeze",  icon:"❄️" },
  fire:   { cost: 60,  range:135, fireRate:45,  damage:8,   color:"#dd3300", label:"Fire",    icon:"🔥" },
  tesla:  { cost: 180, range:150, fireRate:60,  damage:30,  color:"#8844ff", label:"Tesla",   icon:"🔗" },
  mortar: { cost: 250, range:230, fireRate:165, damage:90,  color:"#aa6600", label:"Mortar",  icon:"💥" },
};
const FREEZE_AOE_R=85, TESLA_CHAIN_R=130, MORTAR_AOE_R=130;

function upgradedStats(type, lvl) {
  const b=TDEFS[type], m=1+(lvl-1)*0.35;
  return { range:Math.round(b.range*m), fireRate:Math.max(5,Math.round(b.fireRate/m)), damage:Math.round(b.damage*m) };
}

// ═══════════════════════════════════════════════════
//  PARTICLES
// ═══════════════════════════════════════════════════

let particles=[], rings=[];

class Particle {
  constructor(x,y,vx,vy,color,life,size,grav=0.12) {
    Object.assign(this,{x,y,vx,vy,color,life,total:life,size,grav});
  }
  update() {
    this.x+=this.vx; this.y+=this.vy; this.vy+=this.grav;
    this.vx*=0.97; this.life--; this.size*=0.95;
  }
  draw() {
    ctx.globalAlpha=Math.max(0,this.life/this.total);
    ctx.fillStyle=this.color;
    ctx.beginPath(); ctx.arc(this.x,this.y,Math.max(0.5,this.size),0,Math.PI*2); ctx.fill();
  }
}

function spawnExplosion(x,y,big=false) {
  const n=big?28:13, colors=["#ff6600","#ff9900","#ffcc00","#ff3300","#ffee88","#ffffff"];
  for (let i=0;i<n;i++) {
    const angle=(Math.PI*2*i)/n+(Math.random()-0.5)*0.4, speed=(big?5:2.5)+Math.random()*(big?5:2.5);
    particles.push(new Particle(x,y,Math.cos(angle)*speed,Math.sin(angle)*speed,
      colors[Math.floor(Math.random()*colors.length)], 22+Math.floor(Math.random()*20), (big?6:3)+Math.random()*(big?5:2)));
  }
  particles.push(new Particle(x,y,0,0,"rgba(255,200,80,0.6)",big?18:12,big?55:28,0));
}
function spawnFreezeBurst(x,y) {
  const colors=["#aaeeff","#ffffff","#66ccff","#ddf4ff"];
  for (let i=0;i<16;i++) {
    const angle=(Math.PI*2*i)/16+Math.random()*0.2, speed=1.5+Math.random()*2.5;
    particles.push(new Particle(x,y,Math.cos(angle)*speed,Math.sin(angle)*speed,
      colors[Math.floor(Math.random()*colors.length)],28+Math.floor(Math.random()*16),2.5+Math.random()*2,0));
  }
}
function spawnTeslaBurst(x,y) {
  const colors=["#cc88ff","#ffffff","#9944ff","#ddaaff"];
  for (let i=0;i<10;i++) {
    const angle=Math.random()*Math.PI*2, speed=1+Math.random()*3;
    particles.push(new Particle(x,y,Math.cos(angle)*speed,Math.sin(angle)*speed,
      colors[Math.floor(Math.random()*colors.length)],14+Math.floor(Math.random()*12),1.5+Math.random()*2,0));
  }
}
function spawnDeathBurst(x,y,color) {
  for (let i=0;i<8;i++) {
    const angle=Math.random()*Math.PI*2, speed=1+Math.random()*2;
    particles.push(new Particle(x,y,Math.cos(angle)*speed,Math.sin(angle)*speed,color,18+Math.floor(Math.random()*10),2+Math.random()*2));
  }
}
function spawnFinalBossDeath(x,y) {
  const colors=["#ff0000","#ff6600","#ffcc00","#ff44aa","#ffffff","#ff3300","#ffaaff"];
  for (let i=0;i<60;i++) {
    const angle=Math.random()*Math.PI*2, speed=2+Math.random()*8;
    particles.push(new Particle(x,y,Math.cos(angle)*speed,Math.sin(angle)*speed,
      colors[Math.floor(Math.random()*colors.length)],35+Math.floor(Math.random()*30),4+Math.random()*7));
  }
  rings.push({x,y,r:4,maxR:140,color:"rgba(255,80,0,0.8)",life:1.0});
  rings.push({x,y,r:4,maxR:100,color:"rgba(255,200,0,0.7)",life:1.0});
  rings.push({x,y,r:4,maxR:60, color:"rgba(255,255,255,0.6)",life:1.0});
}
function spawnRing(x,y,color,maxR) { rings.push({x,y,r:4,maxR,color,life:1.0}); }

// ═══════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════

let towers=[], enemies=[], projectiles=[], floats=[], teslaArcs=[];
let money=150, kills=0, health=100, wave=1;
let waveActive=false, gameOver=false, gameWon=false, isPaused=false;
let selectedType="cannon", selectedTower=null, hoverCell=null;
let loopId=null, waveTimeouts=[];

// ═══════════════════════════════════════════════════
//  PAUSE
// ═══════════════════════════════════════════════════

function togglePause() {
  if (gameOver||gameWon) return;
  isPaused=!isPaused;
  document.getElementById("pauseOverlay").style.display=isPaused?"flex":"none";
  const btn=document.getElementById("pauseBtn");
  btn.textContent=isPaused?"▶":"⏸";
  btn.title=isPaused?"Resume (ESC)":"Pause (ESC)";
  setMusicVol(isPaused ? 0.04 : 0.15);
  if (!isPaused&&!loopId) gameLoop();
}
document.addEventListener("keydown", e => { if (e.key==="Escape") togglePause(); });

// ═══════════════════════════════════════════════════
//  COORDINATE HELPER  
// ═══════════════════════════════════════════════════

function canvasCoords(clientX, clientY) {
  const rect=canvas.getBoundingClientRect();
  return {
    mx: (clientX-rect.left)*(GW/rect.width),
    my: (clientY-rect.top)*(GH/rect.height)
  };
}

// ═══════════════════════════════════════════════════
//  TOWER
// ═══════════════════════════════════════════════════

class Tower {
  constructor(x,y,type) {
    this.x=x; this.y=y; this.type=type;
    this.level=1; this.cooldown=0; this.angle=0;
    this._apply();
  }
  _apply() {
    const s=upgradedStats(this.type,this.level);
    this.range=s.range; this.fireRate=s.fireRate; this.damage=s.damage;
  }
  upgrade() {
    if (this.level>=3) return false;
    const cost=UPGRADE_COSTS[this.level-1];
    if (money<cost) return false;
    money-=cost; this.level++; this._apply(); return true;
  }
  sellValue() {
    let total=TDEFS[this.type].cost;
    for (let i=0;i<this.level-1;i++) total+=UPGRADE_COSTS[i];
    return Math.floor(total*0.65);
  }
  update() {
    if (this.cooldown>0) this.cooldown--;
    let target=null, maxDist=-1;
    for (const e of enemies) {
      if (e.dead) continue;
      const d=Math.hypot(e.cx-this.x,e.cy-this.y);
      if (d<=this.range&&e.dist>maxDist) { maxDist=e.dist; target=e; }
    }
    if (target) {
      this.angle=Math.atan2(target.cy-this.y,target.cx-this.x);
      if (this.cooldown<=0) {
        projectiles.push(new Projectile(this.x,this.y,target,this.damage,this.type,this.level));
        this.cooldown=this.fireRate;
        if (this.type==="rapid") { if (Math.random()<0.6) playSound("rapid"); }
        else if (this.type==="tesla") playSound("tesla");
        else if (this.type==="mortar") playSound("mortar");
        else playSound(this.type==="cannon"?"cannon":this.type==="sniper"?"sniper":
                       this.type==="freeze"?"freeze":this.type==="fire"?"fire":this.type);
      }
    }
  }
  draw() {
    const isSel=selectedTower===this, col=TDEFS[this.type].color;
    if (isSel) { ctx.shadowColor="rgba(255,255,255,0.7)"; ctx.shadowBlur=18; }
    ctx.fillStyle=col; ctx.fillRect(this.x-20,this.y-20,40,40);
    ctx.fillStyle="rgba(0,0,0,0.25)"; ctx.fillRect(this.x-14,this.y-14,28,28);
    ctx.shadowBlur=0;
    ctx.save(); ctx.translate(this.x,this.y);

    if (this.type==="freeze") {
      ctx.strokeStyle="rgba(200,240,255,0.95)"; ctx.lineWidth=2;
      for (let i=0;i<6;i++) {
        ctx.save(); ctx.rotate(i*Math.PI/3);
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-17);
        ctx.moveTo(-5,-11); ctx.lineTo(0,-17); ctx.lineTo(5,-11);
        ctx.stroke(); ctx.restore();
      }
      ctx.lineWidth=1;
    } else if (this.type==="fire") {
      const t=performance.now()/220, cols=["#ff2200","#ff6600","#ffbb00"];
      for (let i=0;i<3;i++) {
        ctx.fillStyle=cols[i];
        ctx.beginPath();
        ctx.ellipse(-5+i*5,-10+Math.sin(t*1.8+i*2.2)*3,4,12+Math.sin(t*1.3+i)*3,0,0,Math.PI*2);
        ctx.fill();
      }
    } else if (this.type==="tesla") {
      const t=performance.now()/300;
      ctx.strokeStyle="rgba(180,100,255,0.9)"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle="rgba(255,200,255,0.5)"; ctx.lineWidth=1;
      ctx.save(); ctx.rotate(t);
      ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(14,0); ctx.moveTo(0,-14); ctx.lineTo(0,14); ctx.stroke();
      ctx.restore();
      ctx.fillStyle="#cc88ff"; ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fill();
    } else if (this.type==="mortar") {
      ctx.rotate(this.angle);
      ctx.fillStyle="#7a4500"; ctx.fillRect(-7,-7,14,14);
      ctx.fillStyle="#3a2000"; ctx.fillRect(0,-22,10,22);
      ctx.fillStyle="#5a3800"; ctx.fillRect(1,-20,8,18);
    } else {
      ctx.rotate(this.angle);
      ctx.fillStyle="#111"; ctx.fillRect(4,-4,24,8);
      ctx.fillStyle="#333"; ctx.fillRect(4,-3,22,6);
    }
    ctx.restore();

    for (let i=0;i<this.level;i++) {
      ctx.fillStyle="gold";
      ctx.beginPath(); ctx.arc(this.x-9+i*9,this.y+16,3.5,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="rgba(0,0,0,0.4)"; ctx.lineWidth=1; ctx.stroke(); ctx.lineWidth=1;
    }
    if (isSel) {
      ctx.beginPath(); ctx.arc(this.x,this.y,this.range,0,Math.PI*2);
      ctx.fillStyle="rgba(210,220,230,0.13)"; ctx.fill();
      ctx.setLineDash([6,4]); ctx.strokeStyle="rgba(200,215,230,0.55)"; ctx.lineWidth=1.5;
      ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth=1;
    }
  }
}

// ═══════════════════════════════════════════════════
//  PROJECTILE
// ═══════════════════════════════════════════════════

class Projectile {
  constructor(x,y,target,damage,type,towerLevel) {
    this.x=x; this.y=y; this.target=target;
    this.damage=damage; this.type=type; this.towerLevel=towerLevel;
    this.active=true;
    if (type==="mortar") {
      this.ox=x; this.oy=y; this.tx=target.cx; this.ty=target.cy;
      const dist=Math.hypot(this.tx-x,this.ty-y);
      this.flightTime=Math.max(40,dist/4.5); this.elapsed=0;
      this.arcHeight=Math.min(180,dist*0.55);
    } else { this.speed=7; this.ox=x; this.oy=y; }
  }
  update() {
    if (this.type==="mortar") {
      this.elapsed++;
      const t=this.elapsed/this.flightTime;
      this.x=this.ox+(this.tx-this.ox)*t;
      this.y=this.oy+(this.ty-this.oy)*t-this.arcHeight*4*t*(1-t);
      if (this.elapsed>=this.flightTime) { this._hit(); this.active=false; }
      return;
    }
    if (!this.target||this.target.dead) { this.active=false; return; }
    const dx=this.target.cx-this.x, dy=this.target.cy-this.y, d=Math.hypot(dx,dy);
    if (d<10) { this._hit(); this.active=false; return; }
    this.x+=dx/d*this.speed; this.y+=dy/d*this.speed;
  }
  _hit() {
    const t=this.target;
    if (this.type==="cannon") {
      for (const e of enemies) {
        if (Math.hypot(e.cx-t.cx,e.cy-t.cy)<68) { e.health-=this.damage; if (e.health<=0&&!e.dead) killEnemy(e); }
      }
      spawnExplosion(t.cx,t.cy); spawnRing(t.cx,t.cy,"rgba(255,160,40,0.7)",72);
    } else if (this.type==="freeze") {
      for (const e of enemies) {
        if (e.dead||Math.hypot(e.cx-t.cx,e.cy-t.cy)>=FREEZE_AOE_R) continue;
        const canSlow=e.immuneToSlow?this.towerLevel>=3:true;
        if (canSlow) { e.frozen=160; e.frozenVisual=160; }
        else if (e===t) addFloat("IMMUNE!",e.cx,e.cy-12,"#ffd700");
      }
      spawnFreezeBurst(t.cx,t.cy); spawnRing(t.cx,t.cy,"rgba(100,220,255,0.7)",FREEZE_AOE_R);
    } else if (this.type==="fire") {
      t.burnDmg=this.damage; t.burnTimer=120; t.burnTick=20;
    } else if (this.type==="tesla") {
      const maxChain=1+this.towerLevel, hit=new Set([t]);
      t.health-=this.damage; if (t.health<=0&&!t.dead) killEnemy(t);
      spawnTeslaBurst(t.cx,t.cy);
      teslaArcs.push({x1:this.ox,y1:this.oy,x2:t.cx,y2:t.cy,life:10});
      let prev=t;
      for (let chain=0;chain<maxChain;chain++) {
        let next=null, bestD=Infinity;
        for (const e of enemies) {
          if (e.dead||hit.has(e)) continue;
          const d=Math.hypot(e.cx-prev.cx,e.cy-prev.cy);
          if (d<TESLA_CHAIN_R&&d<bestD) { bestD=d; next=e; }
        }
        if (!next) break;
        hit.add(next);
        teslaArcs.push({x1:prev.cx,y1:prev.cy,x2:next.cx,y2:next.cy,life:10});
        next.health-=Math.round(this.damage*Math.pow(0.75,chain+1));
        if (next.health<=0&&!next.dead) killEnemy(next);
        spawnTeslaBurst(next.cx,next.cy); prev=next;
      }
    } else if (this.type==="mortar") {
      const ix=this.tx, iy=this.ty;
      for (const e of enemies) {
        if (!e.dead&&Math.hypot(e.cx-ix,e.cy-iy)<MORTAR_AOE_R) { e.health-=this.damage; if (e.health<=0&&!e.dead) killEnemy(e); }
      }
      spawnExplosion(ix,iy,true);
      spawnRing(ix,iy,"rgba(200,100,0,0.9)",MORTAR_AOE_R);
      spawnRing(ix,iy,"rgba(255,200,80,0.6)",MORTAR_AOE_R*0.6);
      spawnRing(ix,iy,"rgba(255,255,200,0.4)",MORTAR_AOE_R*0.3);
    } else {
      t.health-=this.damage; if (t.health<=0&&!t.dead) killEnemy(t);
    }
  }
  draw() {
    if (this.type==="mortar") {
      const t=this.elapsed/this.flightTime;
      const groundX=this.ox+(this.tx-this.ox)*t, groundY=this.oy+(this.ty-this.oy)*t;
      ctx.save(); ctx.globalAlpha=0.15+0.35*t; ctx.fillStyle="#220800";
      ctx.beginPath(); ctx.ellipse(groundX,groundY,6+16*t,(6+16*t)*0.5,0,0,Math.PI*2); ctx.fill(); ctx.restore();
      if (t>0.6) {
        ctx.save(); ctx.globalAlpha=(t-0.6)/0.4*0.7;
        ctx.strokeStyle="#ff4400"; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(this.tx,this.ty,MORTAR_AOE_R*0.4,0,Math.PI*2); ctx.stroke(); ctx.restore();
      }
      const scale=0.7+0.6*(1-4*t*(1-t));
      ctx.save(); ctx.translate(this.x,this.y); ctx.scale(scale,scale);
      ctx.fillStyle="#cc8800"; ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#ffcc44"; ctx.beginPath(); ctx.arc(-2,-2,4,0,Math.PI*2); ctx.fill();
      ctx.restore(); return;
    }
    const r=this.type==="cannon"?8:this.type==="sniper"?5:this.type==="tesla"?5:6;
    ctx.fillStyle=TDEFS[this.type].color;
    ctx.beginPath(); ctx.arc(this.x,this.y,r,0,Math.PI*2); ctx.fill();
    if (this.type==="freeze"||this.type==="fire"||this.type==="tesla") {
      ctx.strokeStyle=this.type==="freeze"?"#aaeeff":this.type==="tesla"?"#ddaaff":"#ffdd44";
      ctx.lineWidth=1.5; ctx.stroke(); ctx.lineWidth=1;
    }
  }
}

// ═══════════════════════════════════════════════════
//  ENEMY
// ═══════════════════════════════════════════════════

class Enemy {
  constructor(type,scaleMult=1) {
    this.type=type; this.dist=0; this.dead=false;
    this.x=0; this.y=0; this.cx=0; this.cy=0;
    this.frozen=0; this.frozenVisual=0; this.burnDmg=0; this.burnTimer=0; this.burnTick=0;
    this.immuneToSlow=false;
    switch(type) {
      case "finalBoss": this.health=8000;this.speed=0.55;this.color="#110022";this.size=78;this.reward=300;this.immuneToSlow=true; break;
      case "boss":      this.health=600; this.speed=0.8; this.color="#1a1a2e";this.size=58;this.reward=70;  break;
      case "elite":     this.health=2200;this.speed=0.95;this.color="#3a0010";this.size=66;this.reward=140; this.immuneToSlow=true; break;
      case "fast":      this.health=35;  this.speed=2.8; this.color="#3a7ad4";this.size=26;this.reward=10;  break;
      case "tank":      this.health=180; this.speed=0.85;this.color="#3a8a3a";this.size=36;this.reward=22;  break;
      default:          this.health=80;  this.speed=1.5; this.color="#c43030";this.size=30;this.reward=14;
    }
    const isBig=type==="boss"||type==="elite"||type==="finalBoss";
    this.health=Math.round(this.health*scaleMult);
    if (isBig) this.speed=Math.min(this.speed*(1+(scaleMult-1)*0.35),this.speed*1.5);
    this.maxHealth=this.health; this.baseSpeed=this.speed;
    const p=posAtDist(0); this.cx=p.x; this.cy=p.y;
    this.x=p.x-this.size/2; this.y=p.y-this.size/2;
  }
  update() {
    this.speed=this.frozen>0?this.baseSpeed*0.28:this.baseSpeed;
    if (this.frozen>0) this.frozen--;
    if (this.frozenVisual>0) this.frozenVisual--;
    if (this.burnTimer>0) {
      this.burnTimer--; this.burnTick--;
      if (this.burnTick<=0) { this.health-=this.burnDmg; this.burnTick=20; if (this.health<=0&&!this.dead) { killEnemy(this); return; } }
    }
    this.dist+=this.speed;
    if (this.dist>=PATH_LEN) { this.dead=true; health-=(this.type==="finalBoss"?50:10); return; }
    const p=posAtDist(this.dist); this.cx=p.x; this.cy=p.y;
    this.x=p.x-this.size/2; this.y=p.y-this.size/2;
  }
  draw() {
    const T=performance.now();
    if (this.burnTimer>0) {
      ctx.fillStyle=`rgba(255,80,0,${0.4+0.25*Math.sin(T/55)})`;
      ctx.fillRect(this.x-4,this.y-4,this.size+8,this.size+8);
    }
    if (this.frozenVisual>0) {
      ctx.fillStyle="rgba(100,200,255,0.28)";
      ctx.fillRect(this.x-2,this.y-2,this.size+4,this.size+4);
    }
    if (this.type==="elite") {
      ctx.fillStyle=`rgba(220,175,0,${0.7+0.3*Math.sin(T/200)})`;
      ctx.fillRect(this.x-4,this.y-4,this.size+8,this.size+8);
    }
    if (this.type==="finalBoss") {
      ctx.fillStyle=`rgba(180,0,255,${0.3+0.25*(0.5+0.5*Math.sin(T/150))})`;
      ctx.fillRect(this.x-10,this.y-10,this.size+20,this.size+20);
      ctx.fillStyle=`rgba(255,0,80,${0.2+0.2*Math.sin(T/100)})`;
      ctx.fillRect(this.x-6,this.y-6,this.size+12,this.size+12);
    }
    ctx.fillStyle=this.color; ctx.fillRect(this.x,this.y,this.size,this.size);
    ctx.fillStyle="rgba(255,255,255,0.08)"; ctx.fillRect(this.x,this.y,this.size,3);
    ctx.fillStyle="rgba(0,0,0,0.2)"; ctx.fillRect(this.x,this.y+this.size-3,this.size,3);

    if (this.type==="finalBoss") {
      ctx.strokeStyle=`rgba(255,0,180,${0.6+0.4*Math.sin(T/120)})`; ctx.lineWidth=3;
      ctx.strokeRect(this.x+2,this.y+2,this.size-4,this.size-4); ctx.lineWidth=1;
      ctx.fillStyle=`rgba(255,100,200,${0.7+0.3*Math.sin(T/80)})`;
      ctx.beginPath(); ctx.arc(this.x+this.size*0.3,this.y+this.size*0.35,7,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(this.x+this.size*0.7,this.y+this.size*0.35,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#000";
      ctx.beginPath(); ctx.arc(this.x+this.size*0.3,this.y+this.size*0.35,3.5,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(this.x+this.size*0.7,this.y+this.size*0.35,3.5,0,Math.PI*2); ctx.fill();
    }

    const bw=this.size+4, ratio=Math.max(0,this.health/this.maxHealth);
    ctx.fillStyle="#111"; ctx.fillRect(this.x-2,this.y-9,bw,5);
    ctx.fillStyle=this.type==="finalBoss"?(ratio>0.5?"#cc44ff":ratio>0.25?"#ff44aa":"#ff0000"):(ratio>0.5?"#44ee44":ratio>0.25?"#eeaa22":"#ee2222");
    ctx.fillRect(this.x-2,this.y-9,bw*ratio,5);

    if (this.type==="boss"||this.type==="elite"||this.type==="finalBoss") {
      ctx.font="bold 9px monospace"; ctx.textAlign="center";
      ctx.fillStyle=this.type==="finalBoss"?"#ff44ff":this.type==="elite"?"#ffd700":"#eee";
      ctx.fillText(this.type==="finalBoss"?"⚠ FINAL BOSS":this.type==="elite"?"⚠ ELITE":"BOSS",this.cx,this.y-12);
      ctx.textAlign="left";
    }
    let iconX=this.cx;
    const iconY=this.y-(this.type==="elite"||this.type==="boss"||this.type==="finalBoss"?22:12);
    ctx.font="11px sans-serif"; ctx.textAlign="center";
    if (this.frozenVisual>0) { ctx.fillText("❄",iconX,iconY); iconX+=12; }
    if (this.burnTimer>0)    { ctx.fillText("🔥",iconX,iconY); }
    ctx.textAlign="left";
  }
}

function killEnemy(e) {
  e.dead=true; money+=e.reward; kills++;
  if (e.type==="finalBoss") {
    spawnFinalBossDeath(e.cx,e.cy); playSound("finalBossKill");
    addFloat("FINAL BOSS SLAIN!",e.cx,e.cy-20,"#ff44ff");
  } else {
    const isBig=e.type==="boss"||e.type==="elite";
    spawnDeathBurst(e.cx,e.cy,isBig?"#ffd700":e.color);
    if (isBig) { spawnExplosion(e.cx,e.cy,true); spawnRing(e.cx,e.cy,"rgba(255,220,50,0.8)",90); playSound("bossKill"); }
    else playSound("kill");
  }
}

function addFloat(text,x,y,color="white") { floats.push({text,x,y,color,life:65,total:65}); }

// ═══════════════════════════════════════════════════
//  WAVE SPAWNING
// ═══════════════════════════════════════════════════

function waveScale(w) { return 1+(w-1)*0.07; }
function bossScale(w) { return 1+(Math.floor(w/5)-1)*0.4; }

function spawnWave() {
  if (waveActive||gameOver||gameWon||isPaused) return;
  waveActive=true; selectedTower=null; updatePanel();
  document.getElementById("startWaveBtn").disabled=true;
  playSound("wave");

  function sched(fn,delay) { const id=setTimeout(fn,delay); waveTimeouts.push(id); return id; }
  const ws=waveScale(wave), bs=bossScale(wave);

  if (wave===MAX_WAVES) {
    const fes=bossScale(wave)*1.35;
    [
      {type:"fast",t:0,s:ws*1.5},{type:"fast",t:300,s:ws*1.5},{type:"tank",t:600,s:ws*1.5},
      {type:"fast",t:900,s:ws*1.5},{type:"tank",t:1200,s:ws*1.5},{type:"normal",t:1500,s:ws*1.5},{type:"normal",t:1800,s:ws*1.5},
      {type:"boss",t:2500,s:bs},{type:"boss",t:3500,s:bs*1.1},
      {type:"elite",t:5000,s:fes},{type:"elite",t:6500,s:fes*1.1},
      {type:"fast",t:7000,s:ws*1.5},{type:"tank",t:7300,s:ws*1.5},{type:"normal",t:7600,s:ws*1.5},{type:"fast",t:7900,s:ws*1.5},
      {type:"finalBoss",t:9500,s:1}
    ].forEach(e => sched(()=>{ if (!gameOver) enemies.push(new Enemy(e.type,e.s)); },e.t));
    return;
  }

  if (wave%5===0) {
    const n=wave/5+1;
    for (let i=0;i<n;i++) sched(()=>{ if (!gameOver) enemies.push(new Enemy("boss",bs*(1+i*0.08))); },i*1400);
    if (wave>=10) {
      const sc=Math.floor((wave/5)*3);
      for (let i=0;i<sc;i++) {
        sched(()=>{
          if (gameOver) return;
          const r=Math.random();
          enemies.push(new Enemy(r<0.45?"fast":r<0.75?"normal":"tank",ws));
        },600+i*350+(i%2===0?0:700));
      }
    }
    return;
  }

  const n=Math.floor(9+wave*2.5);
  for (let i=0;i<n;i++)
    sched(()=>{ if (gameOver) return; const r=Math.random(); enemies.push(new Enemy(r<0.55?"normal":r<0.8?"fast":"tank",ws)); },i*380);
}

// ═══════════════════════════════════════════════════
//  SIDEBAR PANEL
// ═══════════════════════════════════════════════════

function updatePanel() {
  const sidebar=document.getElementById("towerSidebar");
  if (!selectedTower) { sidebar.classList.remove("visible"); return; }
  sidebar.classList.add("visible");
  const t=selectedTower, s=upgradedStats(t.type,t.level), nc=t.level<3?UPGRADE_COSTS[t.level-1]:null;
  const dmgText=t.type==="freeze"?"AOE Slow":t.type==="fire"?`DOT ${s.damage}`:t.type==="tesla"?`${s.damage}+chain`:t.type==="mortar"?`${s.damage} splash`:`${s.damage}`;
  document.getElementById("sb-name").innerText=`${TDEFS[t.type].icon} ${TDEFS[t.type].label}`;
  document.getElementById("sb-level").innerText=`Level ${t.level}`;
  document.getElementById("sb-range").innerText=s.range;
  document.getElementById("sb-dmg").innerText=dmgText;
  document.getElementById("sb-rate").innerText=s.fireRate;
  const upBtn=document.getElementById("upBtn");
  if (nc===null) { upBtn.textContent="✦ MAX LEVEL"; upBtn.disabled=true; }
  else { upBtn.textContent=`⬆ Level ${t.level+1}  ($${nc})`; upBtn.disabled=money<nc; }
  document.getElementById("sellBtn").textContent=`Sell  (+$${t.sellValue()})`;
}

// ═══════════════════════════════════════════════════
//  UPDATE
// ═══════════════════════════════════════════════════

function update() {
  if (gameOver||gameWon||isPaused) return;
  towers.forEach(t=>t.update());
  enemies.forEach(e=>!e.dead&&e.update());
  projectiles.forEach(p=>p.update());
  particles.forEach(p=>p.update());
  rings.forEach(r=>{ r.r+=(r.maxR-r.r)*0.18; r.life-=0.07; });
  teslaArcs.forEach(a=>a.life--);
  enemies=enemies.filter(e=>!e.dead);
  projectiles=projectiles.filter(p=>p.active);
  particles=particles.filter(p=>p.life>0);
  rings=rings.filter(r=>r.life>0);
  floats=floats.filter(f=>--f.life>0);
  teslaArcs=teslaArcs.filter(a=>a.life>0);

  if (health<=0) { health=0; gameOver=true; return; }
  if (waveActive&&enemies.length===0) {
    waveActive=false; wave++;
    const waveBonus=30+Math.floor(wave*3);
    money+=waveBonus; addFloat(`+$${waveBonus}`,GW/2,80,"#ffd700");
    if (wave>MAX_WAVES) { gameWon=true; return; }
    document.getElementById("startWaveBtn").disabled=false;
    if (document.getElementById("autoWave").checked) { const id=setTimeout(spawnWave,1600); waveTimeouts.push(id); }
  }
  if (selectedTower) updatePanel();
}

// ═══════════════════════════════════════════════════
//  DRAW
// ═══════════════════════════════════════════════════

function drawGrass() { ctx.fillStyle=GRASS_COLOR; ctx.fillRect(0,0,GW,GH); }

function drawGrid() {
  ctx.strokeStyle="rgba(0,0,0,0.12)"; ctx.lineWidth=0.5;
  for (let x=0;x<GW;x+=GRID) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,GH); ctx.stroke(); }
  for (let y=0;y<GH;y+=GRID) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(GW,y); ctx.stroke(); }
  ctx.lineWidth=1;
}

function drawPath() {
  ctx.save(); ctx.lineCap="round"; ctx.lineJoin="round";
  const dc=()=>{ ctx.beginPath(); ctx.moveTo(BEZIER_SEGS[0][0].x,BEZIER_SEGS[0][0].y);
    for (const seg of BEZIER_SEGS) ctx.bezierCurveTo(seg[1].x,seg[1].y,seg[2].x,seg[2].y,seg[3].x,seg[3].y); ctx.stroke(); };
  ctx.lineWidth=PATH_W+14; ctx.strokeStyle="#7a6445"; dc();
  ctx.lineWidth=PATH_W;    ctx.strokeStyle="#cebe9c"; dc();
  ctx.lineWidth=PATH_W-18; ctx.strokeStyle="rgba(255,250,235,0.3)"; dc();
  ctx.lineWidth=2; ctx.strokeStyle="rgba(160,140,100,0.4)"; ctx.setLineDash([14,10]);
  ctx.beginPath(); ctx.moveTo(BEZIER_SEGS[0][0].x,BEZIER_SEGS[0][0].y);
  for (const seg of BEZIER_SEGS) ctx.bezierCurveTo(seg[1].x,seg[1].y,seg[2].x,seg[2].y,seg[3].x,seg[3].y);
  ctx.stroke(); ctx.setLineDash([]); ctx.restore();
}

function drawHover() {
  if (!hoverCell||selectedTower||isPaused) return;
  const {x:gx,y:gy}=hoverCell, cx=gx+GRID/2, cy=gy+GRID/2;
  const blocked=blockedCells.has(`${gx},${gy}`), occupied=towers.some(t=>t.x===cx&&t.y===cy);
  const canPlace=!blocked&&!occupied&&money>=TDEFS[selectedType].cost;
  ctx.fillStyle=canPlace?"rgba(80,255,80,0.18)":"rgba(255,60,60,0.22)";
  ctx.fillRect(gx,gy,GRID,GRID);
  ctx.strokeStyle=canPlace?"rgba(80,255,80,0.55)":"rgba(255,60,60,0.55)";
  ctx.lineWidth=1.5; ctx.strokeRect(gx,gy,GRID,GRID); ctx.lineWidth=1;
  if (canPlace) {
    const range=TDEFS[selectedType].range;
    ctx.beginPath(); ctx.arc(cx,cy,range,0,Math.PI*2);
    ctx.fillStyle="rgba(210,220,230,0.18)"; ctx.fill();
    ctx.strokeStyle="rgba(200,215,230,0.6)"; ctx.lineWidth=1.5; ctx.stroke(); ctx.lineWidth=1;
  }
}

function drawTeslaArcs() {
  for (const arc of teslaArcs) {
    ctx.save(); ctx.globalAlpha=arc.life/8;
    ctx.strokeStyle="#cc88ff"; ctx.shadowColor="#9944ff"; ctx.shadowBlur=10; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(arc.x1,arc.y1);
    ctx.quadraticCurveTo((arc.x1+arc.x2)/2+(Math.random()-0.5)*24,(arc.y1+arc.y2)/2+(Math.random()-0.5)*24,arc.x2,arc.y2);
    ctx.stroke(); ctx.restore();
  }
}

function drawParticles() {
  ctx.save(); particles.forEach(p=>p.draw());
  for (const r of rings) {
    ctx.globalAlpha=r.life*0.8; ctx.strokeStyle=r.color; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(r.x,r.y,r.r,0,Math.PI*2); ctx.stroke();
  }
  ctx.globalAlpha=1; ctx.lineWidth=1; ctx.restore();
}

function drawFloats() {
  ctx.save();
  for (const f of floats) {
    const p=1-f.life/f.total;
    ctx.globalAlpha=f.life/f.total; ctx.fillStyle=f.color;
    ctx.font="bold 13px monospace"; ctx.textAlign="center";
    ctx.fillText(f.text,f.x,f.y-p*32);
  }
  ctx.globalAlpha=1; ctx.textAlign="left"; ctx.restore();
}

function draw() {
  ctx.clearRect(0,0,GW,GH);
  drawGrass(); drawGrid(); drawPath(); drawHover();
  towers.forEach(t=>t.draw());
  drawParticles(); drawTeslaArcs();
  projectiles.forEach(p=>p.draw());
  enemies.forEach(e=>e.draw());
  drawFloats();

  document.getElementById("stat-health").textContent=health;
  document.getElementById("stat-money").textContent=money;
  document.getElementById("stat-kills").textContent=kills;
  document.getElementById("stat-wave").textContent=wave;

  if (gameOver) {
    ctx.fillStyle="rgba(0,0,0,0.72)"; ctx.fillRect(0,0,GW,GH);
    ctx.textAlign="center";
    ctx.font="bold 58px Georgia,serif"; ctx.fillStyle="#cc2222"; ctx.fillText("GAME OVER",GW/2,GH/2-16);
    ctx.font="20px Georgia,serif"; ctx.fillStyle="#aaa"; ctx.fillText(`Waves survived: ${wave-1}  ·  Kills: ${kills}`,GW/2,GH/2+28);
    ctx.fillStyle="#555"; ctx.font="15px monospace"; ctx.fillText("Press RESTART to try again",GW/2,GH/2+60);
    ctx.textAlign="left";
  }
  if (gameWon) {
    ctx.fillStyle="rgba(0,0,0,0.72)"; ctx.fillRect(0,0,GW,GH);
    ctx.textAlign="center";
    ctx.font="bold 58px Georgia,serif"; ctx.fillStyle="#ffd700"; ctx.fillText("VICTORY!",GW/2,GH/2-16);
    ctx.font="20px Georgia,serif"; ctx.fillStyle="#ccc"; ctx.fillText(`All 20 waves cleared  ·  ${kills} kills  ·  $${money}`,GW/2,GH/2+28);
    ctx.textAlign="left";
  }
}

function gameLoop() {
  if (isPaused) { loopId=null; return; }
  update(); draw();
  if (!gameOver&&!gameWon) loopId=requestAnimationFrame(gameLoop);
  else loopId=null;
}

// ═══════════════════════════════════════════════════
//  RESTART
// ═══════════════════════════════════════════════════

function doRestart() {
  waveTimeouts.forEach(id=>clearTimeout(id)); waveTimeouts=[];
  if (loopId) { cancelAnimationFrame(loopId); loopId=null; }
  towers=[]; enemies=[]; projectiles=[]; floats=[]; particles=[]; rings=[]; teslaArcs=[];
  money=150; kills=0; health=100; wave=1;
  waveActive=false; gameOver=false; gameWon=false; isPaused=false;
  document.getElementById("pauseOverlay").style.display="none";
  document.getElementById("pauseBtn").textContent="⏸";
  document.getElementById("pauseBtn").title="Pause (ESC)";
  document.getElementById("startWaveBtn").disabled=false;
  selectedTower=null; updatePanel();
  stopMusic();
  if (AC && AC.state==="running") startMusic();
  gameLoop();
}

// ═══════════════════════════════════════════════════
//  INPUT — mouse & touch 
// ═══════════════════════════════════════════════════

function handleTap(clientX, clientY) {
  if (gameOver||gameWon||isPaused) return;
  const {mx,my}=canvasCoords(clientX,clientY);
  const gx=Math.floor(mx/GRID)*GRID, gy=Math.floor(my/GRID)*GRID;
  const cx=gx+GRID/2, cy=gy+GRID/2;
  const hit=towers.find(t=>t.x===cx&&t.y===cy);
  if (hit) { selectedTower=selectedTower===hit?null:hit; updatePanel(); return; }
  selectedTower=null; updatePanel();
  if (blockedCells.has(`${gx},${gy}`)) return;
  if (towers.some(t=>t.x===cx&&t.y===cy)) return;
  const cost=TDEFS[selectedType].cost;
  if (money>=cost) { towers.push(new Tower(cx,cy,selectedType)); money-=cost; }
}

function handleMove(clientX, clientY) {
  const {mx,my}=canvasCoords(clientX,clientY);
  hoverCell={x:Math.floor(mx/GRID)*GRID, y:Math.floor(my/GRID)*GRID};
}

// Mouse
canvas.addEventListener("click",      e => handleTap(e.clientX,e.clientY));
canvas.addEventListener("mousemove",  e => handleMove(e.clientX,e.clientY));
canvas.addEventListener("mouseleave", () => { hoverCell=null; });

// Touch
canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  handleMove(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
}, { passive: false });
canvas.addEventListener("touchend", e => {
  e.preventDefault();
  handleTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  hoverCell=null;
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  handleMove(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
}, { passive: false });

// HUD buttons
document.querySelectorAll(".towerBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".towerBtn").forEach(b=>b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedType=btn.dataset.type; selectedTower=null; updatePanel();
  });
});

document.getElementById("pauseBtn").addEventListener("click", togglePause);
document.getElementById("upBtn").addEventListener("click",   () => { if (selectedTower) { selectedTower.upgrade(); updatePanel(); } });
document.getElementById("sellBtn").addEventListener("click",  () => {
  if (!selectedTower) return;
  const sv=selectedTower.sellValue(); money+=sv;
  addFloat(`+$${sv}`,selectedTower.x,selectedTower.y-10,"#55ff99");
  towers=towers.filter(t=>t!==selectedTower); selectedTower=null; updatePanel();
});
document.getElementById("startWaveBtn").addEventListener("click", spawnWave);
document.querySelectorAll(".restartTrigger").forEach(btn=>btn.addEventListener("click",doRestart));

gameLoop();