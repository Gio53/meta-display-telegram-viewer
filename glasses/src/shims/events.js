// events shim: teleproto only calls setMaxListeners (a Node-only overload).
module.exports = { setMaxListeners: function () {} };
