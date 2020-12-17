const CryptoJS = require('crypto-js');

const cryptoParams = {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
}
const cryptoHelper = {

  encrypt: (data, key) => {
    return CryptoJS.AES.encrypt(JSON.stringify(data), key, cryptoParams).toString();
  },

  decrypt: (encryptedData, key) => {
    const bytes = CryptoJS.AES.decrypt(encryptedData, key, cryptoParams);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  },

}

module.exports = cryptoHelper;