/** Deliberate basket contacts using public positions, public routes and ordinary controls. */
import {getLevel} from '../../../games/gravity-orchard/geometry.mjs';
import {RULES} from '../../../games/gravity-orchard/catalog.mjs';
import {findRoute} from '../../../games/gravity-orchard/validation/pilot.mjs';

const SAFE=Object.freeze({x:0,y:0,brake:true});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const neutral=()=>({jon:{...SAFE},lydia:{...SAFE}});

/**
 * Keep the first recipe waiting for apples while buffering plums/pears/starfruit.
 * Route a fourth plum into the full plum basket, then that same rejected fruit
 * into the wrong apple basket. Only the host decides contacts and conservation.
 * This never imports the engine, modifies a snapshot or selects future supply.
 */
export function createBasketExercise(){
 let selected=null,route=[],routeTick=-Infinity,mode='fill',full=null,wrong=null,lastView=null;
 const cache=new Map(),seen=new Set(),contacts=[],captures=[];
 function observe(view){
  lastView=view;
  for(const event of view.events){
   if(seen.has(event.id))continue;seen.add(event.id);
   if(event.kind==='catch')captures.push({...event});
   if(event.kind!=='reject')continue;
   contacts.push({...event});
   if(!full&&event.entityId===selected&&event.data.reason==='full'&&event.data.basketId==='plum'){
    full={event:{...event},fruit:view.fruits.find(fruit=>fruit.id===selected),baskets:structuredClone(view.baskets),tick:view.tick};
    mode='wrong';route=[];routeTick=-Infinity;
   }else if(full&&!wrong&&event.entityId===full.event.entityId&&event.data.reason==='wrong'&&event.data.basketId==='apple'){
    wrong={event:{...event},fruit:view.fruits.find(fruit=>fruit.id===selected),baskets:structuredClone(view.baskets),tick:view.tick};mode='done';
   }
  }
 }
 return {
  get done(){return mode==='done';},
  inspect(){return {mode,selected,full,wrong,captures,contacts,route:route.map(point=>({x:point.x,y:point.y})),lastView:lastView?{matchId:lastView.matchId,runEpoch:lastView.runEpoch,phase:lastView.phase,tick:lastView.tick,baskets:lastView.baskets,orders:lastView.orders,fruits:lastView.fruits}:null};},
  update(view){
   observe(view);const controls=neutral();
   if(mode==='done'||view.phase!=='playing')return controls;
   if(view.mode!=='practice'||view.stageIndex!==0)throw new Error('Basket exercise requires ordinary untimed Morning Delivery practice.');
   const level=getLevel(view.levelId);
   let fruit=view.fruits.find(item=>item.id===selected);
   if(mode==='fill'&&(!fruit||fruit.type!=='plum'&&view.baskets[fruit.type].count>=3)){
    const candidates=view.fruits.filter(item=>item.type==='plum'||item.type!=='apple'&&view.baskets[item.type].count<3);
    candidates.sort((a,b)=>(a.type==='plum'?0:1)-(b.type==='plum'?0:1)||a.id.localeCompare(b.id));
    fruit=candidates[0];selected=fruit?.id??null;route=[];routeTick=-Infinity;
   }
   if(!fruit)return controls;
   const goal=level.baskets.find(basket=>basket.id===(mode==='wrong'?'apple':fruit.type));
   if(!route.length||view.tick-routeTick>=15){
    // The explicit goal's type permits approaching that basket even when the
    // real fruit differs. Its real identity/type are never changed or sent.
    route=findRoute(level,fruit,goal,goal.fruitType,fruit.radius,[],cache);routeTick=view.tick;
   }
   while(route.length>1&&distance(fruit,route[0])<18)route.shift();
   if(!route.length)return controls;
   const aim=route[0],d=distance(fruit,aim),final=route.length===1;
   const speed=Math.min(final?180:110,Math.sqrt(2*180*Math.max(0,d-(final?0:3))));
   const desiredX=d?(aim.x-fruit.x)/d*speed:0,desiredY=d?(aim.y-fruit.y)/d*speed:0;
   const {acceleration,damping}=RULES.tuning;
   const x=(5*(desiredX-fruit.vx)+damping*fruit.vx)/acceleration;
   const y=(5*(desiredY-fruit.vy)+damping*fruit.vy)/acceleration;
   const length=Math.max(1,Math.hypot(x,y)),input={x:x/length,y:y/length,brake:false};
   if(fruit.x>=level.bridge.x-90&&fruit.x<=level.bridge.x+level.bridge.width+90){controls.jon=input;controls.lydia={...input};}
   else controls[fruit.x<level.bridge.x+level.bridge.width/2?'jon':'lydia']=input;
   return controls;
  },
 };
}
