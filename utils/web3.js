const Web3 = require('web3')
const { toString, toNumber, startsWith, trim, get, compose, uniq, split } = require('lodash/fp')
const { BigNumber } = require('bignumber.js')
const Axios = require('axios')
const { usdtContractAddress, feToolsProxyUrl } = require('../config')

class Web3Helper {
  // 配置中设置合约地址
  constructor(contract = usdtContractAddress, decimals = 6) {
    const proxyUrl = feToolsProxyUrl
    this.contractAddress = contract
    this.axios = Axios.create({
      baseURL: proxyUrl
    })
    this.decimals = decimals
    this.gasLimit = 200000
    this.web3 = new Web3('https://mainnet.infura.io/v3/ff82f72e142b4c67b89119d9986a795b')
  }
  /**
   * uint256传参应该用字符串
   * erc20转账
   * @param {*} param0 
   */
  async getERC20Tx({ amount, fromAddress, toAddress, gasPrice, privateKey }) {
    if (toNumber(amount) < 0) {
      throw new Error('不能是负数')
    }
    let hexKey = privateKey && typeof privateKey === 'string' ? privateKey : privateKey.toString('hex')
    const account = this.web3.eth.accounts.privateKeyToAccount(hexKey.startsWith('0x') ? hexKey : `0x${hexKey}`)
    const [{ data }, contract] = await Promise.all([this.axios.post('/proxy/etherscan', {
      method: 'tokenbalance',
      params: [account.address, '', this.contractAddress]
    }), this.getERC20Contract(this.contractAddress)])
    if (BigNumber(data.data).div(`1e${this.decimals}`).lt(amount)) {
      throw new Error('余额不足')
    }
    const value = BigNumber(BigNumber(amount).times(`1e${this.decimals}`).toFixed(0))
    const nonce = await this.web3.eth.getTransactionCount(account.address, 'pending')
    const rawTransaction = {
      from: account.address,
      to: this.contractAddress,
      value: '0x0',
      gas: this.gasLimit,
      gasPrice: gasPrice ? this.web3.utils.toHex(BigNumber(this.web3.utils.toWei(toString(gasPrice), 'ether')).div(this.gasLimit).times('1e9').toNumber()) : undefined,
      nonce,
      data: contract.methods.transfer(toAddress, value.toString()).encodeABI(),
      // 主网chainId为1,ropsten为3
      chainId: 1
    }
    const signedTx = await account.signTransaction(rawTransaction)
    if (signedTx && signedTx.transactionHash) {
      const receipt = this.web3.eth.sendSignedTransaction(signedTx.rawTransaction)
      return signedTx.transactionHash
    } else {
      throw new Error('節點擁堵，請稍後再試')
    }
  }
  /**
   * 获取到合约对象，目前只通过etherscan
   * @param {*} contractAddress 
   */
  async getERC20Contract(contractAddress) {
    if (!this.contract) {
      const { data: abiResp } = await this.axios.post('/proxy/etherscan', {
        method: 'getabi',
        field: 'contract',
        params: [contractAddress]
      })
      const abi = JSON.parse(abiResp.data)
      const contract = new this.web3.eth.Contract(abi, contractAddress)
      this.contract = contract
      return contract
    } else {
      return this.contract
    }
  }
  /**
   * 获取erc20并解析
   * @param {*} hash 
   */
  async getERC20TxByHash(hash) {
    const { data } = await this.axios.post('/proxy/etherscan', {
      method: 'eth_getTransactionByHash',
      field: 'proxy',
      params: [hash]
    })
    const input = get('input')(data.data)
    if (input) {
      const value = BigNumber(parseInt(input.slice(75, 138), 16)).div(`1e${this.decimals}`).toNumber()
      return {
        to: `0x${input.slice(34, 74)}`,
        amount: value,
        constract: get('to')(data.data),
        from: get('from')(data.data)
      }
    } else {
      throw 'No input returns'
    }
  }

  /**
   * 返回私钥地址
   * @param {*} privateKey 
   */
  getAddressByPrivateKey(privateKey) {
    let hexKey = privateKey && typeof privateKey === 'string' ? privateKey : privateKey.toString('hex')
    const { address } = this.web3.eth.accounts.privateKeyToAccount(hexKey.startsWith('0x') ? hexKey : `0x${hexKey}`)
    return address
  }

}

module.exports = Web3Helper