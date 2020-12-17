const nodemailer = require('nodemailer')
class MailHelper {
  constructor({ host, port, user, pass } = Object.create(null)) {
    // this.from = user ||  '752947779@qq.com'
    this.from = user ||  'shishangTV@163.com'
    this.transporter = nodemailer.createTransport({
      service: 'smtp.163.com',
      // service: 'gmail',
      // auth: {
      //   user: this.from,
      //   pass: pass
      // }
      // host: host || 'smtp.qq.com',
      host: host || 'smtp.163.com',
      port: port || 465,
      secureConnection: true,
      // secure: true, // secure:true for port 465, secure:false for port 587
      auth: {
        user: this.from,
        // pass: pass || 'vuwgwroatphebdde' //  授权码，不是qq密码或者独立密码
        pass: pass || 'KOMBFDEYVTYLYRZK' //  授权码，不是qq密码或者独立密码
      }
    })
  }
  /**
 * 发送邮件
 * @param {*} param0 
 */
  async mail({ from = this.from, to = this.from, subject = '清单', text = '', }) {
    let mailOptions = {
      from,
      to,
      subject,
      text
    }
    const result = await this.transporter.sendMail(mailOptions)
    return result
  }

}

module.exports = MailHelper