# FaceLock Messenger
In-browser face unlock and a real-time, invite-link chat. Face detection runs locally; chat messages are relayed through the Node server.

## Run on your computer

Install [Node.js](https://nodejs.org/) first. In a terminal, open the `facelock` folder and run:
.

    npm install
    npm start

Keep this terminal open while using the app. Open http://localhost:8080 on your computer. Camera access requires localhost or HTTPS. Enter a display name, enroll your face, pass the liveness prompt, and hold still for 8 captures.

## Share with a friend for a temporary test

`localhost` only works on your own computer. To let a friend on another phone connect, start a temporary HTTPS tunnel in a **second terminal**, leaving `npm start` running in the first:

    npx --yes cloudflared tunnel --url http://localhost:8080

Wait for the terminal to print a URL like `https://example.trycloudflare.com`. Open that URL on your computer, copy the room invite link shown in the app, and send the invite link to your friend. Both of you open the same invite link, enter your own display names, and enroll/unlock on your own devices.

Keep both terminals and your computer running while chatting. The temporary tunnel URL changes when the tunnel restarts and stops working if either process exits. Anyone with the invite link can join. For a permanent link, deploy this Node app to a host that supports WebSockets and HTTPS. `PORT` can be set by the hosting provider.

Run the server tests with `npm test`.

If startup reports that the camera is busy, close other browser tabs or apps using the camera and press **Retry camera**. The app releases the camera when it locks.

## What it does
- **Liveness:** random challenge (blink twice / turn left / turn right) before enroll and unlock.
- **Match:** 128-number face descriptor, median of 5 frames, Euclidean distance < 0.5 (`THRESH` in `face-lock.js`).
- **Guard:** once a second while unlocked. Blurs the chat if no face, a second face, or a stranger; locks after 3 stranger ticks. Switching apps or leaving the chat idle does not close or lock the room; use **Lock now** to lock manually.
- **Storage:** face descriptor encrypted with a non-extractable AES-GCM key in IndexedDB. No face images or descriptors are sent to the server. "Delete face data" wipes both.
- **Chat:** live room messages are relayed to connected room members. The app reconnects after temporary network or tab-suspension interruptions and keeps unsent text in the message box. Messages are not saved and disappear when everyone leaves. Anyone with the invite link can join.
- **Unlock presence:** after a person passes face matching and joins the room, everyone sees their name listed as unlocked. Locking or disconnecting removes them from the online list.

## Add to your Next.js messenger
1. Copy `vendor/`, `models/`, `face-lock.js` into `public/face-lock/`.
2. In a `"use client"` component load `<Script src="/face-lock/vendor/face-api.js" />`, then `const F = await import(/* webpackIgnore: true */ "/face-lock/face-lock.js")`.
3. Call `F.init(video, "/face-lock/models")`, `F.liveness`, `F.matchFace`, and `F.guard` as `app.js` does.

## Security limits (read this)
- A 2D camera is not Face ID's depth sensor. A replayed video of you can pass. Treat this as an **app lock**, not authentication.
- It runs on the client, so anyone who can edit the page's JavaScript can bypass it. Keep server login on **WebAuthn passkeys** (`userVerification: "required"`), which is the real Face ID/Touch ID.
- Chat messages are **not end-to-end encrypted**. The server relays them as readable text; use HTTPS in deployment and do not send sensitive information.
- Face data is biometric data. Get consent and offer deletion (India's DPDP Act).
- Tune `THRESH` on your own test faces. Lower means fewer false accepts, more false rejects.

Credits: face-api.js by Vladimir Mandic (MIT), based on face-api.js by Vincent Mühler.
