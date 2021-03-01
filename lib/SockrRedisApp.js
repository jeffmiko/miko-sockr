const SockrApp  = require("./SockrApp")
const SockrUtils = require("./SockrUtils")
const redis = require("redis");

class SockrRedisApp extends SockrApp {
  
  #pub = null 
  #sub = null
  #options = {}

  constructor(options = {}) {
    super(options)
    if (!options.redis) options.redis = {}
    if (!options.redis.host) options.redis.host = "127.0.0.1"
    if (!options.redis.port) options.redis.port = 6379
    if (!options.redis.ttl) options.redis.ttl = 10800
    if (!options.redis.prefix) options.redis.prefix = "sockr#channels#"
    if (!options.redis.retry_strategy) { 
      options.redis.retry_strategy = (options) => {
        // try to reconnect forever
        // delay 500ms per cummulative attempts up to 5secs
        return Math.min(options.attempt * 500, 5000);
      }
    }
    this.#options = options.redis

    this.#pub = redis.createClient(options.redis)
    this.#sub = redis.createClient(options.redis)
    this.#sub.psubscribe(`${options.redis.prefix}*`, function(error){
      if (error) {
        error.redis = options.redis
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