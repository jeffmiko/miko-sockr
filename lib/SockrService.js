const { SockrHooks } = require("./SockrHooks")


class SockrService extends SockrHooks  {
  
  constructor() {
    super()
  }

  async add(params)    {  }
  async get(params)    {  }
  async find(params)   {  }
  async save(params)   {  }
  async remove(params) {  }

}



module.exports = SockrService
module.exports.SockrService = SockrService
