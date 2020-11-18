const { SockrHooks, SockrHookMethods } = require("./hooks")
const { SockrService } = require("./service")
const { SockrApp } = require("./app")

function create(options = {}) {
  const app = new SockrApp(options)
  return app
}

module.exports = create
module.exports.SockrApp = SockrApp
module.exports.SockrService = SockrService
module.exports.SockrHooks = SockrHooks
module.exports.SockrHookMethods = SockrHookMethods

