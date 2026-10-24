(()=>{
const names={white:'白瓷',green:'青苔',blue:'雾蓝',purple:'鸢尾',yellow:'麦穗',brown:'胡桃',orange:'杏橙',red:'朱砂'};
const swatches={white:'#eeeDE8',green:'#d5e4bd',blue:'#c6ddeb',purple:'#e0d1e9',yellow:'#e9dfb5',brown:'#d9cbbd',orange:'#ecd2bb',red:'#e9c8c5'};
const launch=document.createElement('button');launch.id='skinLaunch';launch.type='button';launch.setAttribute('aria-haspopup','dialog');launch.setAttribute('aria-expanded','false');launch.setAttribute('aria-controls','skinPopover');launch.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v3h4v12h-4v3H8v-3H4V6h4zM8 8h3v3H8zM14 8h3v3h-3zM8 14h3v3H8zM14 14h3v3h-3z"/></svg><span>换肤</span>';
const pop=document.createElement('section');pop.id='skinPopover';pop.className='skin-popover';pop.hidden=true;pop.setAttribute('role','dialog');pop.setAttribute('aria-label','界面皮肤');pop.innerHTML='<h2>换一种心情</h2><p>八种浅色皮肤，画面始终保持原色。</p><div class="skin-options">'+Object.entries(names).map(([k,n])=>`<button type="button" class="skin-option" data-skin-choice="${k}" aria-pressed="false"><span class="skin-swatch" style="--swatch:${swatches[k]}"></span>${n}</button>`).join('')+'</div><div class="skin-foot">仅改变界面配色 · 不影响作品颜色</div>';
document.body.append(launch,pop);
function setSkin(k){if(!names[k])k='white';document.documentElement.dataset.skin=k;pop.querySelectorAll('[data-skin-choice]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.skinChoice===k));launch.setAttribute('aria-label',`切换皮肤，当前${names[k]}`);try{localStorage.setItem('liquid-studio-skin',k)}catch{};document.dispatchEvent(new CustomEvent('skinchange',{detail:k}));}
function close(){pop.hidden=true;launch.setAttribute('aria-expanded','false')}
launch.onclick=()=>{pop.hidden=!pop.hidden;launch.setAttribute('aria-expanded',!pop.hidden);if(!pop.hidden)pop.querySelector('[aria-pressed=true]').focus()};
pop.addEventListener('click',e=>{const b=e.target.closest('[data-skin-choice]');if(b)setSkin(b.dataset.skinChoice)});
document.addEventListener('pointerdown',e=>{if(!pop.contains(e.target)&&!launch.contains(e.target))close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!pop.hidden){close();launch.focus()}});
let stored;try{stored=localStorage.getItem('liquid-studio-skin')}catch{};setSkin(new URLSearchParams(location.search).get('skin')||stored||'white');
})();
