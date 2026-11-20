/** WS3 public view entry. All authority, transport, media and sound are injected. */
import {renderTV} from './tv.mjs';
import {renderPhone,handlePhoneAction} from './phone.mjs';
import {createTutorial} from './tutorial.mjs';
import {renderDrawer} from './drawers.mjs';
import {escapeHtml as esc,icon} from './shared.mjs';
import {createMotion} from './motion.mjs';

const stylesByDocument=new WeakMap();
function acquireStyles(doc) {let entry=stylesByDocument.get(doc);if(!entry){entry={count:0,links:['view.css','tv.css','phone.css','tutorial.css'].map(file=>{const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL(file,import.meta.url).href;link.dataset.oddLawsStyle='';doc.head.append(link);return link;})};stylesByDocument.set(doc,entry);}entry.count++;return ()=>{entry.count--;if(!entry.count){entry.links.forEach(link=>link.remove());stylesByDocument.delete(doc);}};}
const emptyDraft=()=>({phonePanel:'actions',choiceId:'keep',bid:0,selectedDesignId:null,selectedPlot:null,phoneNotice:null});
const safeText=(value,fallback)=>typeof value==='string'&&value.trim()?value.trim().slice(0,220):fallback;
const focusSelector=node=>{if(!node?.dataset?.action)return null;return ['action','designId','choiceId','bid','row','col','playerId','plot','scoreId'].filter(k=>node.dataset[k]!==undefined).map(k=>`[data-${k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${CSS.escape(node.dataset[k])}"]`).join('');};

export function mount(root,{viewer={role:'public'},dispatch,rules,assets={},sound={},preferences={},onExit,onHelp}={}) {
 if(!root?.ownerDocument)throw new TypeError('A game root is required.');
 if(!['public','host','player'].includes(viewer.role)||viewer.role==='player'&&!['jon','lydia'].includes(viewer.playerId))throw new TypeError('A valid authenticated viewer is required.');
 if(!rules||!['buildings','laws','guilds'].every(key=>Array.isArray(rules[key]))||!['buildQuote','streetOutcome','civicAward'].every(key=>typeof rules[key]==='function'))throw new TypeError('The public rules adapter is required.');
 const doc=root.ownerDocument,win=doc.defaultView,releaseStyles=acquireStyles(doc);
 const originalClass=root.className;
 root.classList.add('ols');root.dataset.viewer=viewer.role;
 const mediaQuery=win.matchMedia?.('(prefers-reduced-motion: reduce)');
 const reduced=preferences.reducedMotion===true||mediaQuery?.matches===true;
 root.classList.toggle('ols-reduced-motion',reduced);
 const media={manifest:assets.manifest||{},manifestUrl:assets.manifestUrl||null};
 const ui={...emptyDraft(),busy:false,error:null,drawer:null,drawerStack:[]};
 const surface=doc.createElement('div'),live=doc.createElement('p');
 live.className='ols-sr-only';live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');live.dataset.announcement='';
 root.replaceChildren(surface,live);
 let room=null,status={state:'connected'},disposed=false,commandToken=0,scene=null,suppressNextSnapshot=false,restoreFocus=null,announcementToken=0,transitionNotice='';
 const retiredMatches=new Set();
 const motion=createMotion(root,{sound,reducedMotion:reduced});
 const tutorial=createTutorial({onChange:()=>{if(!disposed)render();}});
 const context=()=>({view:room?.state,viewer,rules,ui,status,media,setState,submit,openDrawer});
 function focusTarget(selector) {return selector&&(root.querySelector('[role="dialog"]')||root).querySelector(selector);}
 function setState(patch) {if(disposed)return;Object.assign(ui,patch);render();}
 function openDrawer(type,id=null) {if(disposed||ui.drawer?.type===type&&ui.drawer?.id===id)return;if(ui.drawer)ui.drawerStack.push({drawer:ui.drawer,focus:focusSelector(doc.activeElement),scroll:root.querySelector('.ols-drawer-body')?.scrollTop||0});else restoreFocus=focusSelector(doc.activeElement);ui.drawer={type,id};render();const body=root.querySelector('.ols-drawer-body');if(body)body.scrollTop=0;root.querySelector('[role="dialog"]')?.focus({preventScroll:true});}
 function closeDrawer() {ui.drawer=null;ui.drawerStack=[];render();const target=focusTarget(restoreFocus);(target||root.querySelector('[data-action="open-help"]'))?.focus({preventScroll:true});restoreFocus=null;}
 function backDrawer() {const previous=ui.drawerStack.pop();if(!previous){closeDrawer();return;}ui.drawer=previous.drawer;render();const body=root.querySelector('.ols-drawer-body');if(body)body.scrollTop=previous.scroll||0;(focusTarget(previous.focus)||root.querySelector('[role="dialog"]'))?.focus({preventScroll:true});}
 function playScene(view) {const next=view.stage==='finished'?'celebrate':view.stage==='council'?'council':`term${view.term}`;if(next===scene)return;scene=next;try{sound.setScene?.(next);}catch{}}
 function announcement() {if(!room)return 'Waiting for the board.';const v=room.state;return v.stage==='finished'?(v.result.winner==='tie'?'Shared victory.':`${v.result.winner==='jon'?'Jon':'Lydia'} wins.`):v.stage==='council'?`Session ${v.session}. Council. Jon ${v.council.ready.jon?'sealed':'choosing'}. Lydia ${v.council.ready.lydia?'sealed':'choosing'}.`:`Session ${v.session}. ${v.activePlayer==='jon'?'Jon':'Lydia'}'s turn.`;}
 function render() {
  if(disposed)return;
  const hadFocus=root.contains(doc.activeElement),focused=hadFocus?focusSelector(doc.activeElement):null;
  const oldScroll=root.querySelector('.ols-drawer-body')?.scrollTop||0;
  motion.clear();
  const tutorialOpen=tutorial.getState().open;
  surface.innerHTML=`<div class="ols-game-shell${viewer.role==='player'?' ols-shell-phone':' ols-shell-tv'}"><div class="ols-match-surface"${tutorialOpen||ui.drawer?' inert':''}><nav class="ols-toolbar" aria-label="Game navigation"><button data-action="exit" aria-label="Return to Sofa Arcade">${icon('back')}<span>Sofa Arcade</span></button><span class="ols-connection-dot ${esc(status.state)}" aria-label="${esc(status.state)}"></span><div>${room&&viewer.role==='player'?`<button class="ols-my-city" data-action="open-city">${icon('build')}<span>My city</span></button>`:''}<button data-action="open-agenda">${icon('civic')}<span>Agenda</span></button><button data-action="open-catalog">${icon('book')}<span>Almanac</span></button><button data-action="open-help">${icon('help')}<span>Help</span></button></div></nav>${status.state!=='connected'?`<div class="ols-connection" role="status">${icon(status.state==='error'?'help':'clock')}<span><strong>${status.state==='offline'?'You’re offline':status.state==='error'?'Connection needs attention':status.state==='connecting'?'Connecting…':'Reconnecting…'}</strong> ${esc(status.message||'Your committed city and sealed vote are safe. Waiting for the host.')}</span></div>`:''}${ui.error?`<div class="ols-error" role="alert"><span>${esc(ui.error)}</span><button data-action="dismiss-error" aria-label="Dismiss error">${icon('close')}</button></div>`:''}${room?(viewer.role==='player'?renderPhone(context()):renderTV(context())):'<main class="ols-loading"><h1>The Odd Laws Society</h1><p>Waiting for the board…</p></main>'}</div>${room?renderDrawer(context()):''}${room?tutorial.render(context()):''}</div>`;
  const announcementId=++announcementToken,message=transitionNotice+announcement();
  queueMicrotask(()=>{if(!disposed&&announcementId===announcementToken&&live.textContent!==message)live.textContent=message;});
  root.querySelectorAll('button:not([type])').forEach(button=>button.type='button');
  root.querySelectorAll('img[data-ols-media]').forEach(img=>{if(img.complete&&img.naturalWidth)img.parentElement.classList.add('ols-media-loaded');});
  const drawerBody=root.querySelector('.ols-drawer-body');if(drawerBody)drawerBody.scrollTop=oldScroll;
  if(hadFocus){const target=focusTarget(focused);if(target&&!target.disabled&&target.getAttribute('aria-disabled')!=='true'&&!target.closest('[inert]'))target.focus({preventScroll:true});else {const next=root.querySelector('[role="dialog"]')||root.querySelector('.ols-phone h2');if(next){next.tabIndex=-1;next.focus({preventScroll:true});}}}
 }
 function update(nextRoom) {
  if(disposed||!nextRoom?.state||nextRoom.state.gameId!=='odd-laws-society'||nextRoom.state.schemaVersion!==1||!Number.isSafeInteger(nextRoom.revision)||nextRoom.revision<0)return false;
  if(room&&(nextRoom.code!==room.code||nextRoom.revision<=room.revision||retiredMatches.has(nextRoom.state.matchId)))return false;
  const next=structuredClone(nextRoom),previous=room?.state;
  // Defence in depth: public/host views never consume any ownCommitment field.
  if(next.state.council&&viewer.role!=='player')next.state.council.ownCommitment=null;
  const newPhase=previous&&next.state.phaseId!==previous.phaseId;
  const newMatch=previous&&next.state.matchId!==previous.matchId;
  if(newMatch){retiredMatches.add(previous.matchId);ui.drawer=null;ui.drawerStack=[];restoreFocus=null;}
  if(newPhase||newMatch)Object.assign(ui,emptyDraft(),{error:null});
  if(newPhase||newMatch||viewer.role==='player'&&next.state.council?.ready[viewer.playerId]){commandToken++;ui.busy=false;}
  transitionNotice=previous&&next.state.session>previous.session?'Income received. ':previous&&next.state.lastCouncil?.phaseId!==previous.lastCouncil?.phaseId&&next.state.stage==='actions'?'Both council votes revealed. ':'';
  room=next;render();playScene(next.state);
  motion.consume(previous,next.state,{animate:!!previous&&!suppressNextSnapshot&&status.state==='connected'&&!newMatch&&!tutorial.getState().open});
  suppressNextSnapshot=false;
  return true;
 }
 function setConnection(next) {if(disposed)return;if(!['connecting','connected','reconnecting','offline','error'].includes(next?.state))return;const previous=status.state;status={state:next.state,...(next.message?{message:safeText(next.message,'Waiting for the host.')}:{})};if(previous!=='connected'||status.state!=='connected')suppressNextSnapshot=true;render();}
 // Called synchronously by the delegated click handler. Unlock is deliberately
 // before the first await (and before invoking the transport dispatch).
 async function submit(partial) {
  if(disposed||!room||viewer.role!=='player'||ui.busy)return;
  try {const unlocked=sound.unlock?.();unlocked?.catch?.(()=>{});}catch{}
  if(status.state!=='connected'){setState({error:'Reconnect to the host before sending this action. Your draft is still here.'});return;}
  if(typeof dispatch!=='function'){setState({error:'This board has no command connection.'});return;}
  const token=++commandToken,matchId=room.state.matchId,phaseId=room.state.phaseId;
  const action={...partial,matchId,phaseId};ui.busy=true;ui.error=null;render();
  try {const response=await dispatch(action);if(disposed||token!==commandToken)return;ui.busy=false;const accepted=update(response);if(!accepted)render();}
  catch(error) {if(disposed||token!==commandToken)return;ui.busy=false;ui.error=safeText(error?.message,'The action was not accepted. Check the connection and try again.');render();}
 }
 function click(event) {
  const button=event.target.closest('[data-action]');if(!button||!root.contains(button)||button.closest('[inert]'))return;
  const action=button.dataset.action;
  if(action==='exit'){dispose();onExit?.();return;}
  if(action==='open-city'&&room&&viewer.role==='player'){openDrawer('city');return;}
  if(action==='open-help'){onHelp?.();openDrawer('help');return;}
  if(action==='open-agenda'||action==='open-catalog'||action==='open-score'){openDrawer(action.slice(5),button.dataset.playerId);return;}
  if(action==='inspect-building'){openDrawer('building',button.dataset.designId);return;}
  if(action==='close-drawer'||action==='close-backdrop'&&event.target===button){closeDrawer();return;}
  if(action==='back-drawer'){backDrawer();return;}
  if(action==='dismiss-error'){setState({error:null});return;}
  if(action==='start-tutorial'){ui.drawer=null;ui.drawerStack=[];restoreFocus='[data-action="open-help"]';tutorial.open();render();root.querySelector('[role="dialog"]')?.focus({preventScroll:true});return;}
  if(action.startsWith('tutorial-')){try{const unlocked=sound.unlock?.();unlocked?.catch?.(()=>{});}catch{}tutorial.handleAction(action,button,context());if(!tutorial.getState().open&&restoreFocus)root.querySelector(restoreFocus)?.focus({preventScroll:true});return;}
  if(room&&viewer.role==='player')handlePhoneAction(action,button,context());
 }
 function keydown(event) {
  const dialog=root.querySelector('[role="dialog"]');if(!dialog)return;
  if(event.key==='Escape'){event.preventDefault();if(tutorial.getState().open){tutorial.close();if(restoreFocus)root.querySelector(restoreFocus)?.focus({preventScroll:true});}else if(ui.drawerStack.length)backDrawer();else closeDrawer();return;}
  if(event.key==='Tab'){const items=[...dialog.querySelectorAll('button:not([disabled]),a[href],input,select,[tabindex="0"]')].filter(el=>!el.hidden&&el.tabIndex>=0&&el.getClientRects().length);if(!items.length){event.preventDefault();dialog.focus();return;}const first=items[0],last=items.at(-1);if(event.shiftKey&&(doc.activeElement===first||!dialog.contains(doc.activeElement)||doc.activeElement===dialog)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(doc.activeElement===last||doc.activeElement===dialog)){event.preventDefault();first.focus();}}
 }
 function mediaLoaded(event) {if(event.target.matches?.('img[data-ols-media]'))event.target.parentElement.classList.add('ols-media-loaded');}
 function mediaFailed(event) {if(event.target.matches?.('img[data-ols-media]')){event.target.hidden=true;event.target.parentElement.classList.remove('ols-media-loaded');}}
 root.addEventListener('click',click);root.addEventListener('keydown',keydown);root.addEventListener('load',mediaLoaded,true);root.addEventListener('error',mediaFailed,true);
 function dispose() {if(disposed)return;disposed=true;commandToken++;tutorial.dispose();motion.dispose();root.removeEventListener('click',click);root.removeEventListener('keydown',keydown);root.removeEventListener('load',mediaLoaded,true);root.removeEventListener('error',mediaFailed,true);root.replaceChildren();root.className=originalClass;delete root.dataset.viewer;releaseStyles();room=null;retiredMatches.clear();Object.assign(ui,emptyDraft(),{drawer:null,error:null,busy:false});}
 render();
 return Object.freeze({update,setConnection,dispose});
}
