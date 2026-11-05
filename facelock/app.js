import * as F from './face-lock.js';
const $ = id => document.getElementById(id), v = $('v'), app = $('app');
const roomParam = new URLSearchParams(location.search).get('room');
const room = roomParam && /^[A-Za-z0-9_-]{6,32}$/.test(roomParam) ? roomParam : randomRoom();
if (room !== roomParam) {
  const url = new URL(location.href); url.searchParams.set('room', room); history.replaceState(null, '', url);
}
let tpl = null, stop = null, socket = null, strikes = 0, idle = 0, cameraReady = false;
const currentName = () => $('name').value.trim();
const inviteUrl = () => {
  const url = new URL(location.href);
  url.search = ''; url.searchParams.set('room', room);
  return url.href;
};
const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'bad' : ''; };
function cameraErrorMessage(error) {
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return 'Camera access was blocked. Allow camera access for this site in your browser settings, then tap Retry camera.';
  }
  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return 'No camera was found. Connect or enable a camera, then tap Retry camera.';
  }
  if (error.name === 'NotReadableError' || error.name === 'TrackStartError' || error.name === 'AbortError') {
    return 'The camera is busy or unavailable. Close other tabs or apps using the camera, then tap Retry camera.';
  }
  if (error.name === 'SecurityError') {
    return 'Camera access requires HTTPS or localhost. Open this site using its secure HTTPS link.';
  }
  return `Could not start: ${error.message}. Check your connection and camera access, then tap Retry camera.`;
}
function randomRoom() {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}
function setNetwork(state, text) {
  $('network').dataset.s = state;
  $('network').textContent = text;
  const connected = state === 'online';
  $('in').disabled = !connected;
  $('send').disabled = !connected;
}
function appendSystemMessage(text) {
  const item = document.createElement('p');
  item.className = 'system-message';
  item.textContent = text;
  $('log').append(item);
  $('log').scrollTop = $('log').scrollHeight;
}
function appendMessage({ name, text, fromSelf }) {
  const item = document.createElement('article');
  item.className = `m${fromSelf ? ' mine' : ''}`;
  const author = document.createElement('div');
  author.className = 'author';
  author.textContent = fromSelf ? `${name} (you)` : name;
  const body = document.createElement('div');
  body.textContent = text;
  item.append(author, body);
  $('log').append(item);
  $('log').scrollTop = $('log').scrollHeight;
}
function connectChat() {
  if (socket) socket.close();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const nextSocket = new WebSocket(`${protocol}//${location.host}/ws`);
  socket = nextSocket;
  setNetwork('connecting', 'Connecting');
  $('chatStatus').textContent = 'Connecting to the chat server…';
  $('log').replaceChildren();
  nextSocket.addEventListener('open', () => {
    if (socket !== nextSocket) return;
    nextSocket.send(JSON.stringify({ type: 'join', room, name: currentName() }));
  });
  nextSocket.addEventListener('message', event => {
    if (socket !== nextSocket) return;
    let data;
    try { data = JSON.parse(event.data); }
    catch { $('chatStatus').textContent = 'The server sent an unreadable response.'; return; }
    if (data.type === 'joined') {
      setNetwork('online', 'Connected');
      $('chatStatus').textContent = 'Connected. Messages are not saved after everyone leaves the room.';
    } else if (data.type === 'presence') {
      const members = Array.isArray(data.members) ? data.members : [];
      $('network').textContent = data.count === 1 ? 'You are alone' : `${data.count} unlocked`;
      $('members').textContent = members.length
        ? members.map(member => `${member.name}${member.name === currentName() ? ' (you)' : ''} — ${member.unlocked ? 'unlocked' : 'locked'}`).join(' · ')
        : 'Waiting for someone to unlock and join…';
    } else if (data.type === 'member_joined') {
      appendSystemMessage(`${data.name} unlocked and joined the chat.`);
    } else if (data.type === 'member_left') {
      appendSystemMessage(`${data.name} left the chat.`);
    } else if (data.type === 'message') appendMessage(data);
    else if (data.type === 'error') $('chatStatus').textContent = data.message;
  });
  nextSocket.addEventListener('close', () => {
    if (socket !== nextSocket) return;
    socket = null;
    setNetwork('offline', 'Disconnected');
    $('chatStatus').textContent = 'Disconnected from the chat server. Unlock again to reconnect.';
  });
  nextSocket.addEventListener('error', () => {
    if (socket === nextSocket) $('chatStatus').textContent = 'Could not reach the chat server. Check your connection and server URL.';
  });
}
async function copyInvite() {
  const link = inviteUrl();
  $('invite').value = link;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
    else {
      $('invite').focus(); $('invite').select();
      if (!document.execCommand('copy')) throw new Error('Clipboard access is unavailable.');
    }
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      say('Copied. This local link only works for testing on your computer; deploy the app over HTTPS to share it with your friend.');
    } else {
      say('Invite link copied. Send it to your friend.');
    }
  } catch (error) {
    say(`Could not copy the invite link: ${error.message}`, true);
    $('invite').focus(); $('invite').select();
  }
}
$('invite').value = inviteUrl();
['share', 'shareChat'].forEach(id => $(id).addEventListener('click', copyInvite));

async function refresh() {
  tpl = await F.loadTemplate();
  $('main').textContent = tpl ? 'Unlock with face' : 'Enroll my face'; $('wipe').hidden = !tpl; $('main').disabled = false;
  say(tpl ? 'Look at the camera, then press Unlock.' : 'No face enrolled yet. Enroll once to protect this chat.');
}
function unlock() {
  app.className = 'open'; $('lock').hidden = true; $('chat').hidden = false; strikes = 0; poke();
  connectChat();
  stop = F.guard(v, tpl, s => {
    $('state').textContent = s === 'ok' ? 'verified' : s; $('state').dataset.s = s; $('shield').hidden = s === 'ok';
    $('why').textContent = { absent: 'No face detected', multiple: 'Another face is in view', stranger: 'Unrecognised face. Locking…' }[s] || '';
    strikes = s === 'stranger' ? strikes + 1 : 0; if (strikes >= 3) lock();
  });
}
function lock() {
  stop?.(); stop = null;
  F.stopCamera(v); cameraReady = false;
  if (socket) { const activeSocket = socket; socket = null; activeSocket.close(); }
  app.className = 'locked'; $('chat').hidden = true; $('shield').hidden = true; $('lock').hidden = false; refresh();
}
const poke = () => { clearTimeout(idle); idle = setTimeout(() => stop && lock(), 60000); }; // auto-lock after 60 s idle
['pointermove', 'keydown'].forEach(e => addEventListener(e, () => stop && poke()));
document.addEventListener('visibilitychange', () => document.hidden && stop && lock());

$('main').onclick = async () => {
  $('main').disabled = true;
  try {
    if (!currentName() || currentName().length > 32 || /[\u0000-\u001f\u007f]/.test(currentName())) {
      say('Enter a display name of 1 to 32 characters without line breaks.', true);
      return;
    }
    if (!cameraReady) {
      say('Starting camera…');
      await F.init(v);
      cameraReady = true;
    }
    const ch = F.CHALLENGES[Math.random() * F.CHALLENGES.length | 0];
    if (!await F.liveness(v, ch, say)) return say('Liveness check failed. Press the button to try again.', true);
    if (!tpl) { say('Look straight at the camera…'); const t = await F.captureTemplate(v, 8, say); await F.saveTemplate(t); tpl = t; unlock(); }
    else { say('Matching…'); const r = await F.matchFace(v, tpl); r.ok ? unlock() : say(`Face not recognised${r.dist ? ` (distance ${r.dist.toFixed(2)})` : ''}. Try again in better light.`, true); }
  } catch (e) {
    if (!cameraReady) {
      say(cameraErrorMessage(e), true);
      $('main').textContent = 'Retry camera';
    } else {
      say(e.message, true);
    }
  } finally { $('main').disabled = false; }
};
$('wipe').onclick = async () => { if (confirm('Delete your stored face data from this device?')) { await F.deleteTemplate(); await refresh(); } };
$('lockBtn').onclick = lock;
$('f').onsubmit = e => {
  e.preventDefault();
  const text = $('in').value.trim();
  if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'message', text }));
  $('in').value = '';
};

(async () => {
  $('invite').value = inviteUrl();
  try { await F.init(v); cameraReady = true; await refresh(); }
  catch (e) {
    cameraReady = false;
    say(cameraErrorMessage(e), true);
    $('main').textContent = 'Retry camera';
    $('main').disabled = false;
  }
})();
