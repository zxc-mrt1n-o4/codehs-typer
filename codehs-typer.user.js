// ==UserScript==
// @name         CodeHS Human Typer - CLI Agent HUD v4.9
// @namespace    http://tampermonkey.net/
// @version      4.9
// @description  Perfect vertical alignment for header text and config button.
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
        stats: { progress: 0, cps: 0 }
    };

    const injectStyles = () => {
        const style = document.createElement('style');
        style.innerHTML = `
            #vibe-agent-hud {
                position: fixed; bottom: 20px; right: 20px;
                width: 260px; background: rgba(10, 12, 16, 0.98);
                color: #eceff4; border: none; border-radius: 0px;
                border-left: 5px solid #81a1c1;
                font-family: 'JetBrains Mono', 'Courier New', monospace; z-index: 99999;
                padding: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            }

            /* Header alignment fix */
            .agent-header {
                display: flex;
                justify-content: space-between;
                align-items: center; /* Vertically centers children */
                font-weight: 900;
                border-bottom: 1px solid rgba(76, 86, 106, 0.5);
                margin-bottom: 12px;
                padding-bottom: 8px;
                font-size: 10px;
                letter-spacing: 1px;
            }

            #agent-status-text {
                color: #81a1c1;
                line-height: 1; /* Normalizes height for centering */
                display: inline-block;
            }

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
                line-height: 1; /* Match the span's line height */
                display: flex; align-items: center; justify-content: center;
            }
            .agent-btn:hover:not(:disabled) { background: #4c566a; color: #fff; border-color: #81a1c1; }

            .btn-abort { border-color: #bf616a; color: #bf616a; width: 100%; margin-top: 12px; padding: 10px; font-weight: bold; background: rgba(191, 97, 106, 0.05); }
            .btn-abort:disabled { opacity: 0.1; cursor: not-allowed; }

            /* Notification Container */
            #vibe-notif-container {
                position: fixed; top: 20px; right: 20px;
                display: flex; flex-direction: column; align-items: flex-end;
                z-index: 100000; pointer-events: none;
            }
            .vibe-notif-wrapper { transition: all 0.45s cubic-bezier(0.2, 1, 0.2, 1); max-height: 200px; opacity: 1; margin-bottom: 10px; }
            .vibe-notif { width: 280px; background: rgba(10, 12, 16, 0.98); border: none; color: #eceff4; font-family: 'JetBrains Mono', monospace; padding: 12px 16px 16px 16px; position: relative; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            .notif-enter { animation: kineticSlideIn 0.8s cubic-bezier(0.05, 0.7, 0.1, 1.0) forwards; }
            .notif-exit { animation: kineticSlideOut 0.4s cubic-bezier(0.3, 0, 0.8, 0.15) forwards; }
            .wrapper-collapsed { max-height: 0 !important; margin-bottom: 0 !important; opacity: 0 !important; }
            @keyframes kineticSlideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes kineticSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(120%); opacity: 0; } }
            .notif-timer-bar { position: absolute; bottom: 0; left: 0; height: 4px; width: 100%; transition: width 5s linear; z-index: 10; }

            /* Status Colors */
            .hud-busy { border-left-color: #a3be8c !important; }
            .hud-busy #agent-status-text { color: #a3be8c !important; }
            .hud-busy .agent-fill { background: #a3be8c !important; }

            .hud-idle { border-left-color: #81a1c1 !important; }
            .hud-idle #agent-status-text { color: #81a1c1 !important; }
            .hud-idle .agent-fill { background: #81a1c1 !important; }

            .notif-start { border-left: 5px solid #a3be8c; }
            .notif-start .notif-timer-bar { background: #a3be8c; }
            .notif-complete { border-left: 5px solid #a3be8c; }
            .notif-complete .notif-timer-bar { background: #a3be8c; }
            .notif-abort { border-left: 5px solid #bf616a; }
            .notif-abort .notif-timer-bar { background: #bf616a; }
            .notif-config { border-left: 5px solid #ebcb8b; }
            .notif-config .notif-timer-bar { background: #ebcb8b; }
            .notif-inject { border-left: 5px solid #81a1c1; }
            .notif-inject .notif-timer-bar { background: #81a1c1; }
        `;
        document.head.appendChild(style);

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

        const notifContainer = document.createElement('div');
        notifContainer.id = 'vibe-notif-container';
        document.body.appendChild(notifContainer);

        document.getElementById('vibe-toggle-cfg').onclick = () => {
            const panel = document.getElementById('agent-config-panel');
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        };
        document.getElementById('cfg-delay').onchange = (e) => { state.baseDelay = parseInt(e.target.value); notify("Delay updated.", "config"); };
        document.getElementById('cfg-jitter').onchange = (e) => { state.jitter = parseInt(e.target.value); notify("Jitter updated.", "config"); };
        document.getElementById('vibe-abort-btn').onclick = () => Vibe.abort();
    };

    function notify(text, type = "inject", duration = 5000) {
        const container = document.getElementById('vibe-notif-container');
        const wrapper = document.createElement('div');
        wrapper.className = 'vibe-notif-wrapper';
        if (duration > 60000) wrapper.id = "vibe-debug-node";

        const notif = document.createElement('div');
        notif.className = `vibe-notif notif-${type} notif-enter ${duration > 60000 ? 'notif-debug' : ''}`;
        notif.innerHTML = `
            <div style="font-size: 9px; color: #81a1c1; margin-bottom: 2px; font-weight: bold;">SYSTEM_AGENT // LOG</div>
            <div style="font-weight: 900; font-size: 13px; letter-spacing: 1px; color: #fff;">${text.toUpperCase()}</div>
            <div class="notif-timer-bar"></div>
        `;

        wrapper.appendChild(notif);
        container.appendChild(wrapper);

        setTimeout(() => {
            const bar = notif.querySelector('.notif-timer-bar');
            if (bar) bar.style.width = '0%';
        }, 50);

        if (duration < 999999) {
            setTimeout(() => {
                if (wrapper.parentNode) {
                    notif.classList.remove('notif-enter');
                    notif.classList.add('notif-exit');
                    setTimeout(() => {
                        wrapper.classList.add('wrapper-collapsed');
                        setTimeout(() => wrapper.remove(), 500);
                    }, 250);
                }
            }, duration);
        }
    }

    function updateHUD(isTyping) {
        const hud = document.getElementById('vibe-agent-hud');
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
        const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        state.isTyping = true;
        notify("Process started.", "start");
        updateHUD(true);
        const originalOptions = { enableAutoIndent: editor.getOption("enableAutoIndent"), behavioursEnabled: editor.getOption("behavioursEnabled") };
        editor.setOptions({ enableAutoIndent: false, behavioursEnabled: false });
        let startTime = Date.now();
        for (let i = 0; i < cleanText.length; i++) {
            if (!state.isTyping) break;
            editor.insert(cleanText[i]);
            if (i % 5 === 0 || i === cleanText.length - 1) {
                state.stats.progress = Math.round(((i + 1) / cleanText.length) * 100);
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

    window.Vibe = {
        abort: () => {
            if(state.isTyping) notify("Process aborted.", "abort");
            state.isTyping = false;
            updateHUD(false);
        },
        debug: {
            notif: () => notify("Debug 100s sequence active", "inject", 100000),
            nonotif: () => {
                const node = document.getElementById('vibe-debug-node');
                if (node) {
                    const inner = node.querySelector('.vibe-notif');
                    inner.classList.remove('notif-enter');
                    inner.classList.add('notif-exit');
                    setTimeout(() => {
                        node.classList.add('wrapper-collapsed');
                        setTimeout(() => node.remove(), 500);
                    }, 250);
                }
            }
        }
    };

    window.addEventListener('keydown', async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            const editorEl = document.querySelector('.ace_editor');
            if (!editorEl) return;
            e.preventDefault(); e.stopImmediatePropagation();
            const text = await navigator.clipboard.readText();
            if (text) typeAsHuman(text, ace.edit(editorEl));
        }
    }, true);

    injectStyles();
    notify("Script initialized.", "inject");
})();
