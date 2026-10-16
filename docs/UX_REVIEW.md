# UI/UX pass

A short visual and usability pass on top of the functional testing, done at the reviewer's request. Time-boxed, so it covers the main screens rather than every state.

## How it was done

- `tests/ux/ux-tour.spec.ts` walks the main flows with fresh users and saves full-page screenshots to `docs/ux/` at two widths: desktop 1440 px and mobile 390 px (`npx playwright test --project=ux`).
- Screens: sign in (and a failed sign in), sign up, empty room, room with content, new folder, row actions, rename, delete confirmation, share dialog before and after creating a link, folder view, file viewer, public link as an anonymous visitor, "Shared with me" as a viewer.
- I reviewed the screenshots by hand. Not covered: Safari, real phones, dark mode, screen readers beyond the keyboard check in VDR-11.

## What works well

- Calm, consistent visual language: one accent colour, clear hierarchy of primary and secondary buttons, generous spacing.
- The empty state explains what to do and offers both actions right there ([desktop-04](ux/desktop-04-empty-room.png)).
- Delete confirmation names the exact file, says it cannot be undone, and puts focus on Cancel, not on Delete ([desktop-09](ux/desktop-09-delete-confirm.png)).
- Rename keeps the extension outside the input, so a user cannot break `.pdf` by accident in the common case ([desktop-08](ux/desktop-08-rename-dialog.png)); the edge case is VDR-10.
- Read-only viewers simply do not see editing controls, which is clearer than disabled buttons.

## Findings

| ID | Priority | Finding |
|---|---|---|
| UX-01 | High | Mobile: one long file name pushes Size, Modified and the actions menu off-screen |
| UX-02 | High | The riskiest action, making the room public, is the most prominent and takes one click |
| UX-03 | Medium | Recipients cannot see who shared the documents with them |
| UX-04 | Medium | Failed sign-in is reported only by a toast in the far corner |
| UX-05 | Medium | Where inline PDF preview is unavailable, the viewer is an empty frame with a download button |
| UX-06 | Low | Room title has different styles on different pages |
| UX-07 | Low | Mobile header wraps into two rows |

### UX-01. Mobile: long file names break the table (High)

Screens: [mobile-05](ux/mobile-05-room-with-content.png), [mobile-07](ux/mobile-07-row-actions.png), [mobile-14](ux/mobile-14-public-link.png).

At 390 px a single long name (very common for legal documents: `share-purchase-agreement-final-v3-signed.pdf`) makes the whole table wider than the screen. Size, Modified and the `⋮` actions column move out of view for every row, not only the long one. When the user scrolls sideways to reach the actions, the names scroll away, so the open menu is no longer visibly tied to a file: easy to rename or delete the wrong document. In the public view the download buttons are hidden the same way.

Suggested fix: truncate the name with an ellipsis and a tooltip or second line, hide Size and Modified below a breakpoint (or move them under the name), keep the actions column pinned on the right.

### UX-02. Making the room public is the most prominent action (High)

Screens: [desktop-05](ux/desktop-05-room-with-content.png), [desktop-10](ux/desktop-10-share-dialog.png), [desktop-11](ux/desktop-11-share-link-created.png).

`Share` is the only filled blue button on every room and folder page, more prominent than Upload, which is what owners do most. Inside the dialog, `Create public link` immediately publishes the whole room to anyone with the URL: no confirmation, no summary of what becomes visible (all folders, including ones added later), no expiry, no password. For a data room this is the decision with the highest cost of error.

Suggested fix: make Upload the primary action and Share secondary; before creating a public link, show what will be exposed and ask to confirm; offer an expiry date as the default. Expiry and passwords are product decisions, the confirmation step is cheap.

### UX-03. Recipients do not see who shared (Medium)

Screens: [mobile-15](ux/mobile-15-shared-with-me.png), [desktop-14](ux/desktop-14-public-link.png).

"Shared with me" shows a folder name and a date. The public page shows the room name, which by default is the generic "My Data Room". Neither shows the owner or company. A recipient of confidential documents should know whose data room this is, and it also helps spot a link that came from the wrong place.

Suggested fix: show "Shared by Name (email)" on both screens; prompt the owner to name the room before the first share.

### UX-04. Sign-in error is far from the form (Medium)

Screen: [desktop-02](ux/desktop-02-login-error.png).

After a wrong password the form looks unchanged and the only feedback is a toast in the bottom-right corner, about 600 px away from where the user is looking, and it disappears on its own. Fields are not marked invalid.

Suggested fix: inline message above the button, `aria-invalid` on the fields, keep the typed email.

### UX-05. PDF viewer fallback (Medium, related to VDR-09)

Screen: [desktop-13](ux/desktop-13-file-viewer.png).

The screenshots run in headless Chromium, which has no built-in PDF plugin, so this shows exactly what users get in browsers or policies without it: a large empty frame, "This browser can't preview PDFs inline" and a Download button. Desktop Chrome with the plugin shows the PDF. For a data room, viewing without downloading is the core feature, so the product should not depend on the browser plugin (pdf.js renders in any browser and also makes watermarking possible later).

### UX-06. Inconsistent room title (Low)

Owner view: small regular title ([desktop-05](ux/desktop-05-room-with-content.png)). Public view and "Shared with me": larger bold title ([desktop-14](ux/desktop-14-public-link.png), [mobile-15](ux/mobile-15-shared-with-me.png)). One heading style for the page title everywhere.

### UX-07. Mobile header wraps (Low)

Screen: [mobile-05](ux/mobile-05-room-with-content.png).

At 390 px the user name and Sign out move to a second row, so about 90 px of the screen goes to navigation before any content. A compact menu for the account and Sign out would return that space. On the positive side, the drag-and-drop hint is correctly hidden on mobile.

## Next steps

1. Fix UX-01 and UX-02 before showing the product to real deal teams; both are small UI changes.
2. Run the same tour in WebKit (`--browser=webkit` project) to cover Safari.
3. Turn UX-01 into a visual regression check: the tour already produces the screenshots, `toHaveScreenshot` would lock them in.
