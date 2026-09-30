const CSS = `
#ui-root{pointer-events:none}
#ui-root *{box-sizing:border-box}
.sk-overlay,.sk-lock{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:10px;pointer-events:auto;color:#E0D5C1;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.35}
.sk-overlay{z-index:1100;background:rgba(25,4,6,.8);animation:sk-fade .2s ease}
.sk-overlay.sk-out{opacity:0;transition:opacity .18s}
.sk-card{width:100%;max-width:540px;max-height:94vh;max-height:94dvh;overflow:auto;background:#190406;border:2px solid #85150F;border-radius:16px;box-shadow:0 14px 44px rgba(0,0,0,.6);animation:sk-pop .25s ease}
.sk-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#85150F;color:#E0D5C1}
.sk-title{margin:0;font-size:19px;letter-spacing:.3px}
.sk-x{border:0;background:rgba(0,0,0,.25);color:#E0D5C1;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer}
.sk-test{margin:10px 14px 0;padding:6px 10px;border:1px dashed #CB6325;border-radius:8px;background:rgba(203,99,37,.15);color:#EDB57C;font-weight:700;font-size:12px;text-align:center;letter-spacing:.4px}
.sk-body{padding:14px}
.sk-tabs{display:flex;gap:6px;margin-bottom:12px}
.sk-tab{flex:1;padding:10px 6px;border:1px solid #8B8672;background:transparent;color:#E0D5C1;border-radius:10px;font-size:14px;cursor:pointer}
.sk-tab.on{background:#CB6325;border-color:#CB6325;color:#190406;font-weight:700}
.sk-btn{display:inline-block;padding:11px 16px;border:0;border-radius:10px;background:#CB6325;color:#190406;font-weight:700;font-size:15px;cursor:pointer;min-height:44px}
.sk-btn.alt{background:transparent;border:1px solid #8B8672;color:#E0D5C1;font-weight:500}
.sk-btn.wide{width:100%;margin-top:8px}
.sk-btn:disabled{opacity:.5;cursor:default}
.sk-input{width:100%;padding:12px;margin-bottom:8px;border:1px solid #8B8672;border-radius:10px;background:#21263A;color:#E0D5C1;font-size:16px}
.sk-input::placeholder{color:#8B8672}
.sk-err{min-height:18px;margin:2px 0 6px;color:#E5805B;font-size:13px}
.sk-muted{color:#8B8672;font-size:13px;margin:4px 0}
.sk-sec{margin-bottom:16px}
.sk-h3{margin:0 0 8px;font-size:15px;color:#EDB57C}
.sk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}
.sk-tile{position:relative;padding:8px 4px;border:2px solid #2a1518;border-radius:12px;background:#21263A;color:#E0D5C1;cursor:pointer;text-align:center;font-size:13px}
.sk-tile.on{border-color:#CB6325;background:#3a2418}
.sk-tile.lock{opacity:.7}
.sk-pv{display:flex;justify-content:center;align-items:center;height:64px}
.sk-tname{margin-top:4px}
.sk-lockicon{position:absolute;top:4px;right:6px;font-size:14px}
.sk-loc{width:100%;height:44px;border-radius:8px}
.sk-row{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}
.sk-list{display:flex;flex-direction:column;gap:6px}
.sk-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border-radius:10px;background:#21263A;font-size:14px}
.sk-item .w{color:#8DA750}.sk-item .l{color:#E5805B}
.sk-star{color:#EDB57C;letter-spacing:1px}
.sk-shop{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.sk-prod{padding:10px;border-radius:12px;background:#21263A;text-align:center;display:flex;flex-direction:column;gap:6px;align-items:center}
.sk-price{color:#EDB57C;font-size:13px}
.sk-pro{text-align:center}
.sk-pro ul{text-align:left;margin:10px auto;padding-left:20px;max-width:380px}
.sk-toasts{position:fixed;top:14px;left:0;right:0;z-index:1300;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.sk-toast{max-width:90vw;padding:10px 16px;border-radius:12px;background:#190406;border:1px solid #CB6325;color:#E0D5C1;box-shadow:0 6px 20px rgba(0,0,0,.5);animation:sk-pop .25s ease;font-family:system-ui,sans-serif}
.sk-toast.out{opacity:0;transition:opacity .3s}
.sk-lock{z-index:1000;background:linear-gradient(#21263A,#190406);text-align:center}
.sk-lockbox{width:100%;max-width:460px}
.sk-lockbox .sk-test{margin:14px 0 0}
.sk-lock h2{margin:0 0 6px;font-size:26px;color:#EDB57C}
.sk-count{font-size:54px;font-weight:800;letter-spacing:2px;font-variant-numeric:tabular-nums;margin:6px 0}
.sk-scene{position:relative;width:100%;height:84px;overflow:hidden;margin:14px 0;border-bottom:6px solid #8B8672}
.sk-car{position:absolute;bottom:0;left:-120px;width:100px;height:48px;animation:sk-drive 6s linear infinite}
.sk-car i{position:absolute;display:block}
.sk-car .b{bottom:10px;left:0;width:100px;height:22px;background:#CB6325;border-radius:6px}
.sk-car .c{bottom:30px;left:24px;width:50px;height:16px;background:#E5805B;border-radius:10px 10px 0 0}
.sk-car .w{bottom:0;width:20px;height:20px;border-radius:50%;background:#000;border:4px solid #8B8672;border-top-color:#E0D5C1;animation:sk-spin .5s linear infinite}
.sk-car .w1{left:14px}.sk-car .w2{left:68px}
@keyframes sk-fade{from{opacity:0}to{opacity:1}}
@keyframes sk-pop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
@keyframes sk-drive{from{transform:translateX(0)}to{transform:translateX(calc(100vw + 240px))}}
@keyframes sk-spin{to{transform:rotate(360deg)}}
`;

export function injectStyles(): void {
  if (document.getElementById('sk-ui-style')) return;
  const s = document.createElement('style');
  s.id = 'sk-ui-style';
  s.textContent = CSS;
  document.head.append(s);
}
