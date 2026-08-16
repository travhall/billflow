# BillFlow — Manual Test Plan

## How to run the demo
A **flask icon (⚗️) button** sits in the bottom-right corner of the dashboard.
Click it to open the Feature Demo panel, which lets you trigger the overdue banner and send a test notification without needing real overdue bills.

---

## 1. Dashboard — Overdue Banner

| Step | Action | Expected result |
|------|--------|-----------------|
| 1a | Click the ⚗️ button (bottom-right) | Demo panel opens |
| 1b | Click **Show Banner** | Red overdue banner appears below the page title |
| 1c | Read the banner text | Shows "1 bill is overdue (demo)" with a Pay Demo Bill pill |
| 1d | Click **✕** on the banner | Banner dismisses |
| 1e | Click **Hide** in demo panel, then **Show Banner** again | Banner reappears (dismiss state resets) |

---

## 2. Browser Notifications

| Step | Action | Expected result |
|------|--------|-----------------|
| 2a | Open the ⚗️ demo panel | Shows "Enable Notifications" button if not yet granted |
| 2b | Click **Enable Notifications** | Browser permission prompt appears |
| 2c | Allow the permission | Button changes to "Send Test Notification" |
| 2d | Click **Send Test Notification** | OS notification appears: "🔔 BillFlow Test — Notifications are working!" |
| 2e | Reload the page | Notification fires again only if not already sent today (localStorage dedup) |
| 2f | Edit a bill → Payment Reminder section | Shows a dropdown to choose 0/1/3/5/7 days |
| 2g | Set reminder to "3 days before" → Save | Bill saved with reminderDays=3 |
| 2h | Reload the app | If bill is due within 3 days and unpaid, a notification fires |

---

## 3. Bill History Sheet

| Step | Action | Expected result |
|------|--------|-----------------|
| 3a | Click any bill name on the dashboard | Slide-out panel opens from the right |
| 3b | Check the header | Shows bill name, category, frequency, Auto Pay badge if applicable |
| 3c | Check the stats row | Payments count, Total Paid, Avg Amount filled correctly |
| 3d | Scroll the history list | Shows all payments with status color dots and paid dates |
| 3e | Click the ✕ to close | Panel closes |

---

## 4. Mark Paid + Cycle Reset

| Step | Action | Expected result |
|------|--------|-----------------|
| 4a | Click **Mark Paid** on a pending bill | Dialog opens with amount pre-filled |
| 4b | Note "Reset for next cycle" checkbox (checked by default) | Checkbox is visible |
| 4c | Submit | Bill marked paid; new pending record created for next cycle |
| 4d | Revert the payment (Undo button) | Bill returns to pending; next-cycle record removed |

---

## 5. Add Bill / Edit Bill

| Step | Action | Expected result |
|------|--------|-----------------|
| 5a | Click **+ Add Bill** | Dialog opens |
| 5b | Fill in name, category, amount, frequency, due day | Fields accept input |
| 5c | Set frequency to Yearly | Due Month selector appears |
| 5d | Toggle Auto Pay on | Saved with isAutoPay=true |
| 5e | Set Payment Reminder (after enabling notifications) | Dropdown shows 0–7 day options |
| 5f | Submit | Bill appears in dashboard table |
| 5g | Click edit (pencil icon) on the bill | Edit dialog pre-fills all fields |
| 5h | Change the amount and save | Dashboard reflects updated amount |

---

## 6. Upcoming Bills Page

| Step | Action | Expected result |
|------|--------|-----------------|
| 6a | Click **Upcoming** in sidebar | 3-month column view loads |
| 6b | Check current month column | Shows all bills with correct statuses |
| 6c | Check future months | Bills show as "Scheduled" |
| 6d | Progress bar | Fills proportionally to paid vs total |

---

## 7. Sorting & Filtering

| Step | Action | Expected result |
|------|--------|-----------------|
| 7a | Click **Bill Name** column header | Rows sort A→Z |
| 7b | Click again | Rows sort Z→A |
| 7c | Click **Amount** header | Rows sort by amount ascending |
| 7d | Click **Status** header | Paid bills group separately from pending |

---

## 8. Delete Bill

| Step | Action | Expected result |
|------|--------|-----------------|
| 8a | Click the trash icon on a bill | Confirmation dialog appears |
| 8b | Cancel | Bill remains |
| 8c | Confirm delete | Bill disappears from the list (archived) |

---

## 9. Budgets & Analytics

| Step | Action | Expected result |
|------|--------|-----------------|
| 9a | Go to the Analytics page | Summary cards, monthly chart, category donut, and budget limits section all load |
| 9b | Click the **+** next to a category with no limit set | Inline input appears |
| 9c | Enter an amount and submit | Limit saves; progress bar appears showing this month's spend vs. the limit |
| 9d | Spend past the limit for that category (mark a bill in that category paid) | Progress bar turns red; "Over by $X this month" text appears |
| 9e | Click the pencil icon on an existing limit | Inline input appears pre-filled with the current limit |
| 9f | Change the amount and save | Limit updates; progress bar recalculates |
| 9g | Click the trash icon while editing a limit | Confirmation not required — limit is removed immediately (hard delete, not archived) |
| 9h | Reload the page after removing a limit | Category shows "No limit set — click + to add one" again |
