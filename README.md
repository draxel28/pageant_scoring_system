# Pageant Scoring System

A local, offline scoring system: judges enter scores on their laptops, and results
show live on a big screen / LED display. No internet required — everything runs
over a local WiFi network.

## What you need
- 1 laptop to act as the **server** (runs this software) — the organizer's or the tech team's laptop.
- 1 WiFi router (or the server laptop's own mobile hotspot). No internet needed, just a local network.
- Judges' laptops (any device with a browser: laptop, tablet, phone).
- 1 laptop/PC connected to the **LED display** via HDMI, running a browser.
- [Node.js](https://nodejs.org) installed on the server laptop (version 18+; this was built and tested on v22).

## One-time setup
1. Copy this whole `pageant-system` folder onto the server laptop.
2. Open a terminal in that folder and run:
   ```
   npm install
   npm start
   ```
3. The terminal will print a URL like `http://192.168.1.5:3000/admin.html` — that's
   your server's address on the local network. Write it down / keep the terminal open
   throughout the event.

## On event day
1. **Connect everyone to the same WiFi network**: the server laptop, every judge's
   laptop, and the display laptop must all join the same router/hotspot.
2. On the **server laptop**, open `http://localhost:3000/admin.html` — this is your
   control panel.
3. On the **display laptop** (connected to the LED screen), open
   `http://<server-ip>:3000/display.html`, then fullscreen the browser (F11).
4. On each **judge's laptop**, open `http://<server-ip>:3000/judge.html`.

## Using the Admin panel
1. **Add contestants** (number + name).
2. **Add judges** — each judge gets an auto-generated 4-digit PIN. Write each
   judge's PIN on a card and hand it to them; that's how they log in.
3. **Create segments** (e.g. "Casual Wear", "Talent", "Q&A"), and for each one add
   its scoring criteria with a max score (e.g. "Poise" out of 25).
4. When it's time for a segment, click **Set Active** — this is what shows up on
   judges' screens.
5. The **Live Submission Tracker** shows a checkmark grid so you can see at a
   glance who has and hasn't submitted.
6. When all judges are done, tick **revealed** next to that segment — this is what
   flips the big screen from "Judges are scoring..." to the actual ranked results.
   Keeping reveal OFF until everyone's in avoids one judge's score visibly moving
   the board before others finish.
7. **Export CSV** any time for a full backup of every score, by every judge, per
   criterion — useful for audits or resolving disputes.

## Judges' experience
- Judge opens the page, types their PIN once (it's remembered on that laptop).
- They see the active segment and every contestant with input boxes for each
  criterion, capped to the max you set.
- They can update a score any time before you reveal it.

## Display screen
- Shows the segment name, a "judging in progress" animation while hidden, and a
  live ranked table (with score) once you reveal it — this is the transparency
  piece: everyone in the room sees the same numbers the judges entered.
- There's also an **overall leaderboard** available at
  `http://<server-ip>:3000/api/results-overall` if you want to build a "grand
  finale" summary — ask me and I can add a dedicated Overall screen too.

## Notes on transparency & integrity
- Scores are timestamped by submission and stored in `data.json` — keep a backup
  copy of that file after the event.
- Consider printing/exporting the CSV at the end of each segment as a signed
  paper record, in case anyone disputes a result later.
- The "reveal" toggle is manual and only the organizer controls it — judges never
  see each other's live scores, which prevents anchoring bias.

## If something goes wrong mid-event
- The server laptop is the single source of truth. If a judge's laptop crashes or
  disconnects, just reopen `judge.html` and log in again — their prior submitted
  scores are safe (stored server-side, not on their laptop).
- If the **server laptop itself** restarts, just run `npm start` again in the same
  folder — `data.json` preserves everything already entered.
