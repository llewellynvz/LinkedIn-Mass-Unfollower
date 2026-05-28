/**
 * LinkedIn Mass Unfollower Extension (2025)
 * Developed by: Prof. Llewellyn E. van Zyl (Ph.D)
 * Website: www.psynalytics.com
 *
 * TERMS & CONDITIONS:
 * By using the LinkedIn Mass Unfollower Extension ("the Extension"), developed by Llewellyn E. van Zyl ('the Developer') you acknowledge that you have read, understood,
 * and agreed to be bound by these Terms & Conditions.
 *
 * 1. ACCEPTANCE OF TERMS
 *    - By using this Extension, you agree to these Terms & Conditions in full.
 *
 * 2. DISCLAIMER OF LIABILITY
 *    - The Extension is provided "as is" without any warranty of any kind.
 *    - The developer makes no guarantees about the reliability, accuracy, or safety of this Extension.
 *    - The developer is NOT responsible for any account bans, suspensions, or restrictions imposed by LinkedIn.
 *    - The developer is NOT liable for any direct, indirect, incidental, or consequential damages resulting from
 *      the use of this Extension.
 *
 * 3. USER RESPONSIBILITY
 *    - You acknowledge that you use this Extension at your own risk.
 *    - You are solely responsible for ensuring compliance with LinkedIn's Terms of Service.
 *    - The developer does not encourage or support misuse of this tool.
 *
 * 4. NO LICENSE, BUT ATTRIBUTION REQUIRED
 *    - This script is free to use and modify.
 *    - Attribution to the original developer is required if used or distributed.
 *
 * 5. CHANGES TO THESE TERMS
 *    - The developer reserves the right to update these Terms & Conditions at any time without prior notice.
 *
 * 6. CONTACT INFORMATION
 *    - If you have any questions, contact visit www.psynalytics.com
 *
 * By using this Extension, you confirm that you have read and agreed to these Terms & Conditions.
 */

(() => {
    // Unconditional load marker — proves the content script is actually running on this page.
    console.log("[MassUnfollower] content script loaded on", location.href);

    const PANEL_ID = "mass-unfollower-panel";
    const MAX_RETRIES = 30;

    // The "Following" toggle button. LinkedIn's current (SDUI) layout uses
    // aria-label="Following, click to unfollow <name>"; older layouts used
    // "Click to stop following <name>". Every CSS class is a randomised hash, so the
    // aria-label is the only stable hook. Tried in order; first match wins.
    const UNFOLLOW_SELECTORS = [
        "button[aria-label*='click to unfollow' i]",
        "button[aria-label*='stop following' i]",
        "button[aria-label*='unfollow' i]"
    ];

    // A button is still in the "following" state while its aria-label asks to unfollow.
    // Once unfollowed, LinkedIn flips it to "Follow / click to follow" (no "unfollow").
    const STILL_FOLLOWING_RE = /unfollow|stop following/i;

    function log(...args) {
        console.log("[MassUnfollower]", ...args);
    }

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    // Shared, injection-persistent state so a duplicate injection can't spawn a second loop,
    // and so a finished/stopped run can be cleanly restarted on the same page.
    const state = (window.__massUnfollower = window.__massUnfollower || {
        running: false,
        stopRequested: false,
        count: 0,
        section: "following"
    });

    // ---------------------------------------------------------------- target detection

    function isEligibleButton(btn) {
        if (!btn) return false;
        if (btn.closest("#" + PANEL_ID)) return false;      // never click our own UI
        if (btn.getAttribute("data-mu-skip")) return false;  // entry we already gave up on
        const rect = btn.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false; // not rendered
        return true;
    }

    function queryButtons(root) {
        for (const selector of UNFOLLOW_SELECTORS) {
            let nodes;
            try {
                nodes = Array.from(root.querySelectorAll(selector));
            } catch (e) {
                continue;
            }
            nodes = nodes.filter(isEligibleButton);
            if (nodes.length) return nodes;
        }
        return [];
    }

    function findUnfollowButtons() {
        // Prefer the main content region (avoids stray "Following" buttons in side rails),
        // but fall back to the whole document so we never miss the list if LinkedIn renders
        // it outside <main> — otherwise we'd falsely conclude there's nothing left.
        const main = document.querySelector("main");
        if (main) {
            const inMain = queryButtons(main);
            if (inMain.length) return inMain;
        }
        return queryButtons(document.body);
    }

    // ---------------------------------------------------------------- safety checks

    // Detect a REAL LinkedIn security check. Use only the URL: a genuine challenge navigates
    // to a checkpoint/authwall page. We deliberately do NOT key off the presence of a captcha
    // iframe, because LinkedIn embeds an invisible Google reCAPTCHA ("...recaptcha...") on
    // every normal page — matching that caused false "verification detected" pauses.
    function detectInterstitial() {
        const url = location.href;
        return /\/checkpoint\//i.test(url) || /\/authwall/i.test(url);
    }

    function pauseForInterstitial() {
        state.running = false;
        document.documentElement.removeAttribute("data-mu-running");
        setStatus("Paused — LinkedIn verification detected. Resolve it, then click Start again.");
        log("Interstitial/verification detected. Pausing for safety.");
    }

    function halted() {
        if (state.stopRequested) {
            log("Loop halted (stop requested).");
            return true;
        }
        return false;
    }

    // ---------------------------------------------------------------- the unfollow loop

    function startRun() {
        state.running = true;
        state.stopRequested = false;
        state.count = 0;
        state.section = location.pathname.includes("/followers/") ? "followers" : "following";
        // DOM-level guard: survives within a page load and is reset on navigation, so it
        // blocks a duplicate loop regardless of whether the injected `window` is shared.
        document.documentElement.setAttribute("data-mu-running", "1");
        ensureOverlay();
        renderStopButton();
        updateCount();
        log("Run started. Section:", state.section, "URL:", location.href);
        waitForFirstButton();
    }

    function waitForFirstButton() {
        const deadline = Date.now() + 15000; // adaptive start: up to 15s for the list to render
        setStatus("Scanning for people to unfollow…");
        (function poll() {
            if (halted()) return;
            if (detectInterstitial()) return pauseForInterstitial();
            const found = findUnfollowButtons().length;
            if (found > 0) {
                log("Found", found, "unfollow button(s); starting.");
                processUnfollow();
                return;
            }
            if (Date.now() > deadline) {
                log("No targets in initial window; trying scroll/lazy-load.");
                scrollDownAndRetry();
                return;
            }
            setTimeout(poll, 1000);
        })();
    }

    function processUnfollow() {
        if (halted()) return;
        if (detectInterstitial()) return pauseForInterstitial();

        const buttons = findUnfollowButtons();
        if (buttons.length === 0) {
            scrollDownAndRetry();
            return;
        }

        const btn = buttons[0];
        const label = btn.getAttribute("aria-label") || "";
        const row = btn.closest("li") || btn.parentElement;
        setStatus(`Unfollowing… (${state.count} done)`);
        log("Clicking:", label);
        btn.click();

        // Wait for a possible confirmation dialog to appear.
        setTimeout(() => {
            if (halted()) return;
            confirmThenVerify(btn, row);
        }, randInt(1000, 2000));
    }

    // The confirmation popup's confirm control reads exactly "Unfollow" (row toggles read
    // "Following"). LinkedIn's classes are randomised and the popup has no stable role/aria,
    // so we identify the confirm control anywhere in the document BY ITS LABEL, not by container.
    function isConfirmControl(el) {
        if (!el || el.closest("#" + PANEL_ID)) return false;
        const aria = (el.getAttribute("aria-label") || "").trim().toLowerCase();
        if (/^unfollow$/.test(aria)) return true;                  // aria-label exactly "Unfollow"
        const text = (el.innerText || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (!text || /following/.test(text)) return false;         // exclude the row toggle ("Following")
        // Visible label is just "unfollow" (possibly duplicated across spans) — not a sentence
        // like a heading "Unfollow Dr Sara Garcia?".
        return text.split(" ").every((w) => w === "unfollow");
    }

    function clickConfirmUnfollow() {
        // Prefer genuine clickables; the confirm is almost certainly a <button>.
        let target = Array.from(document.querySelectorAll("button, [role='button']")).find(isConfirmControl);
        if (!target) {
            // Fallback: a labelled span/div — click its nearest clickable ancestor.
            const labelled = Array.from(document.querySelectorAll("span, div, a")).find(isConfirmControl);
            if (labelled) target = labelled.closest("button, [role='button'], [tabindex], a") || labelled;
        }
        if (target) {
            target.click();
            return true;
        }
        return false;
    }

    // Close a popup we couldn't act on, so it can't overlay and block the next click.
    function dismissPopup() {
        const cancel = Array.from(document.querySelectorAll("button, [role='button']")).find((el) => {
            if (el.closest("#" + PANEL_ID)) return false;
            const t = ((el.getAttribute("aria-label") || "") + " " + (el.innerText || "")).toLowerCase();
            return /\b(cancel|dismiss|close)\b/.test(t);
        });
        if (cancel) {
            cancel.click();
            log("Dismissed popup via Cancel/Close.");
            return;
        }
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
        log("Dismissed popup via Escape.");
    }

    // Diagnostic: when we can't find the confirm control, report what IS on the page that
    // mentions "Unfollow", so the real popup markup can be matched precisely from one capture.
    function dumpConfirmCandidates() {
        try {
            const hits = Array.from(document.querySelectorAll("button, [role='button'], a, span, div"))
                .filter((el) => !el.closest("#" + PANEL_ID))
                .filter((el) => /unfollow/i.test(el.innerText || "") && !/following/i.test(el.innerText || ""))
                .slice(0, 8)
                .map((el) => {
                    const role = el.getAttribute("role");
                    const txt = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 30);
                    return el.tagName.toLowerCase() + (role ? `[role=${role}]` : "") + ` "${txt}"`;
                });
            log("DIAGNOSTIC — elements containing 'Unfollow':", hits.length ? hits : "(none found)");
        } catch (e) { /* ignore */ }
    }

    function confirmThenVerify(btn, row) {
        if (clickConfirmUnfollow()) {
            log("Clicked confirm 'Unfollow'.");
            finishConfirm(btn, row);
        } else {
            // The popup may be a touch slow to render — retry once shortly.
            setTimeout(() => {
                if (clickConfirmUnfollow()) {
                    log("Clicked confirm 'Unfollow' (retry).");
                } else {
                    log("No confirm control found (direct toggle, or popup markup changed).");
                    dumpConfirmCandidates();
                }
                finishConfirm(btn, row);
            }, 700);
        }
    }

    function finishConfirm(btn, row) {
        // Verify the unfollow actually took effect before counting it.
        setTimeout(() => {
            if (halted()) return;
            if (verifyUnfollowed(btn, row)) {
                state.count++;
                updateCount();
                log("Verified unfollow. Total:", state.count);
            } else {
                log("Could not verify unfollow; dismissing any popup and skipping this entry.");
                dismissPopup(); // anti-stall: never let an unhandled popup block the queue
                try {
                    if (btn && btn.isConnected) btn.setAttribute("data-mu-skip", "1");
                } catch (e) { /* ignore */ }
            }
            setTimeout(processUnfollow, randInt(2000, 3500));
        }, 1400);
    }

    // POSITIVE resolved-state detection: only count it done when we actually observe the
    // button leave the "following" state — not merely the absence of one word.
    function verifyUnfollowed(btn, row) {
        if (!btn || !btn.isConnected) return true;          // button removed => unfollowed
        if (row && !row.isConnected) return true;           // whole row removed
        if (btn.getAttribute("aria-pressed") === "false") return true; // toggled off
        const label = btn.getAttribute("aria-label") || "";
        if (!STILL_FOLLOWING_RE.test(label)) return true;   // flipped to "Follow / click to follow"
        return false;
    }

    let scrollRetries = 0;

    // How many follow/unfollow toggle buttons are currently rendered — a proxy for how many
    // rows are loaded. Matches "click to unfollow" AND "click to follow" (both contain "follow").
    function countFollowEntries() {
        try {
            return Array.from(document.querySelectorAll("button[aria-label*='follow' i]"))
                .filter((b) => !b.closest("#" + PANEL_ID)).length;
        } catch (e) {
            return 0;
        }
    }

    // Push every scrollable container in the main region to its bottom. LinkedIn's list lives
    // in an INNER scrollable element, so scrolling only `window` loads nothing.
    function scrollAllContainers() {
        let nodes;
        try {
            nodes = document.querySelectorAll("main, main div, main ul, main section, [class*='scroll']");
        } catch (e) {
            return;
        }
        nodes.forEach((el) => {
            try {
                if (el.scrollHeight > el.clientHeight + 4) {
                    const oy = getComputedStyle(el).overflowY;
                    if (/(auto|scroll)/.test(oy)) el.scrollTop = el.scrollHeight;
                }
            } catch (e) { /* ignore */ }
        });
    }

    // Scroll wherever the list actually lives: bring the last row into view (the reliable
    // lazy-load trigger), push all inner scroll containers to the bottom, and scroll the window.
    function nudgeScroll() {
        let anchor = null;
        try {
            const rows = Array.from(document.querySelectorAll("button[aria-label*='follow' i]"))
                .filter((b) => !b.closest("#" + PANEL_ID));
            if (rows.length) anchor = rows[rows.length - 1].closest("li") || rows[rows.length - 1];
        } catch (e) { /* ignore */ }
        if (!anchor) {
            const items = document.querySelectorAll("main li");
            anchor = items.length ? items[items.length - 1] : null;
        }
        if (anchor) {
            try { anchor.scrollIntoView({ block: "end" }); } catch (e) { /* ignore */ }
        }
        scrollAllContainers();
        window.scrollTo(0, document.body.scrollHeight);
        if (document.scrollingElement) {
            document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
        }
    }

    function scrollDownAndRetry() {
        if (halted()) return;
        if (detectInterstitial()) return pauseForInterstitial();

        setStatus(`Loading more… (${state.count} unfollowed)`);
        const before = countFollowEntries();
        nudgeScroll();

        // Click a "Show more / load more" button if the page renders one.
        setTimeout(() => {
            const more = Array.from(document.querySelectorAll("button"))
                .find((b) => /show more|see more|load more/i.test(b.innerText || ""));
            if (more) {
                log("Clicking 'Show more'.");
                more.click();
            }
        }, 400);
        setTimeout(nudgeScroll, 1200); // a second nudge once any lazy content begins rendering

        setTimeout(() => {
            if (halted()) return;
            if (detectInterstitial()) return pauseForInterstitial();

            if (findUnfollowButtons().length > 0) {
                scrollRetries = 0;
                processUnfollow();
            } else if (countFollowEntries() > before) {
                // More rows loaded (even if none are "unfollow" right now) — keep going.
                scrollRetries = 0;
                setTimeout(scrollDownAndRetry, 2500);
            } else {
                scrollRetries++;
                if (scrollRetries < MAX_RETRIES) {
                    log(`No new rows yet… (${scrollRetries}/${MAX_RETRIES})`);
                    setTimeout(scrollDownAndRetry, 3000);
                } else {
                    log("No more users detected. Finishing.");
                    finishRun();
                }
            }
        }, 4000);
    }

    function finishRun() {
        state.running = false;
        document.documentElement.removeAttribute("data-mu-running");
        const nextSection = state.section === "following" ? "followers" : "following";
        if (state.count === 0) {
            // Make a zero result explicit rather than a silent "Done" — usually means the
            // list was already empty, or the page layout/language didn't match the selector.
            setStatus("Done — found no one to unfollow. If you expected more, check the console (F12).");
        } else {
            setStatus(`Done — unfollowed ${state.count}.`);
        }
        showCompletionControls(nextSection);
        log("Run complete. Total:", state.count);
    }

    // ---------------------------------------------------------------- on-page overlay

    function makeButton(text, bg) {
        const b = document.createElement("button");
        b.textContent = text;
        Object.assign(b.style, {
            cursor: "pointer",
            border: "none",
            borderRadius: "8px",
            padding: "8px 12px",
            margin: "2px 4px 2px 0",
            color: "#fff",
            background: bg || "#0a66c2",
            fontWeight: "600",
            fontSize: "12px"
        });
        return b;
    }

    function ensureOverlay() {
        let panel = document.getElementById(PANEL_ID);
        if (panel) {
            panel.style.display = "block";
            return panel;
        }
        panel = document.createElement("div");
        panel.id = PANEL_ID;
        Object.assign(panel.style, {
            position: "fixed",
            top: "16px",
            right: "16px",
            zIndex: "2147483647",
            width: "260px",
            padding: "14px 16px",
            borderRadius: "12px",
            background: "rgba(20,24,33,0.92)",
            color: "#fff",
            font: "13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif",
            boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.12)"
        });
        panel.innerHTML =
            '<div style="font-weight:700;margin-bottom:6px;">LinkedIn Mass Unfollower</div>' +
            '<div id="mu-count" style="font-size:20px;font-weight:700;margin-bottom:2px;">Unfollowed: 0</div>' +
            '<div id="mu-status" style="opacity:0.85;margin-bottom:10px;">Starting…</div>' +
            '<div id="mu-actions"></div>';
        document.body.appendChild(panel);
        return panel;
    }

    function setStatus(text) {
        const el = document.getElementById("mu-status");
        if (el) el.textContent = text;
    }

    function updateCount() {
        const el = document.getElementById("mu-count");
        if (el) el.textContent = "Unfollowed: " + state.count;
    }

    function renderStopButton() {
        const actions = document.getElementById("mu-actions");
        if (!actions) return;
        actions.innerHTML = "";
        const stop = makeButton("Stop", "#e5484d");
        stop.onclick = () => {
            state.stopRequested = true;
            state.running = false;
            document.documentElement.removeAttribute("data-mu-running");
            setStatus(`Stopped at ${state.count}.`);
            log("Stop requested by user.");
            showCompletionControls(state.section === "following" ? "followers" : "following");
        };
        actions.appendChild(stop);
    }

    function showCompletionControls(nextSection) {
        const actions = document.getElementById("mu-actions");
        if (!actions) return;
        actions.innerHTML = "";
        const label = nextSection === "following" ? "Following" : "Followers";
        const cont = makeButton(`Continue with ${label}`, "#0a66c2");
        cont.onclick = () => {
            log("User chose to continue with", nextSection);
            cont.disabled = true;
            browser.runtime
                .sendMessage({ action: "runSection", section: nextSection })
                .catch((e) => console.error("[MassUnfollower] continue error:", e));
        };
        const close = makeButton("Close", "#555b66");
        close.onclick = () => {
            const p = document.getElementById(PANEL_ID);
            if (p) p.remove();
        };
        actions.appendChild(cont);
        actions.appendChild(close);
    }

    // ---------------------------------------------------------------- gated start

    const ARM_WINDOW_MS = 10000;

    function alreadyRunning() {
        return document.documentElement.getAttribute("data-mu-running") === "1" || state.running;
    }

    function onFollowPage() {
        return location.pathname.includes("/mynetwork/network-manager/people-follow/");
    }

    function currentSection() {
        return location.pathname.includes("/followers/") ? "followers" : "following";
    }

    // The armed flag is { ts, section }. Tolerate a bare timestamp for forward/backward safety.
    function readArm(value) {
        if (!value) return null;
        if (typeof value === "number") return { ts: value, section: null };
        return { ts: value.ts, section: value.section || null };
    }

    function isFresh(arm) {
        return !!(arm && arm.ts) && (Date.now() - arm.ts) < ARM_WINDOW_MS;
    }

    // Single guarded entry point for BOTH triggers below, so they can't double-start.
    function maybeStart(source, requestedSection) {
        // Declared on all of linkedin.com, so it also loads on the feed etc. Only act on a
        // follow page, and only on the section that was requested — otherwise leave the flag
        // for the correct page (which the background is navigating to) to consume on load.
        if (!onFollowPage()) {
            log(`Armed (${source}) but not on a follow page — leaving flag.`);
            return;
        }
        if (requestedSection && requestedSection !== currentSection()) {
            log(`Armed (${source}) for "${requestedSection}" but this page is "${currentSection()}" — leaving flag.`);
            return;
        }
        if (alreadyRunning()) {
            log(`Start requested (${source}) but a run is already active; ignoring.`);
            return;
        }
        browser.storage.local.remove("mu_autostart").catch(() => {});
        log(`Starting run (trigger: ${source}).`);
        startRun();
    }

    // Trigger A — armed before this page loaded (you started from a different page and the
    // background navigated here; this fresh load reads the flag).
    browser.storage.local.get("mu_autostart").then((res) => {
        const arm = readArm(res && res.mu_autostart);
        if (isFresh(arm)) {
            maybeStart("on-load flag", arm.section);
        } else {
            log("Loaded but not armed; idle. Click the extension button to start.");
        }
    }).catch((e) => console.error("[MassUnfollower] storage read error:", e));

    // Trigger B — armed while this page is already open (you were on the follow page and
    // clicked Start). Fires instantly via storage change, no reload. maybeStart() is guarded
    // so A and B can't double-start.
    browser.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.mu_autostart) return;
        const arm = readArm(changes.mu_autostart.newValue);
        if (isFresh(arm)) {
            maybeStart("storage change", arm.section);
        }
    });
})();
