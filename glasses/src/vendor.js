/* Entry for the lazy-loaded MTProto bundle. Exposes everything the app
   needs on window.TG. Loaded on demand to keep first paint under budget. */

const telegram = require('teleproto');
const { StringSession } = require('teleproto/sessions');
const { computeCheck } = require('teleproto/Password');
const { PromisedWebSockets } = require('teleproto/extensions');

window.TG = {
  TelegramClient: telegram.TelegramClient,
  Api: telegram.Api,
  StringSession,
  computeCheck,
  PromisedWebSockets,
};
