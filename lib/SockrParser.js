
class SockrParser {

  static json() {

    return async function(data) {
      let context = {
        request:  { },
        response: { },
      }
      try {
        let msg = JSON.parse(data)
        if (!msg) throw new TypeError("No message found.")
        if (msg.header) context.request.header = msg.header
        else throw new TypeError("No message header found.")
        if (!context.request.header.service) throw new TypeError("No service found in message header.")
        if (!context.request.header.method) throw new TypeError("No method found in message header.")
        if (msg.params) context.request.params = msg.params
      } catch (error) {
        context.response.error = error
      }
      return context
    }

  }

}


module.exports = SockrParser