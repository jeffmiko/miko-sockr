const SockrApp  = require("./SockrApp")
const SockrUtils = require("./SockrUtils")
const redis = require("redis");

class SockrRedisApp extends SockrApp {
  
  #pub = null 
  #sub = null
  #options = {}

  constructor(options = {}) {
    super(options)
    // clone options rather then use options.redis
    this.#options = { }
    this.#options.host = options.redis.host || "127.0.0.1"
    this.#options.port = options.redis.port || 6379
    this.#options.ttl = options.redis.ttl || 10800
    this.#options.prefix = options.redis.prefix || "sockr#channels#"

    if (options.redis.retry_strategy) { 
      this.#options.retry_strategy = options.redis.retry_strategy
    } else { 
      this.#options.retry_strategy = (opts) => {
        // try to reconnect forever
        // delay 500ms per cummulative attempts up to 5secs
        return Math.min(opts.attempt * 500, 5000);
      }
    }

    this.#pub = redis.createClient(this.#options)
    this.#sub = redis.createClient(this.#options)
    this.#sub.psubscribe(`${this.#options.prefix}*`, function(error){
      if (error) {
        error.redis = this.#options
        this.emit("error", error )           
      }
    }.bind(this));
    this.#sub.on('pmessage', this.#onChannelMessage.bind(this));


  }

  // Broadcast simply sends to Redis
  broadcast(context, all=false) {
    context = SockrUtils.checkBroadcast(context, all)
    let data = JSON.stringify(context.response)
    if (context.response.header.channel) {
      this.#pub.publish(`${this.#options.prefix}${context.response.header.channel}`, data)
    } else {
      this.#pub.publish(`${this.#options.prefix}`, data)
    }
    return this
  }


  #onChannelMessage(pattern, channel, data) {
    let response = JSON.parse(data)
    let ch = channel.substr(this.#options.prefix.length)
    // Call parent class broadcast to send to clients
    SockrApp.prototype.broadcast.call(this, {response})
  }


  close() {
    SockrApp.prototype.close.call(this)
    if (this.#pub) this.#pub.quit()
    if (this.#sub) this.#sub.quit()
  }

}


module.exports = SockrRedisApp
module.exports.SockrRedisApp = SockrRedisApp