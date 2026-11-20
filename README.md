FaceLock Messenger

FaceLock Messenger is a browser-based messaging application that combines face recognition-based unlocking with real-time chat through invite links. Face detection and recognition run locally in the browser, while chat messages are relayed through a Node.js server.

Features

- Face Unlock: Unlock the messenger using face recognition.
- Liveness Detection: Random challenges such as blinking twice, turning left, or turning right.
- Face Matching: Uses a 128-dimensional face descriptor and Euclidean distance matching.
- Continuous Face Monitoring: Checks the user's face once every second while unlocked.
- Real-Time Chat: Exchange messages with other members in the same room.
- Invite-Link Sharing: Invite friends using a temporary room link.
- Encrypted Face Storage: Stores face descriptors locally using AES-GCM encryption in IndexedDB.
- Automatic Reconnection: Reconnects after temporary network interruptions.
- Face Data Deletion: Allows users to delete stored biometric data.

Requirements

Before running the application, install:

- "Node.js" (https://nodejs.org/)
- npm (included with Node.js)
- A modern web browser with camera support

Installation and Setup

1. Clone or download the project and open the "facelock" folder.

2. Install the dependencies:

npm install

3. Start the application:

npm start

4. Open the application in your browser:

http://localhost:8080

Keep the terminal running while using the application. Camera access requires HTTPS or localhost.

Face Enrollment and Unlocking

After starting the application:

1. Enter your display name.
2. Allow camera access.
3. Enroll your face.
4. Complete the random liveness challenge.
5. Hold your face steady for 8 captures.
6. Complete face matching to unlock the messenger.

Sharing the Messenger with Friends

To allow another person to connect from a different device, create a temporary HTTPS tunnel using Cloudflare Tunnel.

1. Keep the Node.js server running in the first terminal.

2. Open a second terminal and execute:

npx --yes cloudflared tunnel --url http://localhost:8080

3. Wait for the terminal to generate an HTTPS URL similar to:

https://example.trycloudflare.com

4. Share the room invite link:

- Open the HTTPS URL on your computer.
- Copy the room invite link displayed in the application.
- Send the invite link to your friend.
- Both users open the same invite link.
- Each user enters their own display name and completes face enrollment and unlocking.

Note: Keep both terminals and your computer running while chatting. The temporary tunnel URL changes when the tunnel restarts. Anyone with the invite link can join.

For permanent access, deploy the Node.js application to a hosting provider that supports HTTPS and WebSockets. The "PORT" environment variable can be configured by the hosting provider.

Face Recognition and Security Mechanism

Component| Description
Face Descriptor| 128-number face descriptor
Matching Method| Euclidean distance
Matching Threshold| Less than 0.5
Frame Processing| Median of 5 frames
Liveness Detection| Random blink and head-turn challenges
Face Monitoring| Once every second
Stranger Detection| Locks after 3 stranger detection ticks
Face Storage| AES-GCM encryption in IndexedDB

The matching threshold can be modified using the "THRESH" variable in "face-lock.js".

Face Monitoring and Locking

The application continuously monitors the camera while the user is unlocked.

The chat interface becomes blurred when:

- No face is detected.
- More than one face is detected.
- An unknown person is detected.

If a stranger is detected for three consecutive monitoring ticks, the application automatically locks.

Users can also manually lock the messenger using the Lock now option.

Switching applications or leaving the chat idle does not automatically close or lock the room.

Chat Functionality

The application supports real-time messaging between connected room members.

- Messages are relayed through the Node.js server.
- Users can see the list of currently unlocked members.
- Locking or disconnecting removes the user from the online list.
- Unsent messages remain in the message box during temporary network interruptions.
- Messages are not permanently stored.
- Messages disappear when all participants leave the room.
- Anyone possessing the room invite link can join.

Data Storage and Privacy

- Face descriptors are encrypted using AES-GCM.
- Encryption keys are stored as non-extractable keys in IndexedDB.
- Face images and descriptors are never transmitted to the server.
- Users can delete stored biometric data using Delete face data.
- Chat messages are not permanently stored on the server.

Integration with Next.js

To integrate FaceLock Messenger into an existing Next.js application, follow these steps.

1. Copy the required files

Copy the following folders and files into:

public/face-lock/

- "vendor/"
- "models/"
- "face-lock.js"

2. Load the face-api script

Inside a ""use client"" component:

<Script src="/face-lock/vendor/face-api.js" />

3. Import the FaceLock module

const F = await import(
  /* webpackIgnore: true */
  "/face-lock/face-lock.js"
);

4. Initialize face recognition

Use the following functions from "face-lock.js":

F.init(video, "/face-lock/models");
F.liveness;
F.matchFace;
F.guard;

Refer to "app.js" for the complete implementation and usage.

Testing

Run the following command to execute the server tests:

npm test

Troubleshooting

Problem| Solution
Camera is busy| Close other applications or browser tabs using the camera.
Camera not accessible| Use localhost or an HTTPS connection.
Face not detected| Ensure proper lighting and position your face in front of the camera.
Application disconnects| Check your network connection.
Tunnel URL stops working| Restart the Cloudflare tunnel and share the new URL.

If startup reports that the camera is busy, close other applications accessing the camera and press Retry camera.

The application releases the camera when it locks.

Security Limitations

Important security considerations:

- A normal 2D camera cannot provide the depth sensing available in Apple Face ID hardware.
- A replayed video of the registered user may bypass liveness detection.
- Client-side JavaScript can be modified or bypassed.
- This implementation should be treated as an application lock, not a secure authentication system.
- Chat messages are not end-to-end encrypted. The server can read the messages.
- Always use HTTPS when deploying the application.
- Do not share sensitive information through this messenger.
- Obtain user consent before collecting biometric data and provide an option to delete it, considering India's Digital Personal Data Protection (DPDP) Act.

Recommended approach: Use WebAuthn passkeys with "userVerification: "required"" for actual server-side authentication instead of relying on browser-based face recognition.

Configuration

Setting| File| Purpose
"THRESH"| "face-lock.js"| Controls face-matching sensitivity
"PORT"| Server configuration| Sets the server port
Face Models| "models/"| Stores face recognition models
Face API| "vendor/"| Contains face-api.js dependencies

A lower matching threshold reduces false accepts but may increase false rejections. Tune it using your own test faces.

Technologies Used

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js
- Communication: WebSockets
- Face Recognition: face-api.js
- Face Storage: IndexedDB
- Encryption: AES-GCM
- Temporary HTTPS Tunnel: Cloudflare Tunnel
- Authentication Recommendation: WebAuthn Passkeys

Credits and Acknowledgements

- face-api.js: Vladimir Mandic (MIT).
- Original face-api.js: Vincent Mühler.

---

FaceLock Messenger – Face Recognition-Based Unlocking and Real-Time Messaging.
