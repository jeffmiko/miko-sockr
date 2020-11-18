const { EventEmitter } = require("events")

class SockrHooks extends EventEmitter {

  #hookMethods = { }

  constructor() {
    super()
  }

  hooks() {
    let name = "_global_hooks"
    if (arguments.length > 1) throw new TypeError("Only one hook name is allowed.")
    if (arguments.length ==1) name = arguments[0]
    if (!this.#hookMethods[name]) this.#hookMethods[name] = new SockrHookMethods()
    return this.#hookMethods[name]
  }

}

class SockrHookMethods {

  #hookTypes = {
    before: [],
    after: [],
    error: null
  }

  before() {
    if (arguments.length == 0) return this.#hookTypes["before"]
    for(let arg of arguments) {
      if (typeof arg !== "function") throw new TypeError("Hooks must be functions")
      this.#hookTypes["before"].push(arg)
    }
    return this
  }

  after() {
    if (arguments.length == 0) return this.#hookTypes["after"]
    for(let arg of arguments) {
      if (typeof arg !== "function") throw new TypeError("Hooks must be functions")
      this.#hookTypes["after"].push(arg)
    }
    return this
  }

  error() {   
    if (arguments.length == 0) return this.#hookTypes["error"]
    for(let arg of arguments) {
      if (typeof arg !== "function") throw new TypeError("Hooks must be functions")
      this.#hookTypes["error"] = arg
    }
    return this
  }

}


module.exports.SockrHookMethods = SockrHookMethods
module.exports.SockrHooks = SockrHooks
