// node:timers/promises shim (signal option not needed in the browser build).
module.exports = {
  setTimeout: function (ms) {
    return new Promise(function (resolve) {
      globalThis.setTimeout(resolve, ms);
    });
  },
};
