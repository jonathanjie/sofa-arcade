/** Scoped TV chrome; the scene and tutorial own their separate style lifetimes. */
export const TV_STYLES = `
.go-tv,.go-tv *{box-sizing:border-box}
.go-tv{--go-ink:#273d35;--go-dim:#52665a;--go-paper:#fff9e9;--go-edge:#d9d3af;--go-green:#426744;--go-jon:#356d78;--go-lydia:#a54e42;position:relative;isolation:isolate;display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:100%;height:100%;min-height:360px;overflow:hidden;background:#edf0dc;color:var(--go-ink);font-family:ui-rounded,'Avenir Next',Avenir,system-ui,sans-serif;font-size:clamp(16px,1.42vw,25px);line-height:1.3;text-align:left;color-scheme:light}
.go-tv [hidden]{display:none!important}
.go-tv button{font:inherit;line-height:1.2;color:inherit;border:1.5px solid #8d9a7f;border-radius:12px;background:var(--go-paper);padding:10px 16px;min-height:44px;cursor:pointer;font-weight:700;white-space:nowrap}
.go-tv button:hover{background:#e7edcf;border-color:#53724f}
.go-tv button:focus-visible,.go-tv [tabindex]:focus-visible{outline:3px solid #285b99;outline-offset:4px}
.go-tv button:disabled{opacity:.52;cursor:wait}
.go-tv button.go-primary{background:#365d43;color:#fffcef;border-color:#365d43}
.go-tv button.go-primary:hover{background:#254c32}
.go-tv .go-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.go-tv-header{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(0,2.6fr) auto;align-items:center;gap:clamp(10px,1.5vw,28px);padding:12px clamp(16px,2vw,38px) 10px;background:var(--go-paper);border-bottom:1px solid var(--go-edge);z-index:2}
.go-tv-wordmark{min-width:0}
.go-tv-wordmark h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(22px,2.25vw,38px);font-weight:700;letter-spacing:-.05em;line-height:.98;margin:0;color:#35533c}
.go-tv-wordmark h1 span{display:block}
.go-tv-wordmark p{font-size:clamp(10px,.78vw,14px);text-transform:uppercase;letter-spacing:.14em;font-weight:800;margin:5px 0 0;color:var(--go-dim)}
.go-tv-orders{display:grid;grid-template-columns:minmax(0,1.24fr) minmax(0,1fr);align-items:center;gap:16px;min-width:0}
.go-tv-recipe{min-width:0}
.go-tv-eyebrow{display:block;font-size:clamp(11px,.9vw,16px);font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--go-dim);margin-bottom:5px}
.go-tv-ingredients{display:flex;align-items:center;gap:clamp(5px,.65vw,12px);min-height:29px;flex-wrap:nowrap}
.go-tv-ingredient{display:inline-flex;align-items:center;gap:5px;font-weight:800;font-size:clamp(16px,1.4vw,24px);white-space:nowrap}
.go-tv-fruit-icon{width:clamp(24px,2.6vw,44px);height:clamp(24px,2.6vw,44px);flex:none;display:inline-block}
.go-tv-preview{display:grid;grid-template-columns:1fr 1fr;gap:10px;border-left:1px solid var(--go-edge);padding-left:16px;min-width:0}
.go-tv-preview .go-tv-eyebrow{font-size:clamp(10px,.94vw,var(--tv-type-label,18px));letter-spacing:.06em}
.go-tv-preview .go-tv-ingredient{font-size:clamp(13px,1.02vw,19px);gap:2px}
.go-tv-preview .go-tv-ingredients{gap:4px}
.go-tv-preview .go-tv-fruit-icon{width:clamp(19px,1.8vw,30px);height:clamp(19px,1.8vw,30px)}
.go-tv-meta{display:flex;align-items:center;gap:20px;text-align:right}
.go-tv-clock{font-size:clamp(28px,3.1vw,52px);font-weight:800;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.05em;min-width:3.2ch}
.go-tv-clock.is-urgent{color:#9b3c2e}
.go-tv-stage-label{font-size:clamp(13px,1.05vw,19px);font-weight:750;display:block}
.go-tv-stage-dots{display:flex;gap:6px;justify-content:flex-end;margin-top:8px}
.go-tv-stage-dots i{height:6px;width:26px;border-radius:6px;background:#d0d6bc;border:1px solid #a5b191}
.go-tv-stage-dots i.is-current{background:#4a714b;border-color:#355d3d}
.go-tv-stage-dots i.is-complete{background:#b78232;border-color:#91692c}
.go-tv-main{position:relative;min-width:0;min-height:0;overflow:hidden;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 40%,#faf6dc 0,#e6ecd3 66%,#d5e0c3 100%)}
.go-tv-scene{position:absolute;inset:0;width:100%;height:100%;min-height:0}
.go-tv-status{position:absolute;z-index:4;top:10px;left:50%;transform:translateX(-50%);max-width:90%;padding:8px 18px;background:#fff4d0;border:1px solid #bd8f36;border-radius:30px;box-shadow:0 4px 16px #35462718;text-align:center;font-size:clamp(14px,1.15vw,21px);font-weight:700}
.go-tv-hazard{position:absolute;z-index:3;bottom:9px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;padding:7px 16px;border:2px solid #9c7226;border-radius:30px;background:#fff2bb;font-size:clamp(15px,1.3vw,24px);font-weight:800;white-space:nowrap;max-width:95%}
.go-tv-hazard[data-hazard-phase=active]{background:#fbe2c7;border-color:#a65535}
.go-tv-hazard-arrow{font-size:1.5em;line-height:1}
.go-tv-panel{position:relative;z-index:5;width:min(620px,78%);max-height:calc(100% - 20px);overflow:auto;overscroll-behavior:contain;border:2px solid #d0bd89;border-radius:24px;padding:clamp(20px,2.1vw,36px);background:#fff9edfa;box-shadow:0 14px 50px #334c3333;text-align:center}
.go-tv-panel h2{font-family:Georgia,'Times New Roman',serif;font-size:clamp(28px,3vw,50px);letter-spacing:-.03em;line-height:1.07;margin:5px 0 14px}
.go-tv-panel p{font-size:clamp(16px,1.45vw,25px);margin:8px 0;color:#455b4a}
.go-tv-panel .go-tv-eyebrow{font-size:clamp(12px,1vw,17px)}
.go-tv-panel-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:20px}
.go-tv-panel-actions button{font-size:clamp(14px,1.15vw,21px)}
.go-tv-ready{display:flex;justify-content:center;gap:14px;margin:20px 0 0}
.go-tv-ready span{border:1px solid #b3bca3;border-radius:13px;min-width:148px;padding:10px 14px;font-size:clamp(16px,1.3vw,23px);background:#eef1df}
.go-tv-ready strong{display:block;color:#2c4937;margin-bottom:3px}
.go-tv-ready span[data-ready=true]{background:#dfeacb;border-color:#648154}
.go-tv-countdown{position:absolute;z-index:4;display:grid;place-items:center;text-align:center;background:#fff8e9eb;border:2px solid #d8c997;border-radius:32px;padding:22px 38px;box-shadow:0 12px 50px #35462726}
.go-tv-countdown strong{font-size:clamp(64px,8vw,128px);font-variant-numeric:tabular-nums;line-height:1.05;font-family:Georgia,serif}
.go-tv-countdown span{font-size:clamp(17px,1.5vw,27px);font-weight:750}
.go-tv-totals{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:20px 0}
.go-tv-totals strong{display:block;font-size:clamp(30px,3vw,50px);font-variant-numeric:tabular-nums;color:#365d43}
.go-tv-totals span{font-size:clamp(13px,1.1vw,19px);color:var(--go-dim)}
.go-tv-result-rows{display:grid;gap:8px;text-align:left;font-size:clamp(13px,1.1vw,19px)}
.go-tv-result-row{display:flex;justify-content:space-between;align-items:center;gap:14px;border-top:1px solid #d7cfb4;padding-top:8px}
.go-tv-result-row span:last-child{white-space:nowrap;font-weight:800}
.go-tv-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px clamp(16px,2vw,38px);border-top:1px solid var(--go-edge);background:var(--go-paper);z-index:6}
.go-tv-presence{display:flex;gap:clamp(12px,2.2vw,40px);align-items:center;min-width:0}
.go-tv-player{display:flex;gap:8px;align-items:center;font-size:clamp(14px,1.22vw,22px);font-weight:650;min-width:0}
.go-tv-player strong{font-weight:850;color:var(--go-jon)}
.go-tv-player[data-player-presence=lydia] strong{color:var(--go-lydia)}
.go-tv-presence-dot{display:inline-block;border:2px solid #536f4d;width:12px;height:12px;border-radius:50%;background:#bdd39b;flex:none}
.go-tv-player[data-connection=lost] .go-tv-presence-dot{border-radius:2px;background:#f2d49a;border-color:#8b5e25}
.go-tv-player[data-connection=unknown] .go-tv-presence-dot{background:transparent;border-color:#8b9784}
.go-tv-actions{display:flex;align-items:center;gap:8px}
.go-tv-actions button{font-size:clamp(13px,1.03vw,18px);min-height:40px;padding:9px 13px;border-radius:10px}
.go-tv-toast{position:absolute;bottom:62px;left:50%;transform:translateX(-50%);z-index:8;background:#fff4d0;border:1px solid #ad8638;border-radius:16px;padding:12px 20px;max-width:85%;font-size:clamp(15px,1.3vw,23px);text-align:center;box-shadow:0 8px 28px #334c3329}
.go-tv-tutorial-layer{position:absolute;inset:0;z-index:20}
.go-tv[data-reduced-motion=true] *, .go-tv[data-reduced-motion=true] *::before, .go-tv[data-reduced-motion=true] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
@media(max-width:1100px){.go-tv-header{grid-template-columns:150px minmax(0,1fr) auto;gap:10px}.go-tv-preview{gap:6px;padding-left:10px}.go-tv-orders{gap:8px}.go-tv-meta{gap:10px}.go-tv-wordmark p{letter-spacing:.08em}.go-tv-presence{gap:15px}}
@media(max-width:760px){.go-tv-header{grid-template-columns:100px minmax(0,1fr) 75px;padding:8px}.go-tv-wordmark h1{font-size:20px}.go-tv-orders{grid-template-columns:1fr}.go-tv-preview{display:none}.go-tv-meta{flex-direction:column;gap:3px}.go-tv-clock{font-size:26px}.go-tv-stage-dots{display:none}.go-tv-footer{padding:8px;flex-wrap:wrap}.go-tv-panel{width:94%;padding:16px}.go-tv-ready{gap:8px}.go-tv-ready span{min-width:110px}.go-tv-player{font-size:13px}.go-tv-actions button{padding:8px}.go-tv-totals{margin:10px 0}}
@media(max-height:650px){.go-tv-header{padding-top:7px;padding-bottom:7px}.go-tv-wordmark h1{font-size:24px}.go-tv-panel{padding:16px 24px}.go-tv-panel h2{font-size:30px;margin-bottom:10px}.go-tv-panel p{font-size:16px}.go-tv-ready{margin-top:12px}.go-tv-totals{margin:10px 0}.go-tv-panel-actions{margin-top:12px}.go-tv-footer{padding-top:5px;padding-bottom:5px}}
@media(prefers-reduced-motion:reduce){.go-tv *,.go-tv *::before,.go-tv *::after{animation:none!important;transition:none!important}}
`;
