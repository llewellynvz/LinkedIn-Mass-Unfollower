/**
 * LinkedIn Mass Unfollower Extension (2025)
 * Developed by: Llewellyn E. van Zyl
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

// The popup only kicks off a run, then closes. All navigation/injection happens in
// background.js (which survives the popup closing), and all live progress + controls
// live in an on-page overlay injected by content.js.
document.addEventListener("DOMContentLoaded", function () {
    const followingBtn = document.getElementById("unfollowFollowing");
    const followersBtn = document.getElementById("unfollowFollowers");

    if (!followingBtn || !followersBtn) {
        console.error("[MassUnfollower] Buttons not found! Ensure popup.html has correct IDs.");
        return;
    }

    followingBtn.addEventListener("click", () => startRun("following"));
    followersBtn.addEventListener("click", () => startRun("followers"));
});

function startRun(section) {
    // Close the popup only AFTER the message has been handed to the background,
    // otherwise closing can abort delivery and the run never starts.
    browser.runtime
        .sendMessage({ action: "runSection", section: section })
        .then(() => window.close())
        .catch((error) => {
            console.error("[MassUnfollower] Error starting run:", error);
            window.close();
        });
}
