const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const WebSocket = require('ws');
const { createAppServer } = require('./server');

const server = createAppServer();
const clients = [];

after(async () => {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) client.terminate();
  }
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

function waitForMessage(client, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('message', onMessage);
      reject(new Error('Timed out waiting for a chat server message.'));
    }, 2000);
    const onMessage = raw => {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      client.off('message', onMessage);
      resolve(message);
    };
    client.on('message', onMessage);
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(url);
    clients.push(client);
    client.once('open', () => resolve(client));
    client.once('error', reject);
  });
}

test('serves the app and relays messages only to their room', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Shared chat/);
  assert.equal((await fetch(`${baseUrl}/server.js`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/package.json`)).status, 404);

  const first = await connect(`ws://127.0.0.1:${address.port}/ws`);
  const firstJoined = waitForMessage(first, message => message.type === 'joined');
  first.send(JSON.stringify({ type: 'join', room: 'room-one', name: 'Alice' }));
  await firstJoined;

  const second = await connect(`ws://127.0.0.1:${address.port}/ws`);
  const secondJoined = waitForMessage(second, message => message.type === 'joined');
  second.send(JSON.stringify({ type: 'join', room: 'room-one', name: 'Bob' }));
  await secondJoined;

  const firstMessage = waitForMessage(first, message => message.type === 'message');
  const secondMessage = waitForMessage(second, message => message.type === 'message');
  first.send(JSON.stringify({ type: 'message', text: 'Hello, Bob!' }));
  const receivedFirst = await firstMessage;
  const receivedSecond = await secondMessage;
  assert.equal(receivedFirst.name, 'Alice');
  assert.equal(receivedFirst.text, 'Hello, Bob!');
  assert.equal(receivedFirst.fromSelf, true);
  assert.equal(receivedSecond.fromSelf, false);
  assert.equal(receivedSecond.at, receivedFirst.at);

  const otherRoom = await connect(`ws://127.0.0.1:${address.port}/ws`);
  const otherJoined = waitForMessage(otherRoom, message => message.type === 'joined');
  otherRoom.send(JSON.stringify({ type: 'join', room: 'room-two', name: 'Charlie' }));
  await otherJoined;
  const isolated = new Promise(resolve => {
    otherRoom.once('message', raw => resolve(JSON.parse(raw.toString())));
    setTimeout(() => resolve(null), 300);
  });
  first.send(JSON.stringify({ type: 'message', text: 'Only room one' }));
  assert.equal(await isolated, null);
});
