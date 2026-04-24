// ==UserScript==
// @name         CodeHS Human Typer - CLI Agent HUD v4.9.5 (Modal Sync)
// @namespace    http://tampermonkey.net/
// @version      4.9.5
// @description  v4.9 Visuals + SPA Flush + Directions Modal Syncing
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
        lastAssignment: null,
        lastDirectionsText: "", // Tracker for content freshness
        activeLLMNotif: false
    };

    const injectStyles = () => {
        if (document.getElementById('vibe-styles-49')) return;
        const style = document.createElement('style');
        style.id = 'vibe-styles-49';
        style.innerHTML = `
            #vibe-agent-hud {
                position: fixed; bottom: 20px; right: 20px;
                width: 260px; background: rgba(10, 12, 16, 0.98);
                color: #eceff4; border: none; border-radius: 0px;
                border-left: 5px solid #81a1c1;
                font-family: 'JetBrains Mono', 'Courier New', monospace; z-index: 99999;
                padding: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            }
            .agent-header {
                display: flex; justify-content: space-between; align-items: center;
                font-weight: 900; border-bottom: 1px solid rgba(76, 86, 106, 0.5);
                margin-bottom: 12px; padding-bottom: 8px; font-size: 10px; letter-spacing: 1px;
            }
            #agent-status-text { color: #81a1c1; line-height: 1; display: inline-block; }
            .agent-stat { font-size: 13px; margin: 8px 0; font-weight: bold; color: #d8dee9; }
            .agent-stat span { color: #fff; }
            .agent-bar { background: rgba(46, 52, 64, 0.5); height: 4px; margin: 12px 0; overflow: hidden; }
            .agent-fill { background: #81a1c1; height: 100%; width: 0%; transition: width 0.3s cubic-bezier(0.05, 0.7, 0.1, 1.0); }
            #agent-config-panel { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(76, 86, 106, 0.5); }
            .config-input { background: #1a1e26; border: 1px solid #3b4252; color: #a3be8c; width: 60px; font-family: inherit; font-size: 11px; margin-left: 8px; padding: 4px; outline: none; }
            .agent-btn {
                background: rgba(46, 52, 64, 0.3); border: 1px solid #4c566a;
                color: #d8dee9; font-family: inherit; cursor: pointer;
                font-size: 10px; padding: 4px 8px; border-radius: 0px;
                text-transform: uppercase; transition: all 0.2s;
                line-height: 1; display: flex; align-items: center; justify-content: center;
            }
            .agent-btn:hover:not(:disabled) { background: #4c566a; color: #fff; border-color: #81a1c1; }
            .btn-abort { border-color: #bf616a; color: #bf616a; width: 100%; margin-top: 12px; padding: 10px; font-weight: bold; background: rgba(191, 97, 106, 0.05); }
            .btn-abort:disabled { opacity: 0.1; cursor: not-allowed; }
            #vibe-notif-container { position: fixed; top: 20px; right: 20px; display: flex; flex-direction: column; align-items: flex-end; z-index: 100000; pointer-events: none; }
            .vibe-notif-wrapper { transition: all 0.45s cubic-bezier(0.2, 1, 0.2, 1); max-height: 200px; opacity: 1; margin-bottom: 10px; pointer-events: auto; }
            .vibe-notif { width: 280px; background: rgba(10, 12, 16, 0.98); border: none; color: #eceff4; font-family: 'JetBrains Mono', monospace; padding: 12px 16px 16px 16px; position: relative; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            .notif-enter { animation: kineticSlideIn 0.8s cubic-bezier(0.05, 0.7, 0.1, 1.0) forwards; }
            .notif-exit { animation: kineticSlideOut 0.4s cubic-bezier(0.3, 0, 0.8, 0.15) forwards; }
            .wrapper-collapsed { max-height: 0 !important; margin-bottom: 0 !important; opacity: 0 !important; }
            @keyframes kineticSlideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes kineticSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(120%); opacity: 0; } }
            .notif-timer-bar { position: absolute; bottom: 0; left: 0; height: 4px; width: 100%; transition: width linear; z-index: 10; }
            .hud-busy { border-left-color: #a3be8c !important; }
            .hud-busy #agent-status-text { color: #a3be8c !important; }
            .hud-busy .agent-fill { background: #a3be8c !important; }
            .hud-idle { border-left-color: #81a1c1 !important; }
            .notif-start, .notif-complete, .notif-inject { border-left: 5px solid #81a1c1; }
            .notif-start .notif-timer-bar, .notif-complete .notif-timer-bar, .notif-inject .notif-timer-bar { background: #81a1c1; }
            .notif-abort { border-left: 5px solid #bf616a; }
            .notif-abort .notif-timer-bar { background: #bf616a; }
            .notif-config { border-left: 5px solid #ebcb8b; }
            .notif-config .notif-timer-bar { background: #ebcb8b; }
            .notif-llm { border-left: 5px solid #ebcb8b; }
            .notif-llm .notif-timer-bar { background: #ebcb8b; }
            .llm-btn { background: #ebcb8b; color: #000; font-weight: 900; margin-top: 10px; width: 100%; border: none; padding: 8px; cursor: pointer; font-family: inherit; font-size: 10px; text-transform: uppercase; }
        `;
        document.head.appendChild(style);
    };

    function notify(text, type = "inject", duration = 5000, hasButton = false) {
        const container = document.getElementById('vibe-notif-container');
        if (!container) return;

        const wrapper = document.createElement('div');
        wrapper.className = `vibe-notif-wrapper ${type === 'llm' ? 'vibe-llm-node' : ''}`;

        const notif = document.createElement('div');
        notif.className = `vibe-notif notif-${type} notif-enter`;
        const tag = type === "llm" ? "NEXTGEN_LLM // PLUGIN" : "SYSTEM_AGENT // LOG";

        notif.innerHTML = `
            <div style="font-size: 9px; color: #81a1c1; margin-bottom: 2px; font-weight: bold;">${tag}</div>
            <div style="font-weight: 900; font-size: 13px; letter-spacing: 1px; color: #fff;">${text.toUpperCase()}</div>
            ${hasButton ? `<button class="llm-btn" id="llm-copy-trigger">GENERATE CONTEXT PACK</button>` : ''}
            <div class="notif-timer-bar" style="transition-duration: ${duration}ms; width: 100%;"></div>
        `;

        wrapper.appendChild(notif);
        container.appendChild(wrapper);

        const triggerExit = () => {
            if (!wrapper.parentNode || notif.classList.contains('notif-exit')) return;
            notif.classList.remove('notif-enter');
            notif.classList.add('notif-exit');
            setTimeout(() => {
                wrapper.classList.add('wrapper-collapsed');
                setTimeout(() => {
                    if (wrapper.parentNode) wrapper.remove();
                    if (type === "llm") state.activeLLMNotif = false;
                }, 500);
            }, 250);
        };

        if (hasButton) {
            notif.querySelector('#llm-copy-trigger').onclick = () => {
                extractAndCopyContext();
                triggerExit();
                setTimeout(() => notify("Context Copied", "config", 3000), 800);
            };
        }

        setTimeout(() => { if (notif.querySelector('.notif-timer-bar')) notif.querySelector('.notif-timer-bar').style.width = '0%'; }, 50);
        if (duration < 999999) setTimeout(triggerExit, duration);

        wrapper.forceExit = triggerExit;
        return wrapper;
    }

    function extractAndCopyContext() {
        const editorEl = document.querySelector('.ace_editor');
        const directionsEl = document.querySelector('#markdown-description') || document.querySelector('.directions.prism-highlight');
        const code = editorEl ? ace.edit(editorEl).getValue() : "N/A";
        const task = directionsEl ? directionsEl.innerText.trim() : "N/A";
        const context = `[SYSTEM_CONTEXT_PACK]\n\n[TASK]\n${task}\n\n[CODE]\n${code}`;
        navigator.clipboard.writeText(context);
    }

    function updateHUD(isTyping) {
        const hud = document.getElementById('vibe-agent-hud');
        if (!hud) return;
        document.getElementById('v-prog').innerText = `${state.stats.progress}%`;
        document.getElementById('v-cps').innerText = state.stats.cps;
        document.getElementById('v-bar').style.width = `${state.stats.progress}%`;
        const abortBtn = document.getElementById('vibe-abort-btn');
        const statusText = document.getElementById('agent-status-text');
        if (isTyping) {
            hud.className = 'hud-busy';
            abortBtn.disabled = false;
            statusText.innerText = "SYSTEM_AGENT // BUSY";
        } else {
            hud.className = 'hud-idle';
            abortBtn.disabled = true;
            statusText.innerText = "SYSTEM_AGENT // IDLE";
        }
    }

    async function typeAsHuman(rawText, editor) {
        if (state.isTyping) return;
        state.isTyping = true;
        notify("Process started.", "start");
        updateHUD(true);
        const originalOptions = { enableAutoIndent: editor.getOption("enableAutoIndent"), behavioursEnabled: editor.getOption("behavioursEnabled") };
        editor.setOptions({ enableAutoIndent: false, behavioursEnabled: false });
        let startTime = Date.now();
        for (let i = 0; i < rawText.length; i++) {
            if (!state.isTyping) break;
            editor.insert(rawText[i]);
            if (i % 5 === 0 || i === rawText.length - 1) {
                state.stats.progress = Math.round(((i + 1) / rawText.length) * 100);
                state.stats.cps = Math.round((i + 1) / ((Date.now() - startTime) / 1000));
                updateHUD(true);
            }
            await new Promise(r => setTimeout(r, state.baseDelay + (Math.random() * state.jitter)));
        }
        editor.setOptions(originalOptions);
        if (state.isTyping) notify("Process completed.", "complete");
        state.isTyping = false;
        updateHUD(false);
    }

    function initAgent() {
        if (document.getElementById('vibe-agent-hud')) return;
        injectStyles();
        const hud = document.createElement('div');
        hud.id = 'vibe-agent-hud';
        hud.className = 'hud-idle';
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
                <div class="agent-stat">JITTER: <input type="number" id="cfg-jitter" class="config-input" value="${state.jitter}"></div>
            </div>
            <button class="agent-btn btn-abort" id="vibe-abort-btn" disabled>[ TERMINATE_SEQUENCE ]</button>
        `;
        document.body.appendChild(hud);
        if (!document.getElementById('vibe-notif-container')) {
            const nc = document.createElement('div');
            nc.id = 'vibe-notif-container';
            document.body.appendChild(nc);
        }
        document.getElementById('vibe-toggle-cfg').onclick = () => {
            const panel = document.getElementById('agent-config-panel');
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        };
        document.getElementById('cfg-delay').onchange = (e) => state.baseDelay = parseInt(e.target.value);
        document.getElementById('cfg-jitter').onchange = (e) => state.jitter = parseInt(e.target.value);
        document.getElementById('vibe-abort-btn').onclick = () => {
            if(state.isTyping) notify("Process aborted.", "abort");
            state.isTyping = false;
            updateHUD(false);
        };
    }

    // Modal Watchdog: Waits for fresh DOM content
    function waitForDirections() {
        const modal = document.querySelector('#directions-modal');
        const content = document.querySelector('#markdown-description') || document.querySelector('.directions.prism-highlight');

        if (modal && content) {
            const text = content.innerText.trim();
            // If text is not empty and different from previous lesson, it's fresh
            if (text.length > 5 && text !== state.lastDirectionsText) {
                state.lastDirectionsText = text;
                state.activeLLMNotif = true;
                notify("New Assignment Detected", "llm", 10000, true);
                return;
            }
        }
        // Check again shortly
        setTimeout(waitForDirections, 500);
    }

    // Primary Watchdog
    setInterval(() => {
        const isEditorPage = !!document.querySelector('.ace_editor');
        const currentPath = window.location.pathname;

        if (isEditorPage && !document.getElementById('vibe-agent-hud')) initAgent();

        if (currentPath.includes('/assignment/') && state.lastAssignment !== currentPath) {
            state.lastAssignment = currentPath;

            // Clear old UI immediately on redirect
            document.querySelectorAll('.vibe-llm-node').forEach(node => { if (node.forceExit) node.forceExit(); });
            state.activeLLMNotif = false;

            // Start waiting for the fresh modal content
            if (isEditorPage) waitForDirections();
        }
    }, 500);

    window.addEventListener('keydown', async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            const editorEl = document.querySelector('.ace_editor');
            if (!editorEl) return;
            e.preventDefault(); e.stopImmediatePropagation();
            const text = await navigator.clipboard.readText();
            if (text) typeAsHuman(text, ace.edit(editorEl));
        }
    }, true);

    initAgent();
    notify("Script initialized.", "inject");
})();
