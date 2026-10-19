// Crash-safe local workspace draft. Writes commit atomically in a separate database.
export function setupDraft({capture,restore,notify}){
 let db,enabled=false,timer,saving=false,pending=false,lastKey='',dirty=false;
 const badge=document.createElement('span');badge.id='draftStatus';badge.textContent='本地草稿';document.querySelector('.statusbar').append(badge);
 const transact=(mode,action)=>new Promise((resolve,reject)=>{const tx=db.transaction('draft',mode);const req=action(tx.objectStore('draft'));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
 const save=async()=>{if(!enabled||saving)return;const snapshot=capture();if(!snapshot)return;saving=true;pending=false;badge.textContent='保存草稿中…';try{const data=await snapshot.serialize();await transact('readwrite',s=>s.put(data,'workspace'));if(!pending){dirty=false;badge.textContent='草稿已保存 · 本机';}}catch(e){dirty=true;badge.textContent='草稿未保存';badge.title='本机存储不可用，请保存或导出作品';notify('自动保存未完成，请先导出图片或保存作品。');}finally{saving=false;if(pending)timer=setTimeout(save,500);}};
 document.addEventListener('studio:render',()=>{if(!enabled)return;const snap=capture();if(!snap||snap.key===lastKey)return;lastKey=snap.key;dirty=true;pending=true;badge.textContent='草稿待保存';clearTimeout(timer);timer=setTimeout(save,650);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty)save();});
 document.querySelector('#editor').addEventListener('pointerdown',()=>{if(enabled)dirty=true;});
 document.addEventListener('pointerup',()=>{if(enabled&&!saving&&!pending&&capture()?.key===lastKey)dirty=false;});
 document.addEventListener('input',e=>{if(enabled&&e.target.matches('input[type=range]'))dirty=true;});
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 return new Promise(resolve=>{const req=indexedDB.open('liquid-studio-draft',1);req.onupgradeneeded=()=>req.result.createObjectStore('draft');req.onerror=()=>{badge.textContent='草稿不可用';resolve();};req.onsuccess=async()=>{db=req.result;try{const data=await transact('readonly',s=>s.get('workspace'));if(data?.items?.length){
 await transact('readwrite',s=>s.put(data,'recovery'));
 }const recovery=await transact('readonly',s=>s.get('recovery'));
 if(recovery?.items?.length){
 const row=document.createElement('div');row.className='draft-recovery';
 row.innerHTML='<p>本机保留了上次创作，可随时恢复。</p><button id="restoreDraft">恢复上次创作</button><button id="discardDraft">删除旧草稿</button>';
 document.querySelector('#presetDialog').append(row);
 row.querySelector('#restoreDraft').onclick=async()=>{try{row.querySelectorAll('button').forEach(b=>b.disabled=true);await restore(recovery);lastKey=capture()?.key||'';dirty=true;await save();document.querySelector('#presetDialog').close();notify('已恢复上次创作');}catch(e){notify('草稿恢复失败，已保留原始草稿。');}finally{row.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 row.querySelector('#discardDraft').onclick=async()=>{await transact('readwrite',s=>{s.delete('workspace');return s.delete('recovery');});row.remove();};
 enabled=true;lastKey=capture()?.key||'';resolve();
}else{enabled=true;lastKey=capture()?.key||'';resolve();}}catch(e){badge.textContent='草稿读取失败';resolve();}};});
}
