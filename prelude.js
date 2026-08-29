// Boot-time helpers. This file is intentionally loaded before game-core.js because
// game-core creates its textures immediately during script evaluation.
function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

function wallpaperTexture(){
  const size=256,c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d',{alpha:false}),img=ctx.createImageData(size,size),rng=mulberry32(0x3f9a1012);
  for(let i=0;i<img.data.length;i+=4){const n=(rng()-.5)*18;img.data[i]=194+n;img.data[i+1]=190+n;img.data[i+2]=157+n*.7;img.data[i+3]=255;}ctx.putImageData(img,0,0);
  ctx.globalAlpha=.11;for(let x=0;x<size;x+=4){ctx.fillStyle=x%8?'#e7dfb8':'#706a4d';ctx.fillRect(x,0,1,size);}
  ctx.globalAlpha=.26;ctx.strokeStyle='#70694d';ctx.fillStyle='#696246';ctx.lineWidth=1;
  for(let y=-12;y<size+22;y+=30)for(let x=-12;x<size+22;x+=22){const off=((y/30)&1)?11:0,px=x+off;ctx.beginPath();ctx.moveTo(px,y+2);ctx.quadraticCurveTo(px+5,y+7,px,y+13);ctx.quadraticCurveTo(px-5,y+7,px,y+2);ctx.stroke();ctx.beginPath();ctx.moveTo(px-4,y+20);ctx.lineTo(px,y+25);ctx.lineTo(px+4,y+20);ctx.stroke();ctx.fillRect(px-1,y+16,2,2);}
  ctx.globalAlpha=.055;ctx.fillStyle='#443f2b';for(let i=0;i<18;i++){ctx.beginPath();ctx.ellipse(rng()*size,rng()*size,3+rng()*16,6+rng()*24,rng()*Math.PI,0,Math.PI*2);ctx.fill();}
  return new THREE.CanvasTexture(c);
}
function carpetTexture(){return fiberTexture(256,145,128,87,0x2a7011);}
function concreteTexture(){return fiberTexture(256,150,149,138,0xc0ffee);}
function fiberTexture(size,r,g,b,seed){const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),img=ctx.createImageData(size,size),rng=mulberry32(seed);for(let i=0;i<img.data.length;i+=4){const n=(rng()-.5)*32;img.data[i]=r+n;img.data[i+1]=g+n*.9;img.data[i+2]=b+n*.72;img.data[i+3]=255;}ctx.putImageData(img,0,0);ctx.globalAlpha=.11;ctx.strokeStyle='#f2edc9';for(let i=0;i<650;i++){const x=rng()*size,y=rng()*size;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rng()-.5)*3,y+rng()*2.2);ctx.stroke();}return new THREE.CanvasTexture(c);}
function tileTexture(){const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),rng=mulberry32(0x71ae9);ctx.fillStyle='#d7d7c9';ctx.fillRect(0,0,size,size);ctx.strokeStyle='#7d8077';ctx.lineWidth=2;for(let x=0;x<=size;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,size);ctx.stroke();}for(let y=0;y<=size;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(size,y);ctx.stroke();}ctx.globalAlpha=.12;ctx.fillStyle='#6f716b';for(let i=0;i<90;i++)ctx.fillRect(rng()*size,rng()*size,1,1);return new THREE.CanvasTexture(c);}
function woodTexture(){const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),rng=mulberry32(0x7700aa);ctx.fillStyle='#a58a66';ctx.fillRect(0,0,size,size);for(let y=0;y<size;y+=20){ctx.fillStyle=y%40?'#8a7254':'#b69a73';ctx.fillRect(0,y,size,2);for(let x=0;x<size;x+=70){ctx.fillStyle='rgba(45,34,25,.18)';ctx.fillRect(x+rng()*20,y+2,1,18);}}return new THREE.CanvasTexture(c);}
function ceilingTexture(){const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false}),rng=mulberry32(0x445566);ctx.fillStyle='#d2cfb5';ctx.fillRect(0,0,size,size);ctx.globalAlpha=.16;ctx.fillStyle='#696650';for(let i=0;i<1100;i++)ctx.fillRect(rng()*size,rng()*size,1,1);ctx.globalAlpha=.42;ctx.strokeStyle='#77735c';ctx.lineWidth=2;ctx.strokeRect(1,1,size-2,size-2);return new THREE.CanvasTexture(c);}
