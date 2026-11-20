/** Matching public v0.2 fixtures, not the production WS1 catalog. */
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const GUILDS=freeze([
 {id:'commerce',name:'Commerce',color:'#9a6a24',iconKey:'commerce'},
 {id:'craft',name:'Craft',color:'#a85b43',iconKey:'craft'},
 {id:'civic',name:'Civic',color:'#3e6f63',iconKey:'civic'},
 {id:'culture',name:'Culture',color:'#795478',iconKey:'culture'},
]);
const abilities={income:{type:'income',amount:1},workshop:{type:'firstBuildDiscount',amount:1},influence2:{type:'influenceOnBuild',amount:2},influence3:{type:'influenceOnBuild',amount:3},festival:{type:'festivalBonus',amount:1}};
const descriptions={income:'+1 coin at each later income. City bonus capped at +2.',workshop:'Your first Build each session costs 1 less. No stacking; cannot discount itself.',influence2:'Gain 2 influence when built, up to 6.',influence3:'Gain 3 influence when built, up to 6.',festival:'+1 prestige per Festival. City bonus capped at +1.'};
export const BUILDINGS=freeze([
 ['corner-shop','Corner Shop',1,'commerce',3,1,'income'],['tea-stall','Tea Stall',1,'commerce',2,2],['button-workshop','Button Workshop',1,'craft',3,2,'workshop'],['petition-kiosk','Petition Kiosk',1,'civic',3,2,'influence2'],['pocket-theatre','Pocket Theatre',1,'culture',3,2,'festival'],['community-garden','Community Garden',1,'culture',2,2],
 ['night-market','Night Market',2,'commerce',4,3,'income'],['clockwork-studio','Clockwork Studio',2,'craft',4,4,'workshop'],['public-library','Public Library',2,'civic',4,4,'influence2'],['debate-hall','Debate Hall',2,'civic',3,2,'influence3'],['concert-pavilion','Concert Pavilion',2,'culture',4,4,'festival'],['quilt-bridge','Quilt Bridge',2,'craft',3,3],
 ['grand-bazaar','Grand Bazaar',3,'commerce',6,7],['grand-clock','Grand Clock',3,'craft',6,7],['high-court','High Court',3,'civic',5,5,'influence2'],['observatory','Observatory',3,'civic',7,9],['opera-house','Opera House',3,'culture',6,7,'festival'],['lala-monument','Lala Monument',3,'culture',8,10],
].map(([id,name,term,guild,cost,prestige,a])=>({id,name,term,guild,cost,prestige,ability:abilities[a]||null,abilityDescription:descriptions[a]||'No additional ability.'})));
const thresholds=[{atLeast:2,points:1},{atLeast:4,points:2}];
export const LAWS=freeze([
 ['small-shop-supremacy','Small-Shop Supremacy','economy','Commerce Buildings cost 2 less, minimum 1.',{type:'guildDiscount',guild:'commerce',amount:2}],
 ['workshop-week','Workshop Week','economy','Craft Buildings cost 2 less, minimum 1.',{type:'guildDiscount',guild:'craft',amount:2}],
 ['public-grants','Public Grants','economy','Civic Buildings cost 2 less, minimum 1.',{type:'guildDiscount',guild:'civic',amount:2}],
 ['everything-is-art','Everything Is Art','economy','Culture Buildings cost 2 less, minimum 1.',{type:'guildDiscount',guild:'culture',amount:2}],
 ['open-tender','Open Tender','economy',"Each player's first Build per session costs 2 less, minimum 1.",{type:'firstBuildDiscount',amount:2}],
 ['honest-wages','Honest Wages','economy','Work gains 4 coins instead of 3.',{type:'workIncome',coins:4}],
 ['shop-local','Shop Local','civic','0 for 0–1 Commerce buildings; 1 for 2–3; 2 for 4 or more.',{type:'guildThreshold',guild:'commerce',thresholds}],
 ['industrial-pride','Industrial Pride','civic','0 for 0–1 Craft buildings; 1 for 2–3; 2 for 4 or more.',{type:'guildThreshold',guild:'craft',thresholds}],
 ['public-service-day','Public Service Day','civic','0 for 0–1 Civic buildings; 1 for 2–3; 2 for 4 or more.',{type:'guildThreshold',guild:'civic',thresholds}],
 ['mandatory-applause','Mandatory Applause','civic','0 for 0–1 Culture buildings; 1 for 2–3; 2 for 4 or more.',{type:'guildThreshold',guild:'culture',thresholds}],
 ['fashionable-streets','Fashionable Streets','civic','1 per qualifying completed street, capped at 2.',{type:'streetCount',pointsEach:1,cap:2}],
 ['diversity-parade','Diversity Parade','civic','0 for fewer than three guilds; 1 for three guilds; 2 for all four.',{type:'diversityThreshold',thresholds:[{atLeast:3,points:1},{atLeast:4,points:2}]}],
].map(([id,name,category,description,effect])=>({id,name,category,description,effect})));
