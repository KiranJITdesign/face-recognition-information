# FaceLock Messenger
In-browser face unlock and a real-time, invite-link chat. Face detection runs locally; chat messages are relayed through the Node server.

## Run
    npm install
    npm start

Open http://localhost:8080. Camera access requires localhost or HTTPS. Enter a display name, enroll your face, pass the liveness prompt, and hold still for 8 captures. Copy the room invite link and send it to your friend. Your friend opens the same hosted link, enrolls their own face, and unlocks to join.

To share with someone else, deploy this Node app to a host that supports WebSockets and HTTPS, then send the invite link from the deployed site. A localhost link only works on your own computer. `PORT` can be set by the hosting provider.

Run the server tests with `npm test`.

If startup reports that the camera is busy, close other browser tabs or apps using the camera and press **Retry camera**. The app releases the camera when it locks.

## What it does
- **Liveness:** random challenge (blink twice / turn left / turn right) before enroll and unlock.
- **Match:** 128-number face descriptor, median of 5 frames, Euclidean distance < 0.5 (`THRESH` in `face-lock.js`).
- **Guard:** once a second while unlocked. Blurs the chat if no face, a second face, or a stranger; locks after 3 stranger ticks, 60 s idle, or tab switch.
- **Storage:** face descriptor encrypted with a non-extractable AES-GCM key in IndexedDB. No face images or descriptors are sent to the server. "Delete face data" wipes both.
- **Chat:** live room messages are relayed to connected room members. Messages are not saved and disappear when everyone leaves. Anyone with the invite link can join.
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
