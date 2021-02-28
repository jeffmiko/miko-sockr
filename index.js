const { SockrHooks, SockrHookMethods } = require("./lib/SockrHooks")
const { SockrService } = require("./lib/SockrService")
const { SockrApp } = require("./lib/SockrApp")

function create(options = {}) {
  const app = new SockrApp(options)
  return app
}

module.exports = create
module.exports.SockrApp = SockrApp
module.exports.SockrService = SockrService
module.exports.SockrHooks = SockrHooks
module.exports.SockrHookMethods = SockrHookMethods

