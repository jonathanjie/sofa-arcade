/** Scoped diagnostic presentation. GO5 supplies the reusable illustrated assets. */
export const sceneStyles = `
.go-scene-root{width:100%;height:100%;min-width:0;min-height:0;position:relative;isolation:isolate;overflow:hidden}
.go-scene-root svg[data-go-scene]{display:block;width:100%;height:100%;overflow:hidden;touch-action:manipulation}
.go-scene-root svg text{font-family:inherit;paint-order:stroke;stroke-linejoin:round}
.go-scene-root .go-scene-label{font-weight:760;fill:#293d34;font-size:21px;letter-spacing:.2px}
.go-scene-root .go-scene-small{font-weight:680;fill:#435648;font-size:17px}
.go-scene-root .go-scene-micro{font-weight:750;fill:#435648;font-size:14px;letter-spacing:1.2px}
.go-scene-root .go-scene-fruit{filter:drop-shadow(0 3px 1px #304c3830)}
.go-scene-root .go-scene-fruit[data-motion="still"]{filter:drop-shadow(0 2px 1px #304c3820)}
.go-scene-root .go-scene-basket{filter:drop-shadow(0 3px 1px #304c381c)}
.go-scene-root .go-scene-fx{pointer-events:none}
.go-scene-root .go-scene-warning{fill:#67421d;font-weight:800;font-size:19px}
.go-scene-root .go-scene-missing{fill:#4c5749;font-size:24px;font-weight:700}
.go-scene-root .go-scene-character{transform-box:fill-box}
.go-scene-root [data-state="closed"] .go-scene-gate-body{fill:#805845;stroke:#513c30}
.go-scene-root [data-state="forecast"] .go-scene-gate-body{fill:#f1c86c;stroke:#7c5723;stroke-dasharray:8 5}
.go-scene-root [data-state="open"] .go-scene-gate-body{fill:#ecf3df;fill-opacity:.22;stroke:#5b8268;stroke-dasharray:4 7}
.go-scene-root [data-basket-state="full"] .go-scene-basket-ring{stroke:#8c5f21;stroke-width:5;stroke-dasharray:5 3}
.go-scene-root [data-basket-state="catch"] .go-scene-basket-ring{stroke:#2f795d;stroke-width:6}
.go-scene-root [data-basket-state="reject"] .go-scene-basket-ring{stroke:#9b4737;stroke-width:6;stroke-dasharray:8 4}
.go-scene-root [data-reduced-motion="true"] .go-scene-fruit{filter:none}
`;
