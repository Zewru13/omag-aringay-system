# Help, the BasaJuan way: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The User Manual becomes **Help**, laid out and working like BasaJuan's Help page.

**Architecture:** A topic tree per account type (plain data) names the pictures of each topic; the page shows one topic from the
address. The screenshot tool keeps making the pictures and their number lists, now drawing red circles, arrows and boxes, with
the circle placement in a small pure module.

**Tech Stack:** React 19 + Vite, `node --test`, headless Chrome (scripts/manual).

**Spec:** `docs/superpowers/specs/2026-11-28-basajuan-audit-backup-manual-design.md`, "Changes the user asked for after Part 2
went live" and Part 3. User approved with "proceed" (2026-11-28).

## Global Constraints

- Branch `help-basajuan` from `master`. No commit, push, PR or merge until the user says so. No server or database change.
- Pictures only from the throwaway system with sample records. Never the live site, never real people.
- Menu entry, page title and address are **Help** (`/help`); `/manual` and `/my-help` lead there.
- One topic at a time. Top: "Help" and "N topics · <account types>". Right: **Search help**, then the topic list grouped by
  account type, following the menu, groups that open, its own scrollbar, the open topic highlighted. Phone: a **Topics** button.
- A topic: title, one line, picture(s), **Enlarge**; several pictures: arrows, dots, "1 of 3", swipe. Then one numbered list
  (the shown picture's numbers; every explanation kept) and one tip with a light bulb.
- Pictures: red boxes, white numbered circles with a red ring, red arrows.
- Admin sees every group; others only their own. Common questions and About This System are topics.
- Print / Save as PDF and the introduction sections are removed. Our colors; works on a phone.
- Each topic and picture has its own address, so Back and reload stay on it.

## Review Focus

- A topic or picture number in the address that does not exist (old bookmark): show the first topic, never a blank page.
- Another account type's topic typed into the address by a non-Admin: not shown.
- A crowded picture: every number stays readable, inside the picture and not on top of another number.
- A topic with one picture shows no arrows or dots.
- Search with no match says so; a match on a button name opens that topic on the picture that has the button.

---

### Task 1: Topics (data) — `src/pages/Help/helpTopics.js`, `tests/helpTopics.test.mjs`
- [ ] `topicTree(audience)`: `[{id, title, about, screens: [ids], tip}]` or `{id, title, topics: [...]}`, following the menu.
  `flatTopics(audience)`, `groupsFor(accountAudience)` (Admin: all five), `findTopic(groups, key)` with key `audience.id`,
  `topicCount(groups)`, `searchTopics(groups, query)` → `[{key, picture}]` (title, about, tip, picture titles, labels, descriptions,
  questions). Tests: every screen id has a picture file; every menu entry of the staff Sidebar and of each citizen menu has a
  topic; Focal Person has no Admin topics; every existing screen is in some topic.

### Task 2: The page — `HelpPage.jsx`, `HelpTopicList.jsx`, `HelpTopicView.jsx`, `HelpPicture.jsx`
- [ ] Page checks first in `tests/helpPage.test.mjs` (the Global Constraints' words and parts), then the components. Address:
  `/help?topic=admin.dashboard&picture=2`. Remove ManualBody, ManualSearchBox, manualSearch, manualPrint and their tests.

### Task 3: Rename — App routes, Navbar, StaffPhoneShell, accountNav, MoreScreen/FarmerChrome labels, tests
- [ ] Every "User Manual" the person can read becomes "Help"; `/help` renders the page; `/manual`, `/my-help` redirect.

### Task 4: Red numbers and arrows — `scripts/manual/placeMarkers.mjs`, `shoot.mjs`, `tests/placeMarkers.test.mjs`
- [ ] `placeMarkers(boxes, viewport, size) -> [{cx, cy, arrow: null | {x1, y1, x2, y2}}]`: try above, left, right, below; take
  the first place inside the picture that touches no other box or circle; otherwise the box's corner without an arrow. Tests: a
  lone box gets an arrow; circles never overlap or leave the picture; a crowded row still gets every number.

### Task 5: Sample for the user — retake the pictures of a few topics (Dashboard, one with several pictures, one phone)
- [ ] Browser check, computer and phone. **Stop: show the user and wait.**

### Task 6 (after the user agrees): every picture retaken, screen specs brought up to today's system
- [ ] For each screen: `INVENTORY` lists the controls; fix callouts and words; add screens for pages without one (Audit Log,
  Backup & Restore, each settings page); `shoot.mjs` reports no missing callout. Cover what changed since the last pictures
  (one help page, 3-step Add Farm Parcels, no disaster suggestions, "Cooperative", assistance schedule and place,
  notification details and change requests in the bell, cooperative logging, the Audit Log, former members, Backup & Restore).

### Task 7: Prove it
- [ ] `npm test`, build, lint; every topic of every account opened in a test browser, computer and phone; then ask the user
  before commit and merge, and offer a separate review.
