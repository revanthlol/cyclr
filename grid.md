Yes. The clean way is to make your current overlay support **multiple layouts** and add a new `grid` renderer beside your existing list/preview renderer.

Do **not** try to bolt the new UI into every branch. Keep your current Alt+Q flow, selection state, commit/close messages, and just swap the rendering layer.

## What stays the same

Keep these exactly as they are:

* `Alt+Q` opens the overlay
* arrow/tab navigation
* `Enter` commits
* `Esc` closes
* `currentSelectedIndex`
* `cyclr-change-selected`
* `cyclr-commit`
* `cyclr-close`

That means the grid mode is only a **new view**, not a new system.

## What changes

### 1) Add a `grid` layout mode

Where you currently do:

```js
if (layoutMode === "preview") {
   ...
} else {
   ...
}
```

change it to:

```js
if (layoutMode === "preview") {
    renderPreviewLayout(container, tabs, selectedIndex);
} else if (layoutMode === "grid") {
    renderGridLayout(container, tabs, selectedIndex);
} else {
    renderListLayout(container, tabs, selectedIndex);
}
```

So now your overlay has 3 modes:

* `list`
* `preview`
* `grid`

---

### 2) Build a grid renderer

This is the heart of it. The grid mode should render cards instead of rows.

Use a structure like this:

```js
function renderGridLayout(container, tabs, selectedIndex) {
    container.classList.remove("preview-layout");
    container.classList.add("grid-layout");
    container.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "grid-panel";

    tabs.forEach((tab, index) => {
        const card = document.createElement("div");
        card.className = `grid-card${index === selectedIndex ? " selected" : ""}`;
        card.dataset.index = String(index);

        const thumbWrap = document.createElement("div");
        thumbWrap.className = "grid-thumb";

        if (tab.screenshot) {
            const img = document.createElement("img");
            img.className = "grid-screenshot";
            img.src = tab.screenshot;
            thumbWrap.appendChild(img);
        } else if (tab.favIconUrl || tab.url) {
            const img = document.createElement("img");
            img.className = "grid-favicon";
            img.src = tab.favIconUrl || `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=64`;
            img.onerror = () => {
                thumbWrap.replaceChildren(createPlaceholder(tab.title));
            };
            thumbWrap.appendChild(img);
        } else {
            thumbWrap.appendChild(createPlaceholder(tab.title));
        }

        const title = document.createElement("div");
        title.className = "grid-title";
        title.textContent = tab.title || "Untitled Tab";

        card.appendChild(thumbWrap);
        card.appendChild(title);

        card.addEventListener("mousemove", (e) => {
            if (isScrolling) return;
            lastActiveDevice = "mouse";
            if (index !== currentSelectedIndex) {
                chrome.runtime.sendMessage({
                    type: "cyclr-change-selected",
                    direction: index - currentSelectedIndex
                });
            }
        });

        card.addEventListener("mousedown", (e) => {
            e.preventDefault();
            chrome.runtime.sendMessage({ type: "cyclr-commit" });
        });

        grid.appendChild(card);
    });

    container.appendChild(grid);
    requestAnimationFrame(() => {
        const selected = container.querySelector(".grid-card.selected");
        if (selected) {
            suppressScrollHover(180);
            selected.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
        }
    });
}
```

---

### 3) Add grid CSS

Add a card-based layout like this to `overlay.css`:

```css
.overlay-container.grid-layout {
    width: min(1100px, calc(100vw - 48px));
    padding: 16px;
}

.grid-panel {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
    max-height: 70vh;
    overflow: auto;
    padding-right: 4px;
}

.grid-card {
    border-radius: 12px;
    padding: 10px;
    cursor: default;
    user-select: none;
    transition: transform 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
}

.grid-card:hover {
    transform: translateY(-2px);
}

.grid-card.selected {
    background: #5c7cfa !important;
    color: #fff !important;
    box-shadow: 0 8px 24px rgba(92, 124, 250, 0.35);
}

.grid-thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
}

.grid-screenshot {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.grid-favicon {
    width: 56px;
    height: 56px;
    object-fit: contain;
}

.grid-title {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

If you want it to feel closer to the other extension, make cards more compact and increase the grid density.

---

### 4) Keep selection logic linear at first

Your current system already uses one selected index, which is perfect.

For a first pass, do **linear navigation** in grid mode too:

* `Tab` / `ArrowRight` → next item
* `Shift+Tab` / `ArrowLeft` → previous item
* `ArrowDown` / `ArrowUp` can still move by 1 until you add proper column math

That gets you working fast.

If you want proper grid movement, compute the number of columns from the rendered grid:

```js
function getGridColumns() {
    const grid = shadow?.querySelector(".grid-panel");
    const firstCard = grid?.querySelector(".grid-card");
    if (!grid || !firstCard) return 1;

    const gridRect = grid.getBoundingClientRect();
    const cardRect = firstCard.getBoundingClientRect();
    const gap = 12;
    return Math.max(1, Math.floor((gridRect.width + gap) / (cardRect.width + gap)));
}
```

Then map arrows like this:

```js
function moveGridSelection(direction, tabs) {
    const cols = getGridColumns();
    let next = currentSelectedIndex;

    if (direction === "right") next += 1;
    if (direction === "left") next -= 1;
    if (direction === "down") next += cols;
    if (direction === "up") next -= cols;

    next = (next + tabs.length) % tabs.length;
    currentSelectedIndex = next;
    updateSelection(tabs, next);
}
```

---

### 5) Reuse your existing keyboard handler

In your `keydown` listener, add grid-specific behavior:

```js
if (isActive) {
    const layoutMode = /* read current layout mode from settings */;

    if (layoutMode === "grid") {
        if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: 1 });
        } else if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: -1 });
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: /* cols */ 1 });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: "cyclr-change-selected", direction: /* -cols */ -1 });
        }
    }
}
```

If you do not want to compute columns yet, just treat up/down like next/prev for now. The UI will still work.

---

### 6) Background script only needs a small tweak

Your background already sends the tab list and selected index. Just make sure it also passes the layout setting through in the `cyclr-render` message.

Something like:

```js
chrome.runtime.sendMessage({
    type: "cyclr-render",
    tabs,
    selectedIndex,
    theme,
    layoutMode,   // "list" | "preview" | "grid"
    zoomFactor,
    uiScale,
    enableAnimations,
    enableBlur
});
```

---

### 7) Add a mode switch in settings

In your settings UI, add a layout option:

```js
chrome.storage.local.set({
    layoutMode: "grid"
});
```

or use a dropdown:

* `list`
* `preview`
* `grid`

Then `overlay.js` reads it the same way you already read `customShortcut` and `devMode`.

---

## Best way to plug this into your current code

Your `overlay.js` already has good infrastructure:

* shadow DOM
* overlay lifecycle
* keyboard hooks
* mouse hover selection
* focus restore
* storage-backed settings

So the safest approach is:

1. **Keep your current code**
2. Add a new `renderGridLayout()`
3. Add `.grid-*` CSS
4. Branch on `layoutMode === "grid"`
5. Leave the rest untouched

That gives you the new mode without breaking Alt+Q.

## One important detail

The other extension uses a **different interaction model**: hold key, move through tabs, release key to commit.
Your current Cyclr behavior is already close, but if you later want it to feel even more like that, you can add:

* `keydown` open
* repeated keydown moves selection
* `keyup` commits

You are already mostly there.

The refrence grid document 
```
(()=>{function e(t,i="text/html"){let n=new DOMParser().parseFromString(t,i),o=t.match(/<\s*([a-zA-Z0-9-]+)/)[1];return document.adoptNode(n.querySelector(o))}let t={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};async function i(e){return chrome.runtime.sendMessage(e)}async function n(e){if(!e){let{id:t}=await chrome.windows.getCurrent();e=t.toString()}let t=await chrome.storage.session.get(e);return[e,t[e]]}async function o(e){let[,t]=await n(e);return t?.thumbnails??[]}async function a(e){return chrome.storage.session.set({isOverlayOpen:e})}let r="g7Kf9x",l=`${r}-fo`,s=`${r}-style`,c=chrome.runtime.getURL("images/favicon.png"),d={container:`${r}_container`,overlay:`${r}_overlay`,item:`${r}_item`,preview:`${r}_preview`,text:`${r}_text`,thumbnail:`${r}_thumbnail`,icon_thumbnail:`${r}_icon_thumbnail`,active:`${r}_active`,icon:`${r}_icon`,close_button:`${r}_close_button`,close_button_wrapper:`${r}_close_button_wrapper`},p={pink:{main:"#ff8ad4",thumbBg:"rgba(255, 138, 212, 0.3)",overlayBg:"#3d2236a1"},blue:{main:"#7aa2ff",thumbBg:"rgba(122, 162, 255, 0.3)",overlayBg:"#25314da1"},yellow:{main:"#ffd43b",thumbBg:"rgba(255, 212, 59, 0.3)",overlayBg:"#3a300da8"},green:{main:"#5ee17c",thumbBg:"rgba(94, 225, 124, 0.25)",overlayBg:"#1f3225a1"},red:{main:"#ff6b6b",thumbBg:"rgba(255, 107, 107, 0.3)",overlayBg:"#3a1b1ba8"},white:{main:"#d9d9d9",thumbBg:"rgba(217, 217, 217, 0.25)",overlayBg:"#222222a6"}},u=[],m=[],h=0,v=!1,f="Control",b=null,g={shortcut:"Ctrl+Q",color:"blue",layout:"overlays",tabCount:6};async function w(e){"OPEN_OVERLAY"===e.type?await x(e):"RELEASED"===e.type&&await y()}async function x(e){if(e.tabs?.length){if(f=e.modifierKey??"Control",g=e.prefs,v)h=(h+e.direction+m.length)%m.length,b&&Array.from($()?.children??[]).forEach((e,t)=>e.classList.toggle(d.active,t===h));else{let t=e.tabs.slice(0,g.tabCount),i=function(e,t){for(let i=0;i<e.length;i++)if(t(e[i],i,e))return i;return -1}(t,t=>t.id===e.tabId);h=e.fromCurrentTab&&1!==i?1:0,m=await I(t,e.windowId),await T(m)}$()?.focus()}}async function y(){v&&(j(),await V(h))}function $(){return b?.shadowRoot?.querySelector(`.${d.overlay}`)}async function _(e){e.key,e.key===f&&v&&(j(),await V(h))}function E(e){e.key===f||"Escape"===e.key&&v&&(j(),e.stopImmediatePropagation())}function B(e){v&&!e.target.closest(`.${d.overlay}`)&&j()}function L(){j()}function k(){document.hidden&&j()}function C(e){v&&e.preventDefault()}function A(e){let t=e.target,i=t.closest(`.${d.close_button}`);if(i)return void S(i);let n=t.closest(`.${d.item}`);if(n)return void function(e){let t=Number(e.dataset.index);if(0===t)return setTimeout(()=>j(),50);V(t)}(n)}async function S(e){let t=Number(e.dataset.tabid);try{await i({type:"TRY_CLOSE_TAB",id:t})}catch(e){console.warn("Tab close error:",e);return}m=m.filter(e=>e.id!==t),h=Math.min(h,m.length-1),await T(m)}async function T(i){var n;let{color:o}=g;if(document.fullscreenElement)try{await document.exitFullscreen()}catch(e){}b||(b=function(){let t=e(`
    <div class="${d.container}" style="position: fixed; top: 0; left: 0; z-index: 2147483647"/>
  `),i=e(`
    <style>
      .${d.overlay} {
        --gap: 20px;
        --color-main: currentColor;
        --color-thumbnail: currentColor;
        --color-overlay: currentColor;
        border: 1px solid #55555557;
        user-select: none;
        display: flex;
        background: var(--color-overlay);
        box-shadow: 3px 4px 16px 3px #0b0c1285;
        backdrop-filter: blur(10px);
        border-radius: 20px;
        padding: var(--gap) var(--gap) 8px var(--gap);
        gap: var(--gap);
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font: 12px sans-serif;
        color: white;
        flex-wrap: wrap;
        width: max-content;
        max-width: calc(100dvw - 2*var(--gap) - 2px);
        box-sizing: border-box;
        align-content: flex-start;
        justify-content: center;
        transition: opacity 150ms ease-out;
        outline: 0 solid transparent;
        opacity: 0;
        &.show {
          opacity: 1;
        }
        &.exportable {
          position: static;
          transform: none;
        }
      }

      .${d.item} {
        padding-bottom: 6px;
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        flex: 0 0 140px;
        max-width: 140px;
        box-sizing: border-box;
        position: relative;
        transition: transform 200ms ease-out;
        
        &:hover {
          cursor: pointer;
          transform: scale(1.05);
          .${d.preview} {
            outline: 2px solid var(--color-main);
          }
          .${d.close_button_wrapper} {
            display: flex;
          }
        }
        &.${d.active}, &:hover.${d.active} {
          transform: scale(1.1);
          .${d.preview} {
            background: var(--color-thumbnail);
            outline: 2px solid var(--color-main);
            box-shadow: 2px 4px 10px #1f223570;
          }
        }
      } 
      .${d.preview} {
        background: rgba(255, 255, 255, 0.08);
        height: 90px;
        margin-bottom: 6px;
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid transparent;
        transition: outline-color 200ms ease-out;
        outline: 0 solid transparent;
      }
      .${d.text} {
        font-size: 14px;
        font-family: system-ui;
        display: flex;
        gap: 4px;
        align-items: center;
        min-width: 0;
        filter: drop-shadow(1px 1px 4px rgba(34,34,34,0.52));
        span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          flex: 1;
        }
      }
      .${d.thumbnail} {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top center;
        display: block;
        overflow: visible;
      }
      .${d.icon_thumbnail} {
        width: 48px;
        position: relative;
        top: calc(50% - 24px);
        left: calc(50% - 24px);
        opacity: 0.3;
      }
      .${d.icon} {
        height: 14px;
        width: 14px;
        vertical-align: bottom;
      }
      .${d.close_button_wrapper} {
        display: none;
        align-items: center;
        justify-content: center;
        position: absolute;
        height: 24px;
        width: 24px;
        top: -10px;
        right: -10px;
      }
      .${d.close_button} {
        height: 20px;
        width: 20px;
        align-items: center;
        justify-content: center;
        padding: 0;
        border-radius: 50%;
        border: 0;
        background: #ff6b6b;
        display: flex;
        cursor: pointer;
        &:hover {
          background: #ff8282;
        }
      }
      
      @media (max-width: 600px) {
        .${d.overlay} {
          --gap: 0;
          padding: 8px;
          flex-direction: column;
          
          .${d.item} {
            flex: 1;
            max-width: 180px;
            
            .${d.text} {
              padding: 8px;
              border-radius: 8px;
            }
            
            &:hover, &.${d.active}, &:hover.${d.active} {
              transform: scale(1);
              .${d.text} {
                color: white;
                outline: 2px solid var(--color-main);
              }
            }
          }
          
          .${d.preview} {
            display: none;
          }
          
        }
     
      }
    </style>
  `),n=t.attachShadow({mode:"open"}),o=e(`
    <div class="${d.overlay} " tabindex="-1"></div>
  `),a=e(`
    <div tabindex="-1" style="padding: "  ></div>
  `);return a.appendChild(o),o.addEventListener("pointerdown",A),n.appendChild(i),n.appendChild(a),t}());let r=$(),u=(n=h,e(`
    <div>
      ${i.map((e,i)=>{var o;return`
        <div data-index="${i}" class="${d.item} ${i===n?d.active:""}">
          <div class="${d.preview}">
            ${(o=e).thumbnail?`<img class="${d.thumbnail}" src="${o.thumbnail}"  alt="thumb">`:"normal"!==o.type?`<img class="${d.icon_thumbnail}" src="${chrome.runtime.getURL(`images/${o.type}.svg`)}"  alt="thumb">`:""}
          </div>
          <span class="${d.text}">
            <img class="${d.icon}" src="${e.favIconUrl||c}" alt="favicon">
            <span>${e.title?e.title.replace(/[&<>"']/g,e=>t[e]):"(untitled)"}</span>
          </span>
          ${!e.isPinned?`
            <div class="${d.close_button_wrapper}">
              <button data-tabid="${e.id}" class="${d.close_button}"><svg height="18px" width="18px" viewBox="0 -960 960 960" fill="white"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg></button>
            </div>
          `:""}          
        </div>
      `}).join("")}
    </div>
  `));r.style.setProperty("--color-main",p[o].main),r.style.setProperty("--color-thumbnail",p[o].thumbBg),r.style.setProperty("--color-overlay",p[o].overlayBg),r.replaceChildren(...Array.from(u.childNodes)),r.addEventListener("error",e=>{e.target instanceof HTMLImageElement&&(e.target.src=c)},!0),function(t){if(t){if(document.documentElement instanceof SVGSVGElement){let i=document.documentElement;i.dataset.originalViewBox=i.getAttribute("viewBox")??"",i.setAttribute("viewBox","");let n=e(`
    <style id="${s}" xmlns="http://www.w3.org/2000/svg">
      :root {
				width: 100vw !important;
				height: 100vh !important;
				display: block !important;
			}
			:root > :not(#${l}) { 
				visibility: hidden !important; 
			}
    </style>
  `);i.insertBefore(n,i.firstChild);let o=e(`
    <foreignObject 
      id="${l}" 
      xmlns="http://www.w3.org/2000/svg" 
      x="0" y="0" 
      width="100%" height="100%"
    >
    </foreignObject>
  `,"image/svg+xml");o.appendChild(t),i.appendChild(o)}else document.body.appendChild(t);requestAnimationFrame(()=>$()?.classList.add("show"))}}(b),a(v=!0)}async function V(e){if(m?.[e]?.id)return i({type:"ACTIVATE_TAB",id:m[e].id})}function j(){if(v){var e=b;if(e)if($()?.classList.remove("show"),document.documentElement instanceof SVGSVGElement){let t=document.documentElement;t.dataset.originalViewBox&&(t.setAttribute("viewBox",t.dataset.originalViewBox),delete t.dataset.originalViewBox),document.getElementById(s)?.remove(),e.parentElement?.remove(),e.remove()}else e.remove();a(v=!1)}}async function I(e,t){let i=await o(t);return e.map(e=>({...e,thumbnail:i.find(t=>t.tabId===e.id)?.thumbnail}))}(async function e(){console.log(`Tab Flick \u{2728} v${chrome.runtime.getManifest().version}`),chrome.runtime.onMessage.addListener(w),u.push(()=>chrome.runtime.onMessage.removeListener(w)),window.addEventListener("keyup",_,!0),u.push(()=>window.removeEventListener("keyup",_)),window.addEventListener("keydown",E,!0),u.push(()=>window.removeEventListener("keydown",E)),window.addEventListener("blur",L),u.push(()=>window.removeEventListener("blur",L)),document.addEventListener("visibilitychange",k),u.push(()=>document.removeEventListener("visibilitychange",k)),window.addEventListener("click",B),u.push(()=>window.removeEventListener("click",B)),document.addEventListener("contextmenu",C),u.push(()=>document.removeEventListener("contextmenu",C))})()})();
  
  ```