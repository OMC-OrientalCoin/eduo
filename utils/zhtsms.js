const qs = require('qs')
const axios = require('axios')
class ZHTSMSHelper {
  constructor() {
    this.userId = 15894
    this.account = 'cyt'
    this.pwd = 'cyt123456'
    this.http = axios.create({
      transformRequest: [qs.stringify],
      baseURL: 'http://121.43.192.197:8888',
    })
  }
  async getSMS({ mobile, message }) {
    const result = await this.http.post('/sms.aspx', {
      userid: this.userId,
      account: this.account,
      password: this.pwd,
      action: 'send',
      mobile,
      content: message
    })
    return result.data
  }
}

module.exports = ZHTSMSHelper