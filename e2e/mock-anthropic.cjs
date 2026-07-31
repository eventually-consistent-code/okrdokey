#!/usr/bin/env node

/**
 * Purpose: Tiny mock Anthropic API for e2e + container smoke — answers
 *          GET /v1/models (key validation) and POST /v1/messages with a
 *          canned structured-output payload. No SDK, no deps, no network.
 * Author(s): John Reed
 */

const http = require('http');

const PORT = Number(process.env.MOCK_PORT || 3998);

const SUGGESTIONS = {
  suggestions: [
    { title: 'Grow weekly active users from 100 to 250', type: 'numeric', unit: 'users', baseline: 100, target: 250, rationale: 'Usage is the outcome; replace the placeholder baseline with your real number.' },
    { title: 'Reduce churn from 5% to 2%', type: 'numeric', unit: '%', baseline: 5, target: 2, rationale: 'Decreasing-is-good outcome.' },
    { title: 'Raise NPS from 30 to 45', type: 'numeric', unit: 'pts', baseline: 30, target: 45, rationale: 'Verifiable satisfaction metric.' },
  ],
};

const FEEDBACK = {
  critique: ['"Launch" is a task, not an outcome', 'No metric attached — what number changes?'],
  rewrite: { title: 'Grow newsletter subscribers from 0 to 500', type: 'numeric', unit: 'subs', baseline: 0, target: 500, rationale: 'Countable outcome.' },
};

function message(payload) {
  return JSON.stringify({
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-8',
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 100 },
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ data: [{ id: 'claude-opus-4-8' }] }));
  }
  if (req.method === 'POST' && req.url.startsWith('/v1/messages')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const improve = body.includes('Critique it');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(message(improve ? FEEDBACK : SUGGESTIONS));
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'not found' } }));
});

server.listen(PORT, () => {
  console.log(`mock anthropic listening on :${PORT}...`);
});
