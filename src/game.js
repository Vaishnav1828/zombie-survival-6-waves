'use strict';
(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const $ = id => document.getElementById(id);
  const overlay = $("overlay"), titleEl = $("title"), messageEl = $("message"), startBtn = $("start"), toast = $("toast");
  const State = Object.freeze({ MENU:"MENU", PLAYING:"PLAYING", PAUSED:"PAUSED", GAME_OVER:"GAME_OVER", VICTORY:"VICTORY" });
  let state = State.MENU, player, wave = 1, score = 0, waveKills = 0, spawned = 0;
  let spawnTimer = .8, weaponTimer = 0, dropTimer = 2, fireCooldown = 0, toastTimer = 0, shake = 0, elapsed = 0, lastTime = 0;
  let soundOn = safeReadBool("afterdarkSound", false), audio = null, masterGain = null, highScore = safeRead("afterdarkBest", 0), totalKills = 0, weaponsCollected = 0;
  const keys = Object.create(null), pointer = { x:W/2, y:H/2, down:false, inside:false };
  const touchMove = { x:0, y:0, active:false, pointerId:null };
  let mobileAutoFire = false;
  const enemyPool = [], bulletPool = [], particlePool = [], enemies = [], bullets = [], particles = [], pickups = [];
  const rand = (a,b) => a + Math.random() * (b-a);
  const clamp = (n,a,b) => Math.max(a, Math.min(b,n));
  const dist = (x1,y1,x2,y2) => Math.hypot(x2-x1,y2-y1);
  function safeRead(key, fallback) { try { const n = Number(localStorage.getItem(key)); return Number.isFinite(n) && n >= 0 ? n : fallback; } catch (_) { return fallback; } }
  function safeReadBool(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : value === "true"; } catch (_) { return fallback; } }
  function fmt(n) { return String(Math.max(0, Math.floor(n))).padStart(5, "0"); }
  function getRank() { return score >= 10000 ? "S" : score >= 7500 ? "A" : score >= 5000 ? "B" : score >= 2500 ? "C" : "D"; }
  function wavePlan(n) { return { count:5+(n-1)*4, speed:52+(n-1)*8, ranged:n<3?0:Math.floor((n-1)*.85), health:2+Math.floor((n-1)/3), gap:Math.max(.28,.92-n*.085) }; }
  $("best").textContent = fmt(highScore);
  $("soundToggle").textContent = soundOn ? "♫ Sound: ON" : "♫ Sound: OFF";
  $("soundToggle").setAttribute("aria-pressed", String(soundOn));

  // Procedural sound effects: no external audio files or network requests.
  function initAudio() {
    if (audio) { if (audio.state === "suspended") audio.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { soundOn = false; $("soundToggle").textContent = "♫ Audio unavailable"; return; }
    audio = new AC(); masterGain = audio.createGain(); masterGain.gain.value = soundOn ? .24 : 0; masterGain.connect(audio.destination);
  }
  function tone(freq, dur, type, volume, slide, delay) {
    if (!soundOn) return;
    try {
      initAudio(); if (!audio || audio.state !== "running") return;
      const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime + (delay || 0);
      osc.type = type || "sine"; osc.frequency.setValueAtTime(Math.max(30,freq),now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*(slide || 1)),now+dur);
      gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume || .1),now+.008);
      gain.gain.exponentialRampToValueAtTime(.0001,now+dur); osc.connect(gain); gain.connect(masterGain); osc.start(now); osc.stop(now+dur+.02);
    } catch (_) {}
  }
  function noise(dur, volume, cutoff) {
    if (!soundOn) return;
    try {
      initAudio(); if (!audio || audio.state !== "running") return;
      const n = Math.max(1,Math.floor(audio.sampleRate*dur)), buffer = audio.createBuffer(1,n,audio.sampleRate), data = buffer.getChannelData(0);
      for (let i=0;i<n;i++) data[i]=(Math.random()*2-1)*(1-i/n);
      const src=audio.createBufferSource(), filter=audio.createBiquadFilter(), gain=audio.createGain();
      filter.type="lowpass"; filter.frequency.value=cutoff || 1000; gain.gain.value=volume || .12;
      src.buffer=buffer; src.connect(filter); filter.connect(gain); gain.connect(masterGain); src.start();
    } catch (_) {}
  }
  function sfx(kind) {
    if (!soundOn) return;
    if (kind==="shoot") { tone(180,.075,"square",.12,.45); noise(.045,.09,1800); }
    else if (kind==="shotgun") { noise(.22,.3,800); tone(82,.18,"sawtooth",.2,.45); }
    else if (kind==="hit") { tone(105,.12,"triangle",.15,.55); noise(.06,.1,600); }
    else if (kind==="damage") tone(120,.2,"sawtooth",.22,.55);
    else if (kind==="kill") { tone(480,.055,"triangle",.1,1.4); tone(690,.08,"sine",.08,.6,.045); }
    else if (kind==="pickup") { tone(530,.09,"sine",.14,1.4); tone(790,.14,"sine",.12,1.12,.09); }
    else if (kind==="ranged") tone(260,.07,"square",.08,.7);
    else if (kind==="wave") { [330,440,660].forEach((n,i)=>tone(n,.22,"triangle",.12,1.15,i*.16)); }
    else if (kind==="gameover") { tone(240,.36,"sawtooth",.16,.62); tone(165,.55,"sawtooth",.16,.55,.28); }
    else if (kind==="victory") [392,494,587,784].forEach((n,i)=>tone(n,.3,"triangle",.14,1.05,i*.12));
    else if (kind==="miss") tone(240,.15,"sine",.1,.6);
    else if (kind==="click") tone(430,.035,"sine",.07,.9);
  }
  $("soundToggle").addEventListener("click", () => {
    soundOn = !soundOn;
    try { localStorage.setItem("afterdarkSound", String(soundOn)); } catch (_) {}
    initAudio();
    if (masterGain && audio) { audio.resume(); masterGain.gain.setTargetAtTime(soundOn?.24:0,audio.currentTime,.025); }
    $("soundToggle").textContent = soundOn ? "♫ Sound: ON" : "♫ Sound: OFF";
    $("soundToggle").setAttribute("aria-pressed",String(soundOn));
    if (soundOn) { sfx("pickup"); showToast("AUDIO SYSTEM ONLINE"); }
  });

  // Pools recycle enemies, projectiles and hit particles.
  const enemyFactory = () => ({type:"chaser",x:0,y:0,r:14,hp:2,maxHp:2,speed:55,shoot:1,strafe:1,flash:0,active:false});
  const bulletFactory = () => ({x:0,y:0,vx:0,vy:0,r:3,life:1,damage:1,enemy:false,active:false});
  const particleFactory = () => ({x:0,y:0,vx:0,vy:0,life:.3,maxLife:.3,size:2,color:"#fff",active:false});
  function obtain(pool,factory) { return pool.pop() || factory(); }
  function release(list,obj,pool) { const i=list.indexOf(obj); if(i>=0)list.splice(i,1); obj.active=false; pool.push(obj); }
  function clearWorld() {
    while(enemies.length) release(enemies,enemies[enemies.length-1],enemyPool);
    while(bullets.length) release(bullets,bullets[bullets.length-1],bulletPool);
    while(particles.length) release(particles,particles[particles.length-1],particlePool);
    pickups.length=0;
  }
  function resetPlayer() { player={x:W/2,y:H/2,r:13,hp:100,maxHp:100,speed:242,weapon:null,ammo:0,invuln:0,angle:0}; }
  function showToast(text) { toast.textContent=text;toast.classList.add("show");toastTimer=2.2; }
  function beginGame() {
    initAudio(); clearWorld(); resetPlayer(); wave=1;score=0;waveKills=0;spawned=0;spawnTimer=.8;weaponTimer=0;dropTimer=2.4;
    fireCooldown=0;elapsed=0;totalKills=0;weaponsCollected=0;state=State.PLAYING;overlay.classList.add("hidden");
    $("statusLine").textContent="OBJECTIVE: SURVIVE. ADAPT. ESCAPE."; startWave();
  }
  function startWave() {
    const p=wavePlan(wave);waveKills=0;spawned=0;spawnTimer=1.1;
    showToast("WAVE "+String(wave).padStart(2,"0")+"  //  "+p.count+" INFECTED");
    $("statusLine").textContent="WAVE "+wave+"/6  •  ELIMINATE "+p.count+" INFECTED";sfx("wave");
  }
  function edgeSpawn() {
    const side=Math.floor(Math.random()*4);
    if(side===0)return {x:rand(0,W),y:-20}; if(side===1)return {x:W+20,y:rand(0,H)};
    if(side===2)return {x:rand(0,W),y:H+20}; return {x:-20,y:rand(0,H)};
  }
  function spawnEnemy() {
    const plan=wavePlan(wave),e=obtain(enemyPool,enemyFactory),currentRanged=enemies.filter(x=>x.type==="ranged").length;
    const ranged=currentRanged<plan.ranged&&Math.random()<.7,p=edgeSpawn();
    Object.assign(e,{active:true,type:ranged?"ranged":"chaser",x:p.x,y:p.y,hp:plan.health+(ranged?1:0),maxHp:plan.health+(ranged?1:0),
      speed:plan.speed*(ranged?.76:1),r:ranged?16:14,shoot:rand(.7,1.8),strafe:Math.random()<.5?-1:1,flash:0});
    enemies.push(e);spawned++;
  }
  function spawnWeapon() {
    const roll=Math.random(),type=roll<.34?"SHOTGUN":roll<.68?"SMG":"RIFLE";
    pickups.push({x:rand(65,W-65),y:rand(65,H-65),type,life:10,phase:0});
    showToast(type+" SIGNAL DETECTED\n10 SECONDS TO COLLECT");
    tone(620,.1,"sine",.12,1.3);tone(860,.16,"sine",.1,1.1,.11);
  }
  function spawnBullet(x,y,vx,vy,enemy,damage,r,life) {
    const b=obtain(bulletPool,bulletFactory);
    Object.assign(b,{active:true,x,y,vx,vy,enemy:!!enemy,damage:damage||1,r:r||3,life:life||1.2});bullets.push(b);return b;
  }
  function burst(x,y,color,count,power) {
    for(let i=0;i<count;i++){const p=obtain(particlePool,particleFactory),a=Math.random()*Math.PI*2,s=rand(power*.25,power);
      Object.assign(p,{active:true,x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.18,.5),maxLife:.5,size:rand(1.5,4),color});particles.push(p);}
  }
  function fire() {
    if(state!==State.PLAYING||!player.weapon||player.ammo<=0||fireCooldown>0)return;
    if(mobileAutoFire){if(enemies.length){let target=enemies[0],best=dist(player.x,player.y,target.x,target.y);for(let i=1;i<enemies.length;i++){const candidate=enemies[i],d=dist(player.x,player.y,candidate.x,candidate.y);if(d<best){target=candidate;best=d;}}player.angle=Math.atan2(target.y-player.y,target.x-player.x);}}else{const dx=pointer.x-player.x,dy=pointer.y-player.y,d=Math.hypot(dx,dy)||1;player.angle=Math.atan2(dy,dx);}
    const shot=(a,damage,speed)=>spawnBullet(player.x+Math.cos(a)*16,player.y+Math.sin(a)*16,Math.cos(a)*speed,Math.sin(a)*speed,false,damage,player.weapon==="SHOTGUN"?3.7:2.8,1.15);
    if(player.weapon==="SHOTGUN"){
      for(let i=0;i<7;i++)shot(player.angle+rand(-.24,.24),2.4,570);
      player.ammo--;fireCooldown=.56;sfx("shotgun");shake=7;burst(player.x+Math.cos(player.angle)*25,player.y+Math.sin(player.angle)*25,"#ffc66b",5,65);
    } else {
      shot(player.angle+rand(-.018,.018),player.weapon==="RIFLE"?1.8:1,player.weapon==="RIFLE"?780:690);
      player.ammo--;fireCooldown=player.weapon==="SMG"?.105:.22;sfx("shoot");shake=Math.max(shake,2);
    }
  }
  function loseWeapon() { player.weapon=null;player.ammo=0;weaponTimer=0;dropTimer=rand(7,10);showToast("UNARMED // EVADE UNTIL NEXT DROP");sfx("miss"); }
  function collectWeapon(p) {
    player.weapon=p.type;player.ammo=p.type==="SHOTGUN"?10:p.type==="SMG"?48:22;
    weaponTimer=p.type==="SHOTGUN"?13:p.type==="SMG"?16:18;weaponsCollected++;score+=50;
    showToast(p.type+" EQUIPPED  •  "+player.ammo+" ROUNDS");sfx("pickup");burst(p.x,p.y,"#ffd166",16,180);
  }
  function damagePlayer(amount) {
    if(player.invuln>0)return;player.hp-=amount;player.invuln=.22;shake=Math.max(shake,5);sfx("damage");burst(player.x,player.y,"#ff5c66",5,100);
  }
  function killEnemy(e) {
    score+=e.type==="ranged"?150:100;waveKills++;totalKills++;burst(e.x,e.y,e.type==="ranged"?"#c99bff":"#69e0a4",12,150);
    sfx("kill");release(enemies,e,enemyPool);
  }
  function update(dt) {
    if(state!==State.PLAYING)return;
    elapsed+=dt;fireCooldown=Math.max(0,fireCooldown-dt);player.invuln=Math.max(0,player.invuln-dt);shake=Math.max(0,shake-dt*24);
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)toast.classList.remove("show");}
    const dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0)+touchMove.x;
    const dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0)+touchMove.y;
    if(dx||dy){const d=Math.hypot(dx,dy);player.x+=dx/d*player.speed*dt;player.y+=dy/d*player.speed*dt;}
    player.x=clamp(player.x,17,W-17);player.y=clamp(player.y,17,H-17);
    if(pointer.inside)player.angle=Math.atan2(pointer.y-player.y,pointer.x-player.x);
    if(mobileAutoFire && enemies.length){let target=enemies[0],best=dist(player.x,player.y,target.x,target.y);for(let i=1;i<enemies.length;i++){const candidate=enemies[i],d=dist(player.x,player.y,candidate.x,candidate.y);if(d<best){target=candidate;best=d;}}player.angle=Math.atan2(target.y-player.y,target.x-player.x);}
    if(pointer.down||keys.space||mobileAutoFire)fire();
    if(player.weapon){weaponTimer-=dt;if(weaponTimer<=0||player.ammo<=0)loseWeapon();}
    else {dropTimer-=dt;if(dropTimer<=0&&!pickups.length)spawnWeapon();}
    for(let i=pickups.length-1;i>=0;i--){
      const p=pickups[i];p.life-=dt;p.phase+=dt;
      if(dist(p.x,p.y,player.x,player.y)<player.r+18){collectWeapon(p);pickups.splice(i,1);continue;}
      if(p.life<=0){pickups.splice(i,1);showToast("WEAPON SIGNAL LOST — KEEP MOVING");dropTimer=rand(6,9);}
    }
    const plan=wavePlan(wave);
    if(spawned<plan.count){spawnTimer-=dt;if(spawnTimer<=0&&enemies.length<Math.min(15,plan.count)){spawnEnemy();spawnTimer=plan.gap;}}
    for(let i=bullets.length-1;i>=0;i--){
      const b=bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      if(b.life<=0||b.x<-30||b.x>W+30||b.y<-30||b.y>H+30){release(bullets,b,bulletPool);continue;}
      if(b.enemy){if(dist(b.x,b.y,player.x,player.y)<player.r+b.r){damagePlayer(10);release(bullets,b,bulletPool);}continue;}
      let hit=false;
      for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(dist(b.x,b.y,e.x,e.y)<e.r+b.r){e.hp-=b.damage;e.flash=.08;burst(b.x,b.y,"#ffe4b0",3,45);release(bullets,b,bulletPool);hit=true;if(e.hp<=0)killEnemy(e);break;}}
      if(hit)continue;
    }
    for(const e of enemies){
      const ex=player.x-e.x,ey=player.y-e.y,d=Math.hypot(ex,ey)||1;e.flash=Math.max(0,e.flash-dt);
      if(e.type==="chaser"){e.x+=ex/d*e.speed*dt;e.y+=ey/d*e.speed*dt;if(d<e.r+player.r+1)damagePlayer(23*dt);}
      else{
        if(d>255){e.x+=ex/d*e.speed*dt;e.y+=ey/d*e.speed*dt;}
        else if(d<185){e.x-=ex/d*e.speed*dt;e.y-=ey/d*e.speed*dt;}
        e.x+=(-ey/d*e.strafe)*e.speed*.34*dt;e.y+=(ex/d*e.strafe)*e.speed*.34*dt;
        e.shoot-=dt;if(e.shoot<=0&&d<490){const a=Math.atan2(ey,ex);spawnBullet(e.x+Math.cos(a)*e.r,e.y+Math.sin(a)*e.r,Math.cos(a)*245,Math.sin(a)*245,true,1,4,2.6);e.shoot=rand(1.9,2.7);sfx("ranged");}
      }
      e.x=clamp(e.x,-22,W+22);e.y=clamp(e.y,-22,H+22);
    }
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);p.life-=dt;if(p.life<=0)release(particles,p,particlePool);}
    if(player.hp<=0){finish(false);return;}
    if(waveKills>=plan.count&&enemies.length===0){
      score+=500;if(wave>=6){finish(true);return;}wave++;startWave();if(!player.weapon)dropTimer=2.8;
    }
  }
  function formatTime(sec){const n=Math.floor(sec);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
  function finish(won) {
    state=won?State.VICTORY:State.GAME_OVER;
    if(score>highScore){highScore=score;try{localStorage.setItem("afterdarkBest",String(highScore));}catch(_){}}
    $("best").textContent=fmt(highScore);overlay.classList.remove("hidden");startBtn.textContent=won?"RUN IT BACK":"RETRY RUN";
    $("statusLine").textContent=won?"MISSION COMPLETE  •  SUNRISE ACHIEVED":"SIGNAL LOST  •  SUBJECT OVERRUN";
    titleEl.innerHTML=won?"SUNRISE<br><span>SECURED.</span>":"YOU BECAME<br><span>THE HUNT.</span>";
    messageEl.innerHTML=won?"All six waves cleared. You survived the quarantine.<br><br>Score <b>"+fmt(score)+"</b> · Rank <span class=\"rank\">"+getRank()+"</span><br><small>"+totalKills+" infected eliminated · "+weaponsCollected+" weapons collected · "+formatTime(elapsed)+" survived</small>":
      "The infected overran your position.<br><br>Score <b>"+fmt(score)+"</b> · Rank <span class=\"rank\">"+getRank()+"</span><br><small>Wave "+Math.min(wave,6)+" · "+totalKills+" infected eliminated · Best "+fmt(highScore)+"</small>";
    document.querySelector(".eyebrow").textContent=won?"TRANSMISSION // ALL CLEAR":"TRANSMISSION // SIGNAL LOST";
    document.querySelector(".feature-row").innerHTML="<span class=\"feature\">"+totalKills+" KILLS</span><span class=\"feature\">"+weaponsCollected+" WEAPONS</span><span class=\"feature\">"+formatTime(elapsed)+" SURVIVED</span>";
    sfx(won?"victory":"gameover");
  }
  function pause() {
    if(state===State.PLAYING){
      state=State.PAUSED;overlay.classList.remove("hidden");titleEl.innerHTML="TAKE A<br><span>BREATHER.</span>";
      messageEl.textContent="The quarantine is paused. Enemies, weapon timers, and physics are frozen.";
      startBtn.textContent="RESUME SURVIVAL";document.querySelector(".eyebrow").textContent="SYSTEM PAUSED";
      document.querySelector(".feature-row").innerHTML="<span class=\"feature\">Simulation frozen</span><span class=\"feature\">Press P to resume</span>";pointer.down=false;
    } else if(state===State.PAUSED){state=State.PLAYING;overlay.classList.add("hidden");}
  }
  function resetOverlay() {
    titleEl.innerHTML="THE NIGHT<br><span>IS HUNGRY.</span>";
    messageEl.textContent="Six waves stand between you and sunrise. Timed weapons are your only advantage. Find them, fight smart, and do not get surrounded.";
    document.querySelector(".eyebrow").textContent="Emergency Broadcast // 06";
    document.querySelector(".feature-row").innerHTML="<span class=\"feature\">6 escalating waves</span><span class=\"feature\">2 enemy classes</span><span class=\"feature\">Timed weapon drops</span>";
    startBtn.textContent="ENTER THE QUARANTINE";
  }
  let decor=[];
  function makeDecor(){
    decor=[];
    for(let i=0;i<95;i++)decor.push({x:rand(12,W-12),y:rand(12,H-12),r:rand(1,3),kind:Math.random()<.67?"grass":"debris",a:rand(.08,.28)});
    for(let i=0;i<10;i++)decor.push({x:rand(55,W-55),y:rand(50,H-50),r:rand(14,27),kind:"stain",a:rand(.045,.09)});
  }
  makeDecor();
  function drawBackdrop(){
    ctx.fillStyle="#0b1218";ctx.fillRect(0,0,W,H);ctx.save();ctx.strokeStyle="#17232b";ctx.lineWidth=1;
    for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    ctx.fillStyle="#101a20";ctx.fillRect(0,265,W,72);ctx.fillRect(440,0,68,H);
    ctx.strokeStyle="#28343a";ctx.setLineDash([12,14]);ctx.beginPath();ctx.moveTo(0,301);ctx.lineTo(W,301);ctx.moveTo(474,0);ctx.lineTo(474,H);ctx.stroke();ctx.setLineDash([]);
    for(const d of decor){
      ctx.globalAlpha=d.a;
      if(d.kind==="stain"){ctx.fillStyle="#456052";ctx.beginPath();ctx.ellipse(d.x,d.y,d.r*1.5,d.r,0,0,Math.PI*2);ctx.fill();}
      else if(d.kind==="grass"){ctx.strokeStyle="#5b7559";ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x+d.r,d.y-d.r*1.7);ctx.stroke();}
      else{ctx.fillStyle="#82909a";ctx.fillRect(d.x,d.y,d.r*2,d.r*.7);}
    }
    ctx.globalAlpha=1;
    for(let i=0;i<12;i++){const x=(i%6)*177+16,y=i<6?17:H-33;ctx.fillStyle="#1a2428";ctx.fillRect(x,y,38,16);ctx.strokeStyle="#35423f";ctx.strokeRect(x,y,38,16);ctx.strokeStyle="#28342f";ctx.beginPath();ctx.moveTo(x+5,y+4);ctx.lineTo(x+31,y+12);ctx.moveTo(x+31,y+3);ctx.lineTo(x+7,y+13);ctx.stroke();}
    const fog=ctx.createRadialGradient(W/2,H/2,70,W/2,H/2,460);fog.addColorStop(0,"#0b111100");fog.addColorStop(1,"#02050ac9");ctx.fillStyle=fog;ctx.fillRect(0,0,W,H);ctx.restore();
  }
  function drawPickup(p){
    const pulse=1+Math.sin(p.phase*7)*.13;ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=.28+Math.sin(p.phase*6)*.08;
    ctx.fillStyle="#ffd166";ctx.beginPath();ctx.arc(0,0,29*pulse,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.rotate(Math.PI/4);
    ctx.fillStyle="#352b17";ctx.fillRect(-13,-13,26,26);ctx.strokeStyle="#ffd166";ctx.lineWidth=2;ctx.strokeRect(-13,-13,26,26);
    ctx.rotate(-Math.PI/4);ctx.fillStyle="#ffd166";ctx.fillRect(-7,-2,14,4);ctx.fillRect(-2,-7,4,14);ctx.restore();
    ctx.fillStyle="#ffe6a3";ctx.textAlign="center";ctx.font="800 10px system-ui";ctx.fillText(p.type+"  "+Math.ceil(p.life)+"s",p.x,p.y-23);
  }
  function drawEnemy(e){
    ctx.save();ctx.translate(e.x,e.y);const ranged=e.type==="ranged";if(e.flash>0)ctx.globalAlpha=.6;
    ctx.fillStyle=ranged?"#7c4bb0":"#338f68";ctx.beginPath();ctx.ellipse(0,2,e.r*1.03,e.r*.91,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=ranged?"#b78bde":"#61d6a0";ctx.beginPath();ctx.arc(-2,-4,e.r*.64,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#11161c";ctx.beginPath();ctx.arc(-6,-6,2.2,0,Math.PI*2);ctx.arc(3,-6,2.2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#ff6c67";ctx.fillRect(-4,1,7,2);ctx.strokeStyle=ranged?"#d6b0ff":"#a1ffd2";ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(-e.r*.7,e.r*.45);ctx.lineTo(-e.r*1.15,e.r*.95);ctx.moveTo(e.r*.7,e.r*.45);ctx.lineTo(e.r*1.15,e.r*.95);ctx.stroke();
    if(ranged){ctx.strokeStyle="#dfbdff";ctx.beginPath();ctx.arc(0,0,e.r+4,0,Math.PI*2);ctx.stroke();}ctx.restore();
    if(e.hp<e.maxHp){ctx.fillStyle="#111a20";ctx.fillRect(e.x-e.r,e.y-e.r-8,e.r*2,3);ctx.fillStyle=ranged?"#c69cff":"#66e6a4";ctx.fillRect(e.x-e.r,e.y-e.r-8,e.r*2*clamp(e.hp/e.maxHp,0,1),3);}
  }
  function drawPlayer(){
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);
    if(player.invuln>0&&Math.floor(elapsed*28)%2===0)ctx.globalAlpha=.48;
    ctx.fillStyle="#0b0f14";ctx.beginPath();ctx.arc(0,3,17,0,Math.PI*2);ctx.fill();ctx.fillStyle="#2a6c93";ctx.beginPath();ctx.arc(0,0,player.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#77c9f4";ctx.beginPath();ctx.arc(-2,-3,player.r*.65,0,Math.PI*2);ctx.fill();ctx.fillStyle="#d3f0ff";ctx.fillRect(3,-4,19,8);
    ctx.fillStyle="#24394a";ctx.fillRect(8,-2,9,4);ctx.restore();
    if(player.invuln>0){ctx.strokeStyle="#ff6670";ctx.lineWidth=2;ctx.beginPath();ctx.arc(player.x,player.y,player.r+5,0,Math.PI*2);ctx.stroke();}
  }
  function draw(){
    ctx.save();if(shake>0)ctx.translate(rand(-shake,shake),rand(-shake,shake));drawBackdrop();
    for(const p of pickups)drawPickup(p);
    for(const b of bullets){ctx.fillStyle=b.enemy?"#ff9b65":"#e8f5ff";ctx.shadowBlur=b.enemy?12:8;ctx.shadowColor=b.enemy?"#ff5a47":"#9ddcff";ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();}
    ctx.shadowBlur=0;for(const e of enemies)drawEnemy(e);
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);}
    ctx.globalAlpha=1;if(player)drawPlayer();ctx.restore();
    if(player){
      $("hp").textContent=Math.ceil(Math.max(0,player.hp));$("healthBar").style.width=clamp(player.hp,0,100)+"%";
      $("healthBar").style.background=player.hp<35?"#ff5966":"#59e0a0";
      $("weapon").textContent=player.weapon?player.weapon+" · "+player.ammo:"UNARMED";
      $("timer").textContent=player.weapon?Math.ceil(weaponTimer)+"s":pickups.length?Math.ceil(pickups[0].life)+"s DROP":Math.ceil(Math.max(0,dropTimer))+"s";
      $("timer").style.color=!player.weapon&&!pickups.length?"#8ea0b4":"#ffd166";
      $("wave").textContent=String(Math.min(wave,6)).padStart(2,"0")+" / 06";$("score").textContent=fmt(score);$("best").textContent=fmt(highScore);
    }
  }
  function loop(t){const dt=Math.min(.032,(t-lastTime)/1000||0);lastTime=t;update(dt);draw();requestAnimationFrame(loop);}
  function pointerPos(e){const r=canvas.getBoundingClientRect();pointer.x=(e.clientX-r.left)*W/r.width;pointer.y=(e.clientY-r.top)*H/r.height;pointer.inside=true;}
  window.addEventListener("keydown",e=>{
    const code=e.code;
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(code))e.preventDefault();
    keys[e.key.toLowerCase()]=true;keys[code.toLowerCase()]=true;
    if((e.key.toLowerCase()==="p")&&!e.repeat)pause();
    if(e.key.toLowerCase()==="r"&&!e.repeat&&state!==State.PLAYING&&state!==State.PAUSED){resetOverlay();beginGame();}
    if(code==="Space"&&state===State.PLAYING)fire();
  },{passive:false});
  window.addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=false;keys[e.code.toLowerCase()]=false;});
  canvas.addEventListener("pointermove",pointerPos);
  canvas.addEventListener("pointerdown",e=>{pointerPos(e);if(e.button===0){pointer.down=true;if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);if(state===State.PLAYING)fire();}});
  window.addEventListener("pointerup",()=>pointer.down=false);
  canvas.addEventListener("pointerleave",()=>{pointer.inside=false;});
  // Mobile joystick: pointer movement maps to a normalized direction.
  const movePad = $("movePad"), moveKnob = $("moveKnob"), fireTouch = $("fireTouch");
  function updateTouchStick(e) {
    const rect = movePad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const maxRadius = Math.max(22, rect.width * .34);
    let dx = (e.clientX - cx) / maxRadius, dy = (e.clientY - cy) / maxRadius;
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    touchMove.x = dx; touchMove.y = dy;
    moveKnob.style.transform = "translate(calc(-50% + " + (dx * maxRadius) + "px), calc(-50% + " + (dy * maxRadius) + "px))";
  }
  function releaseTouchStick(e) {
    if (touchMove.pointerId !== null && e.pointerId !== touchMove.pointerId) return;
    touchMove.x = 0; touchMove.y = 0; touchMove.active = false; touchMove.pointerId = null;
    moveKnob.style.transform = "translate(-50%,-50%)";
  }
  movePad.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation();
    touchMove.active = true; touchMove.pointerId = e.pointerId;
    if (movePad.setPointerCapture) movePad.setPointerCapture(e.pointerId);
    updateTouchStick(e);
  });
  movePad.addEventListener("pointermove", e => {
    if (touchMove.active && e.pointerId === touchMove.pointerId) { e.preventDefault(); updateTouchStick(e); }
  });
  movePad.addEventListener("pointerup", releaseTouchStick);
  movePad.addEventListener("pointercancel", releaseTouchStick);
  movePad.addEventListener("lostpointercapture", releaseTouchStick);
  fireTouch.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation();
    mobileAutoFire = true;
    if (fireTouch.setPointerCapture) fireTouch.setPointerCapture(e.pointerId);
    if (state === State.PLAYING && player.weapon) fire();
  });
  function stopTouchFire() { mobileAutoFire = false; }
  fireTouch.addEventListener("pointerup", stopTouchFire);
  fireTouch.addEventListener("pointercancel", stopTouchFire);
  fireTouch.addEventListener("lostpointercapture", stopTouchFire);
  startBtn.addEventListener("click",()=>{
    sfx("click");if(state===State.PAUSED){pause();return;}resetOverlay();beginGame();
  });
  resetPlayer();requestAnimationFrame(loop);
})();
