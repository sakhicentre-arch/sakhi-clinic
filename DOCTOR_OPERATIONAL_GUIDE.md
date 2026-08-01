# Sakhi Clinic — What You Need to Know About Your Data

This is written for you, not for engineers. It explains what protects your patient records today, what does not, and what you need to do about it.

---

## The one thing to understand first

**Everything you type is saved on this specific device, in this specific browser.** There is no automatic copy anywhere else — not on the internet, not on another device — unless you have manually created one. If this device is lost, damaged, or reset, and you have not made a backup file, that data is gone. This has not changed with the recent update, and fixing it is a separate, larger project (not yet built).

What *has* changed: the app is now better at protecting what's on this device from everyday mistakes — accidental double-bookings, a save silently failing, and so on. Read on for what that means in practice.

---

## Backup expectations

- Use the app's **Download Backup** feature regularly — ideally every time you finish for the day, and definitely before any of the events below (reinstalling the browser, getting a new phone or laptop, restarting the device after it's been acting strangely).
- A backup is a single file. **Move it off this device** — email it to yourself, save it to a USB drive, upload it to your own cloud storage (Google Drive, etc.). A backup file that stays on the same device is not protection against that device failing.
- There is currently no automatic backup to Google Drive or any cloud service. This is planned but not yet built. Until it exists, backups are entirely your responsibility.

## What happens if you reinstall or replace something

| If you... | What happens to your data | What to do |
|---|---|---|
| Reinstall Chrome on your phone (uninstall then reinstall) | **All data on this device is erased.** Android clears an app's storage when it's uninstalled. | Restore from a backup file you made *before* uninstalling. |
| Reinstall Windows on your laptop | **All data is erased**, same reason. | Same — restore from a backup made beforehand. |
| Clear your browser's data/history "for privacy" | **All data is erased.** This is a common trap — a routine "clear browsing data" cleanup will delete the clinic database too. | Never do this without a fresh backup first. |
| Get a new phone or laptop | **Nothing transfers automatically.** | Export a backup on the old device, transfer the file, import it on the new one. |
| Your device's storage becomes corrupted or the drive fails | **Data is not recoverable** through this app. | Only a backup file made beforehand can restore it. |

There is no exception to this pattern today. The single safeguard against all of these is the same: **a backup file, made recently, stored somewhere other than this device.**

## Browser limitations you should know about

- The app is tied to the exact web address (URL) it was first opened at. If that address ever changes — for example, if we move the app to a new hosting provider — you may see a warning banner saying the address doesn't match what it remembers. **This is only a warning, it will not block you from using the app.** If you know the change was expected (we told you about it), there's a button to dismiss it permanently. If you did *not* expect it, stop and ask before dismissing — it can mean you're looking at the wrong install and your real data is elsewhere.
- Don't switch between "the app in a regular browser tab" and "the app added to your home screen" and expect them to share data automatically in every situation — stick to one way of opening it once you've started using it, unless you've been told otherwise.

## Known operational risks, plainly stated

- **No off-device backup exists automatically.** You are the backup system until a cloud-sync feature is built.
- **If storage becomes corrupted, there is no repair tool.** The app can tell you something is wrong, but it cannot fix it. A recent backup is the only recovery path.
- **A very unusual, very high-volume scenario** (thousands of unsynced background records accumulating) could cause a background maintenance task to take longer than usual. This runs quietly in the background every few minutes and should never interrupt you while typing or saving — if it ever visibly slows down a save, that itself is worth reporting.

## Safe upgrade procedure

When the app is updated to a new version:

1. **Before the update**, if it's convenient, download a backup — good practice for any software update, not because this specific update is expected to cause problems.
2. Open the app as usual after the update. It will silently prepare itself for the new version the first time you open it — you don't need to do anything.
3. Confirm your patient list and recent consultations still look correct.
4. If anything looks wrong or missing, **stop, do not keep entering new data**, and get in touch before continuing — this preserves the ability to investigate and recover.

You should never need to do anything manual for a routine update. If you're ever asked to do something unusual (delete a folder, clear browser data, "just reinstall it") to fix an app problem, treat that as a red flag and check with us first — as shown above, that specific advice is often exactly what destroys the data you're trying to protect.
