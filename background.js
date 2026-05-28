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

const SECTION_URLS = {
    following: "https://www.linkedin.com/mynetwork/network-manager/people-follow/following/",
    followers: "https://www.linkedin.com/mynetwork/network-manager/people-follow/followers/"
};

browser.runtime.onInstalled.addListener(() => {
    console.log("[MassUnfollower] Extension installed.");
});

// Compare two URLs ignoring query string, hash, and trailing slashes.
function normalizeUrl(url) {
    return (url || "").split("#")[0].split("?")[0].replace(/\/+$/, "");
}

// Starts a run. content.js is a declared content script on the follow pages — it does NOT
// run on its own; it only acts when it loads and finds this short-lived "armed" flag.
// So we set the flag, then make sure the follow page (re)loads so the content script reads it.
// This avoids scripting.executeScript, whose host permission is opt-in (and ungranted) on
// Firefox MV3 — the reason the previous version silently never ran.
function runSection(section) {
    const wanted = SECTION_URLS[section] ? section : "following";
    const targetUrl = SECTION_URLS[wanted];

    // The flag carries the target section so only the matching follow page acts on it.
    browser.storage.local.set({ mu_autostart: { ts: Date.now(), section: wanted } }).then(() => {
        return browser.tabs.query({ active: true, currentWindow: true });
    }).then((tabs) => {
        if (!tabs.length) return;
        const tab = tabs[0];
        const tabId = tab.id;

        if (normalizeUrl(tab.url || "") === normalizeUrl(targetUrl)) {
            // Already on the page: the loaded content script starts instantly via its
            // storage.onChanged listener — no reload (reload regressed starting entirely).
            console.log("[MassUnfollower] Already on target page; content script starts via storage change.");
        } else {
            // Navigate; the content script auto-loads on the new page and reads the flag.
            console.log(`[MassUnfollower] Navigating to ${wanted} page...`);
            browser.tabs.update(tabId, { url: targetUrl });
        }
    }).catch((error) => console.error("[MassUnfollower] runSection error:", error));
}

// Triggered by the popup ("Start") and by the on-page overlay ("Continue with next section").
browser.runtime.onMessage.addListener((message) => {
    if (message && message.action === "runSection") {
        runSection(message.section);
    }
});
