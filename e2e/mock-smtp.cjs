#!/usr/bin/env node

/**
 * Purpose: Tiny mock SMTP server for the container smoke — speaks just
 *          enough protocol (220/EHLO/MAIL/RCPT/DATA/QUIT) to accept a
 *          message from nodemailer, and serves captured messages over
 *          HTTP for assertions. No deps, no TLS, test-only.
 * Author(s): John Reed
 */

const http = require('http');
const net = require('net');

const SMTP_PORT = Number(process.env.MOCK_SMTP_PORT || 2525);
const HTTP_PORT = Number(process.env.MOCK_SMTP_HTTP_PORT || 2526);

const messages = [];

const server = net.createServer((socket) => {
  let buffer = '';
  let inData = false;
  let current = { from: '', to: [], data: '' };

  socket.write('220 mock-smtp ready\r\n');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');

    for (;;) {
      const nl = buffer.indexOf('\r\n');
      if (nl === -1) break;
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);

      if (inData) {
        if (line === '.') {
          inData = false;
          messages.push({ ...current, receivedAt: new Date().toISOString() });
          current = { from: '', to: [], data: '' };
          socket.write('250 OK stored\r\n');
        } else {
          current.data += `${line}\n`;
        }
        continue;
      }

      const verb = line.split(' ')[0].toUpperCase();
      if (verb === 'EHLO' || verb === 'HELO') {
        socket.write('250-mock-smtp\r\n250 8BITMIME\r\n');
      } else if (verb === 'MAIL') {
        current.from = line;
        socket.write('250 OK\r\n');
      } else if (verb === 'RCPT') {
        current.to.push(line.replace(/^RCPT TO:\s*/i, ''));
        socket.write('250 OK\r\n');
      } else if (verb === 'DATA') {
        inData = true;
        socket.write('354 go ahead\r\n');
      } else if (verb === 'QUIT') {
        socket.write('221 bye\r\n');
        socket.end();
      } else if (verb === 'RSET' || verb === 'NOOP') {
        socket.write('250 OK\r\n');
      } else {
        socket.write('250 OK\r\n'); // permissive — this is a capture rig, not a validator
      }
    }
  });
});

const api = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ count: messages.length, messages }));
});

server.listen(SMTP_PORT, () => {
  console.log(`mock smtp listening on :${SMTP_PORT}...`);
});
api.listen(HTTP_PORT, () => {
  console.log(`captured messages served on :${HTTP_PORT}...`);
});
