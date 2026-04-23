// ==UserScript==
// @name         CodeHS Human Typer + NextgenLLM v5.3
// @namespace    http://tampermonkey.net/
// @version      5.3
// @description  Fixed CFG button, restored normalization, and enhanced Terminate button.
// @author       Gemini
// @match        https://codehs.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const state = {
        baseDelay: 40,
        jitter: 15,
        isTyping: false,
        stats: { progress: 0, cps: 0 },
        lastAssignment: null
    };

    const injectStyles = () => {
        if (document.getElementById('vibe-styles')) return;
        const style = document.createElement('style');
        style.id = 'vibe-styles';
        style.innerHTML = `
            #vibe-agent-hud {
                position: fixed; bottom: 20px; right: 20px;
                width: 260px; background: rgba(10, 12, 16, 0.98);
                color: #eceff4; border-left: 5px solid #81a1c1;
                font-family: 'JetBrains Mono', monospace; z-index: 99999;
                padding: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            }
            .agent-header { display: flex; justify-content: space-between; align-items: center; font-weight: 900; border-bottom: 1px solid rgba(76, 86, 106, 0.5); margin-bottom: 12px; padding-bottom: 8px; font-size: 10px; letter-spacing: 1px; }
            #agent-status-text { color: #81a1c1; }
            .agent-stat { font-size: 13px; margin: 8px 0; font-weight: bold; color: #d8dee9; }
            .agent-bar { background: rgba(46, 52, 64, 0.5); height: 4px; margin: 12px 0; overflow: hidden; }
            .agent-fill { background: #81a1c1; height: 100%; width: 0%; transition: width 0.3s ease; }
            
            /* Enhanced Config Panel */
            #agent-config-panel { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(76, 86, 106, 0.5); }
            .config-input { background: #1a1e26; border: 1px solid #3b4252; color: #a3be8c; width: 60px; font-size: 11px; margin-left: 8px; padding: 4px; outline: none; }
            
            .agent-btn { background: rgba(46, 52, 64, 0.3); border: 1px solid #4c566a; color: #d8dee9; cursor: pointer; font-size: 10px; padding: 4px 8px; text-transform: uppercase; font-family: inherit; }
            .agent-btn:hover { background: #4c566a; color: #fff; }

            /* ENHANCED TERMINATE BUTTON */
            .btn-terminate { 
                width: 100%; margin-top: 12px; padding: 10px; 
                font-weight: 900; color: #bf616a; border: 1px solid #bf616a; 
                background: rgba(191, 97, 106, 0.05); transition: all 0.2s;
                letter-spacing: 1px;
            }
            .btn-terminate:hover:not(:disabled) { 
                background: #bf616a; color: #1a1e26; 
                box-shadow: 0 0 15px rgba(191, 97, 106, 0.4);
            }
            .btn-terminate:disabled { opacity: 0.1; cursor: not-allowed; border-color: #4c566a; color: #4c566a; }

            /* Notifications */
            #vibe-notif-container { position: fixed; top: 20px; right: 20px; display: flex; flex-direction: column; align-items: flex-end; z-index: 100000; }
            .vibe-notif-wrapper { transition: all 0.4s ease; margin-bottom: 10px; }
            .vibe-notif { width: 300px; background: rgba(10, 12, 16, 0.98); color: #eceff4; font-family: 'JetBrains Mono', monospace; padding: 14px 18px; position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
            .notif-timer-bar { position: absolute; bottom: 0; left: 0; height: 3px; width: 100%; transition: width linear; }
            
            .notif-llm { border: 1px solid #ebcb8b; border-left: 8px solid #ebcb8b; background: linear-gradient(135deg, rgba(20, 22, 26, 0.99) 0%, rgba(35, 30, 20, 0.99) 100%); }
            .notif-llm .notif-tag { color: #ebcb8b !important; font-weight: 900; }
            .notif-llm .notif-timer-bar { background: #ebcb8b; }
            .llm-btn { background: #ebcb8b !important; color: #000 !important; font-weight: 900; margin-top: 12px; width: 100%; border: none; padding: 10px; cursor: pointer; font-size: 11px; }

            .notif-inject { border-left: 5px solid #81a1c1; }
            .notif-inject .notif-timer-bar { background: #81a1c1; }
        `;
        document.head.appendChild(style);
    };

    function notify(text, type = "inject", duration = 5000, hasButton = false) {
        const container = document.getElementById('vibe-notif-container') || createNotifContainer();
        const wrapper = document.createElement('div');
        wrapper.className = 'vibe-notif-wrapper';
        const tag = type === "llm" ? "NEXTGEN_LLM // PLUGIN" : `SYSTEM_AGENT // ${type.toUpperCase()}`;
        
        const notif = document.createElement('div');
        notif.className = `vibe-notif notif-${type}`;
        notif.innerHTML = `
            <div class="notif-tag" style="font-size: 9px; color: #81a1c1; margin-bottom: 4px;">${tag}</div>
            <div style="font-weight: 900; font-size: 13px; color: #fff;">${text.toUpperCase()}</div>
            ${hasButton ? `<button class="llm-btn" id="llm-copy-trigger">GENERATE CONTEXT PACK</button>` : ''}
            <div class="notif-timer-bar" style="transition-duration: ${duration}ms"></div>
        `;
        wrapper.appendChild(notif);
        container.appendChild(wrapper);

        if (hasButton) {
            notif.querySelector('#llm-copy-trigger').onclick = () => { extractAndCopyContext(); wrapper.remove(); };
        }
        setTimeout(() => { notif.querySelector('.notif-timer-bar').style.width = '0%'; }, 50);
        setTimeout(() => { if (wrapper.parentNode) wrapper.remove(); }, duration);
    }

    function createNotifContainer() {
        const c = document.createElement('div');
        c.id = 'vibe-notif-container';
        document.body.appendChild(c);
        return c;
    }

    function extractAndCopyContext() {
        const editorEl = document.querySelector('.ace_editor');
        const directionsEl = document.querySelector('.directions-modal .directions.prism-highlight') || document.querySelector('.directions.prism-highlight');
        const code = editorEl ? ace.edit(editorEl).getValue() : "N/A";
        const task = directionsEl ? directionsEl.innerText.trim() : "N/A";
        const context = `[SYSTEM_CONTEXT_PACK]\n\n[TASK]\n${task}\n\n[CODE]\n${code}`;
        navigator.clipboard.writeText(context).then(() => notify("Context Copied", "inject", 2000));
    }

    async function typeAsHuman(rawText, editor) {
        if (state.isTyping) return;
        const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        state.isTyping = true;
        
        const originalOptions = { enableAutoIndent: editor.getOption("enableAutoIndent"), behavioursEnabled: editor.getOption("behavioursEnabled") };
        editor.setOptions({ enableAutoIndent: false, behavioursEnabled: false });
        
        let startTime = Date.now();
        for (let i = 0; i < cleanText.length; i++) {
            if (!state.isTyping) break;
            editor.insert(cleanText[i]);
            if (i % 5 === 0 || i === cleanText.length - 1) {
                state.stats.progress = Math.round(((i + 1) / cleanText.length) * 100);
                state.stats.cps = Math.round((i + 1) / ((Date.now() - startTime) / 1000));
                updateHUDDisplay(true);
            }
            await new Promise(r => setTimeout(r, state.baseDelay + (Math.random() * state.jitter)));
        }
        
        editor.setOptions(originalOptions);
        state.isTyping = false;
        updateHUDDisplay(false);
    }

    function updateHUDDisplay(isTyping) {
        const hud = document.getElementById('vibe-agent-hud');
        if (!hud) return;
        document.getElementById('v-prog').innerText = `${state.stats.progress}%`;
        document.getElementById('v-cps').innerText = state.stats.cps;
        document.getElementById('v-bar').style.width = `${state.stats.progress}%`;
        document.getElementById('agent-status-text').innerText = isTyping ? "SYSTEM_AGENT // BUSY" : "SYSTEM_AGENT // IDLE";
        document.getElementById('vibe-abort-btn').disabled = !isTyping;
    }

    function initHUD() {
        if (document.getElementById('vibe-agent-hud')) return;
        injectStyles();
        const hud = document.createElement('div');
        hud.id = 'vibe-agent-hud';
        hud.innerHTML = `
            <div class="agent-header">
                <span id="agent-status-text">SYSTEM_AGENT // IDLE</span>
                <button class="agent-btn" id="vibe-toggle-cfg">CONFIG</button>
            </div>
            <div class="agent-stat">PROGRESS: <span id="v-prog">0%</span></div>
            <div class="agent-stat">RATE: <span id="v-cps">0</span> CPS</div>
            <div class="agent-bar"><div id="v-bar" class="agent-fill"></div></div>
            <div id="agent-config-panel">
                <div class="agent-stat">DELAY: <input type="number" id="cfg-delay" class="config-input" value="${state.baseDelay}"></div>
            </div>
            <button class="agent-btn btn-terminate" id="vibe-abort-btn" disabled>[ TERMINATE_SEQUENCE ]</button>
        `;
        document.body.appendChild(hud);
        
        // RESTORED CONFIG LOGIC
        document.getElementById('vibe-toggle-cfg').onclick = () => {
            const p = document.getElementById('agent-config-panel');
            p.style.display = p.style.display === 'block' ? 'none' : 'block';
        };
        document.getElementById('cfg-delay').onchange = (e) => { state.baseDelay = parseInt(e.target.value); };
        document.getElementById('vibe-abort-btn').onclick = () => { state.isTyping = false; };
    }

    const watchdog = new MutationObserver(() => {
        const path = window.location.pathname;
        if (document.querySelector('.ace_editor') && !document.getElementById('vibe-agent-hud')) initHUD();
        if (path.includes('/assignment/') && state.lastAssignment !== path) {
            state.lastAssignment = path;
            setTimeout(() => notify("Plugin ready for extraction.", "llm", 10000, true), 1500);
        }
    });

    watchdog.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('keydown', async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            const editorEl = document.querySelector('.ace_editor');
            if (!editorEl) return;
            e.preventDefault(); e.stopImmediatePropagation();
            const text = await navigator.clipboard.readText();
            if (text) typeAsHuman(text, ace.edit(editorEl));
        }
    }, true);
})();
