// Universal stub for Node built-ins that teleproto imports but never uses
// meaningfully in the browser (fs, path, os, net, tls, proxies, uploads).
// A Proxy returns a no-op function for any property, so calls like
// os.type() or path.join() don't explode in code paths we never hit.
module.exports = new Proxy(
  {},
  {
    get(target, prop) {
      if (prop === '__esModule') return false;
      if (prop === 'default') return undefined;
      return function () {
        return '';
      };
    },
  }
);
