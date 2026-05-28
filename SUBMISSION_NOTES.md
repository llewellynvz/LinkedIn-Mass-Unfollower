# Firefox AMO Submission Notes

Reference text for submitting a new version of **LinkedIn Mass Unfollower** to
addons.mozilla.org. Copy the relevant block into the matching field on the
"Upload New Version" form.

---

## Release notes (version 2.0)
*Field: "Release Notes / What's new in this version" — shown to users.*

```
Version 2.0 — major reliability update

• Updated to work with LinkedIn's current Following / Followers management
  pages (the previous version could no longer find the unfollow buttons).
• Reliable one-by-one unfollowing with randomized, human-like pauses
  (~1–3.5s) to avoid overloading LinkedIn.
• New on-page control panel showing a live count, current status, and a
  Stop button so you stay in control at all times.
• Automatically scrolls to load and process your entire list, instead of
  stopping after the first few people.
• When one section finishes, offers to continue with the other
  (Following ↔ Followers).
• Runs only when you click Start — it never acts on its own.
• Pauses automatically if LinkedIn shows a real security checkpoint.
• Reduced permissions to the minimum and confirmed zero data collection.
```

---

## Notes to reviewer
*Field: "Notes to Reviewer" — private, seen only by Mozilla staff.*

```
WHAT THIS EXTENSION DOES
It helps a user clean up their OWN LinkedIn account by unfollowing the
people/pages they currently follow, in bulk. Every action is initiated by
the user clicking a button in the toolbar popup. The extension performs the
same clicks a user would do by hand (click "Following → Unfollow → confirm"),
just sequentially and with delays. There is no scraping, data export, or
background activity.

HOW TO TEST
1. Log in to LinkedIn with any account that follows at least one person or
   company. (The extension does nothing on a logged-out session.)
2. Click the extension's toolbar icon and choose "Start Unfollowing".
3. The extension opens https://www.linkedin.com/mynetwork/network-manager/people-follow/following/
   and an on-page panel appears (top-right) showing a live "Unfollowed" count
   and a Stop button.
4. It unfollows entries one at a time, confirming LinkedIn's own dialog, and
   scrolls to load more until the list is done. "Stop" halts it immediately.
All console logging is prefixed with [MassUnfollower] if you want to trace it.

PERMISSIONS — WHY EACH IS NEEDED
• host "https://www.linkedin.com/*" + content_scripts: the content script
  runs on LinkedIn to click the user's unfollow buttons. It loads on
  linkedin.com but stays completely idle and performs NO actions unless the
  user has explicitly pressed Start (gated by a short-lived storage flag);
  it only acts on the network-manager "people-follow" pages.
• "tabs": to find the active tab and navigate it to the correct
  Following/Followers page the user selected.
• "storage": to remember which section the user chose and to record that the
  user pressed Start, so the content script only runs on explicit user action.

DATA / PRIVACY
No data is collected, stored remotely, or transmitted anywhere. This is
declared in the manifest (data_collection_permissions: ["none"]). All state
is local (browser.storage.local) and transient.

CODE
All scripts are plain, unminified, human-readable JavaScript bundled in the
package — no remote, eval'd, or obfuscated code. The only remote resource is
the "Inter" web font referenced by the popup via Google Fonts (a stylesheet/
font only, no script); happy to self-host it if you prefer.

USER CONSENT / THIRD-PARTY SITE
The extension only automates actions on the user's own logged-in account, at
the user's explicit request, and includes clear liability/ToS disclaimers in
the popup and README. It pauses automatically if LinkedIn presents a security
checkpoint.
```

---

## Reminders
- AMO requires each new upload's version to be **higher** than the last
  published one. This package is **2.0**. If AMO reports the version already
  exists, bump `manifest.json` `"version"` (e.g. to `2.1`) and rebuild the zip.
- Build the submission zip with `manifest.json` at the root (no parent folder),
  including only: `manifest.json`, `background.js`, `content.js`, `popup.js`,
  `popup.html`, `popup.css`, `icon.png`, `LICENSE`, `README.md`.
