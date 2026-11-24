export const TUTORIAL_STYLE = `
.go-tutorial{--go-paper:#fff9e9;position:fixed;inset:0;z-index:1000;display:grid;place-items:center;--overlay-padding:20px;--overlay-top:max(var(--overlay-padding),env(safe-area-inset-top));--overlay-bottom:max(var(--overlay-padding),env(safe-area-inset-bottom));padding:var(--overlay-top) max(var(--overlay-padding),env(safe-area-inset-right)) var(--overlay-bottom) max(var(--overlay-padding),env(safe-area-inset-left));background:#122f2bd9;color:#183e35;font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;isolation:isolate}
.go-tutorial,.go-tutorial *{box-sizing:border-box}
.go-tutorial button{font:inherit;line-height:1.25;color:inherit;cursor:pointer;border:1px solid #9bad8c;background:#fffdf1;border-radius:12px;min-height:48px;padding:10px 16px;touch-action:manipulation}
.go-tutorial button:disabled{cursor:default;opacity:.48}
.go-tutorial button:focus-visible,.go-tutorial [tabindex]:focus-visible{outline:4px solid #156a77;outline-offset:3px}
.go-tutorial__dialog{width:min(1160px,100%);max-height:calc(100dvh - var(--overlay-top) - var(--overlay-bottom));border:1px solid #d5dfb5;border-radius:25px;overflow:hidden;display:flex;flex-direction:column;background:var(--go-paper);box-shadow:0 28px 90px #081f3660}
.go-tutorial__top{display:flex;gap:20px;justify-content:space-between;align-items:center;padding:12px 24px;background:#f0edcf;border-bottom:1px solid #d7d8b5;flex:none}
.go-tutorial__eyebrow{font-weight:800;font-size:13px;letter-spacing:1.6px;text-transform:uppercase;color:#3d6450}
.go-tutorial__top button{min-height:44px;border-color:transparent;background:transparent;padding:8px 12px}
.go-tutorial__progress{display:flex;gap:6px;align-items:center;margin-top:7px}
.go-tutorial__progress i{display:block;width:28px;height:5px;border-radius:3px;background:#c1ceb1}
.go-tutorial__progress i[data-complete=true]{background:#386b53}
.go-tutorial__main{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(290px,.85fr);gap:24px;padding:24px;overflow:auto;min-height:0;overscroll-behavior:contain}
.go-tutorial__visual{min-width:0;align-self:start}
.go-tutorial__garden{border:1px solid #c9d8ad;border-radius:18px;overflow:hidden;background:#dfead1}
.go-tutorial__garden svg{width:100%;height:auto;display:block;aspect-ratio:960/500}
.go-tutorial__garden text{font-family:system-ui,-apple-system,sans-serif;fill:#254c3b}
.go-tutorial__garden .go-tutorial-svg-label{font-size:22px;font-weight:750;letter-spacing:1.3px}
.go-tutorial__garden .go-tutorial-svg-caption{font-size:18px;font-weight:650}
.go-tutorial__garden .go-tutorial-svg-small{font-size:16px;font-weight:650}
.go-tutorial__garden .go-tutorial-svg-state{font-size:23px;font-weight:800}
.go-tutorial__readout{display:flex;align-items:center;justify-content:center;min-height:42px;padding:9px 12px;background:#e9efd8;border:1px solid #c5d4b4;border-radius:12px;margin:12px 0 0;font-size:15px;font-weight:650;text-align:center}
.go-tutorial__copy{display:flex;flex-direction:column;min-width:0}
.go-tutorial__copy h2{font:700 clamp(27px,2.5vw,35px)/1.13 Georgia,serif;letter-spacing:-.7px;margin:7px 0 15px;color:#204735}
.go-tutorial__copy p{margin:0 0 16px;font-size:17px;line-height:1.55}
.go-tutorial__copy .go-tutorial__prompt{font-size:15px;color:#42664e}
.go-tutorial__actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:auto}
.go-tutorial__actions button{flex:1;font-weight:700}
.go-tutorial__actions [data-tutorial-action=brake]{min-height:80px;min-width:120px;background:#315f50;color:#fffbea;border:3px solid #315f50;font-size:21px;letter-spacing:.8px;touch-action:none;user-select:none;-webkit-user-select:none}
.go-tutorial__actions [data-tutorial-action=brake]:hover{background:#274e40;color:#fffbea;border-color:#274e40}
.go-tutorial__actions [data-tutorial-action=brake][aria-pressed=true]{background:#e9bd61;color:#263f34;border-color:#70581f;box-shadow:inset 0 0 0 4px #fff4c8}
.go-tutorial__actions button[aria-pressed=true]:not([data-tutorial-action=brake]){background:#dbeaca;border-color:#43724d;box-shadow:inset 0 0 0 1px #43724d}
.go-tutorial__actions [data-tutorial-action=catch]{display:flex;align-items:center;justify-content:center;gap:10px}
.go-tutorial__actions svg{width:30px;height:30px;flex:none}
.go-tutorial__steering{display:grid;grid-template-columns:1fr 160px;gap:12px;width:100%;align-items:center}
.go-tutorial__seats{display:flex;flex-direction:column;gap:8px}
.go-tutorial__dpad{display:grid;grid-template-columns:repeat(3,48px);grid-template-rows:repeat(3,48px);gap:5px;justify-content:center}
.go-tutorial__dpad button{padding:0;min-height:48px;font-size:24px;line-height:1;touch-action:none}
.go-tutorial__dpad button[data-direction=up]{grid-column:2;grid-row:1}
.go-tutorial__dpad button[data-direction=left]{grid-column:1;grid-row:2}
.go-tutorial__dpad button[data-direction=right]{grid-column:3;grid-row:2}
.go-tutorial__dpad button[data-direction=down]{grid-column:2;grid-row:3}
.go-tutorial__dpad span{grid-column:2;grid-row:2;display:grid;place-items:center;font-size:19px;color:#50705a}
.go-tutorial__feedback{margin:16px 0 0;padding:11px 13px;border-radius:12px;border:1px solid #bdcfaa;background:#ebf2de;color:#2e593d;font-size:15px;line-height:1.45;min-height:44px}
.go-tutorial__feedback[data-complete=false]{background:#f2f0dc;border-color:#d7d8b9;color:#53644c}
.go-tutorial__footer{display:flex;align-items:center;gap:12px;padding:16px 24px;background:#f1efd8;border-top:1px solid #d6d8b9;flex:none}
.go-tutorial__footer p{flex:1;font-size:13px;line-height:1.4;margin:0;color:#4e6853}
.go-tutorial__footer button{flex:none}
.go-tutorial__footer .go-tutorial__next{background:#315f50;color:#fffbea;border-color:#315f50;font-weight:700;min-width:152px}
.go-tutorial__footer .go-tutorial__next:hover{background:#274e40;color:#fffbea;border-color:#274e40}
.go-tutorial [hidden]{display:none!important}
.go-tutorial[data-reduced-motion=true] *{animation:none!important;transition:none!important;scroll-behavior:auto!important}
@media(max-width:760px){.go-tutorial{--overlay-padding:10px}.go-tutorial__dialog{border-radius:18px}.go-tutorial__top{padding:10px 14px;gap:8px}.go-tutorial__eyebrow{font-size:11px;letter-spacing:1px}.go-tutorial__progress i{width:20px;height:4px}.go-tutorial__main{display:flex;flex-direction:column;gap:16px;padding:16px}.go-tutorial__visual{align-self:stretch}.go-tutorial__garden{max-width:600px;margin:auto}.go-tutorial__copy h2{font-size:29px;margin-top:0}.go-tutorial__copy p{font-size:16px;margin-bottom:12px}.go-tutorial__actions{margin-top:3px}.go-tutorial__footer{padding:12px 14px;flex-wrap:wrap}.go-tutorial__footer p{flex-basis:100%;order:3;font-size:12px}.go-tutorial__footer .go-tutorial__next{margin-left:auto}.go-tutorial__feedback{margin-top:12px}}
@media(max-height:740px) and (min-width:761px){.go-tutorial{--overlay-padding:14px}.go-tutorial__dialog{max-height:calc(100dvh - 28px)}.go-tutorial__top{padding:8px 22px}.go-tutorial__main{padding:20px;gap:20px}.go-tutorial__copy h2{font-size:30px;margin-bottom:12px}.go-tutorial__copy p{font-size:16px;margin-bottom:12px}.go-tutorial__feedback{font-size:14px;padding:9px 11px;margin-top:12px}.go-tutorial__footer{padding:12px 20px}.go-tutorial__actions [data-tutorial-action=brake]{min-height:70px}}
@media(prefers-reduced-motion:reduce){.go-tutorial *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
