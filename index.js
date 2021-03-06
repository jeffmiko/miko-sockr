const { SockrHooks, SockrHookMethods } = require("./lib/SockrHooks")
const { SockrService } = require("./lib/SockrService")
const { SockrApp, SockrAuth } = require("./lib/SockrApp")
const { SockrRedisApp } = require("./lib/SockrRedisApp")
const { SockrHookUtils, SockrAfterHooks, SockrBeforeHooks } = require("./lib/SockrHookUtils")
const { SockrUtils } = require("./lib/SockrUtils")

function create(options = {}) {
  const app = new SockrApp(options)
  return app
}

module.exports = create
module.exports.SockrApp = SockrApp
module.exports.SockrAuth = SockrAuth
module.exports.SockrRedisApp = SockrRedisApp
module.exports.SockrService = SockrService
module.exports.SockrHooks = SockrHooks
module.exports.SockrHookMethods = SockrHookMethods

module.exports.SockrHookUtils = SockrHookUtils
module.exports.SockrAfterHooks = SockrAfterHooks
module.exports.SockrBeforeHooks = SockrBeforeHooks
module.exports.SockrUtils = SockrUtils
